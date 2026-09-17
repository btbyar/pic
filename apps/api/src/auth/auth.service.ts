import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type PrismaClient, type User } from '@pic/db';
import { AuditService } from '../audit/audit.service';
import type { Env } from '../config/env';
import { FieldCipher, hashIp, randomToken, sha256Hex } from '../common/crypto';
import { RateLimiter, type RateLimitRule } from '../common/rate-limiter';
import { PRISMA } from '../prisma/prisma.module';
import { EMAIL_QUEUE, type EmailQueue } from '../queue/queue.module';
import { isMfaRequired } from './access-policy';
import type {
  LoginInput,
  MfaVerifyInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RegisterInput,
} from './auth.schemas';
import type { AuthContext } from './decorators';
import { hashPassword, verifyPassword } from './password';
import { generateRecoveryCodes, hashRecoveryCode } from './recovery-codes';
import { checkTotp, newTotpSecret, totpUri } from './totp';

const HOUR_MS = 60 * 60 * 1000;
const SESSION_TTL_MS = { PHOTOGRAPHER: 7 * 24 * HOUR_MS, ADMIN: 12 * HOUR_MS } as const;
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

const LOGIN_BY_EMAIL: RateLimitRule = { name: 'login:email', limit: 5, windowSec: 15 * 60 };
const LOGIN_BY_IP: RateLimitRule = { name: 'login:ip', limit: 30, windowSec: 15 * 60 };
const REGISTER_BY_IP: RateLimitRule = { name: 'register:ip', limit: 5, windowSec: 60 * 60 };
const MFA_BY_USER: RateLimitRule = { name: 'mfa:user', limit: 5, windowSec: 15 * 60 };
const RESET_BY_IP: RateLimitRule = { name: 'reset:ip', limit: 10, windowSec: 60 * 60 };
const RESET_BY_EMAIL: RateLimitRule = { name: 'reset:email', limit: 3, windowSec: 60 * 60 };
const RESET_CONFIRM_BY_IP: RateLimitRule = { name: 'reset-confirm:ip', limit: 20, windowSec: 15 * 60 };
export const PASSWORD_RESET_TTL_MIN = 30;

export interface RequestMeta {
  ip: string;
  userAgent?: string;
}

export type MfaState = 'none' | 'required' | 'setup_required';

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  mfa: MfaState;
}

@Injectable()
export class AuthService {
  private readonly cipher: FieldCipher;
  private readonly ipSecret: string;
  private readonly adminMfaRequired: boolean;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly rateLimiter: RateLimiter,
    @Inject(EMAIL_QUEUE) private readonly emailQueue: EmailQueue,
    config: ConfigService<Env, true>,
  ) {
    this.cipher = new FieldCipher(config.get('FIELD_ENCRYPTION_KEY', { infer: true }));
    this.ipSecret = config.get('IP_HASH_SECRET', { infer: true });
    this.adminMfaRequired = config.get('ADMIN_MFA_REQUIRED', { infer: true });
    if (!this.adminMfaRequired) this.logger.warn('ADMIN_MFA_REQUIRED=false — админы 2FA унтарсан (зөвхөн хөгжүүлэлтэд)');
  }

  // ---------------------------------------------------------------- бүртгэл, нэвтрэлт

  async registerPhotographer(input: RegisterInput, meta: RequestMeta): Promise<IssuedSession> {
    const ipHash = hashIp(meta.ip, this.ipSecret);
    await this.rateLimiter.consume(REGISTER_BY_IP, ipHash);

    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: 'PHOTOGRAPHER',
          status: 'PENDING',
          displayName: input.displayName,
          phone: input.phone ?? null,
          photographerProfile: { create: {} },
        },
      });
      return this.issueSession(user, meta);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({ statusCode: 409, code: 'email_taken' });
      }
      throw err;
    }
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<IssuedSession> {
    const ipHash = hashIp(meta.ip, this.ipSecret);
    const emailKey = sha256Hex(input.email);
    await this.rateLimiter.consume(LOGIN_BY_IP, ipHash);
    await this.rateLimiter.consume(LOGIN_BY_EMAIL, emailKey);

    const user = await this.prisma.user.findFirst({ where: { email: input.email, deletedAt: null } });
    const ok = await verifyPassword(user?.passwordHash ?? null, input.password);
    if (!user || !ok) {
      // Имэйл байгаа эсэхийг задруулахгүй: нэг ижил алдаа
      throw new UnauthorizedException({ statusCode: 401, code: 'invalid_credentials' });
    }
    if (user.status === 'SUSPENDED' || user.status === 'REJECTED') {
      throw new ForbiddenException({ statusCode: 403, code: 'account_inactive' });
    }

    await this.rateLimiter.reset(LOGIN_BY_EMAIL, emailKey);
    const session = await this.issueSession(user, meta);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    if (user.role === 'ADMIN') {
      await this.audit.log({
        actorId: user.id,
        actorRole: user.role,
        action: 'auth.login',
        entityType: 'user',
        entityId: user.id,
        after: { mfa: session.mfa },
        ipHash,
      });
    }
    return session;
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.authSession.deleteMany({ where: { id: sessionId } });
  }

  /** Cookie токеноос нэвтрэлтийн мэдээлэл. Хугацаа дууссан/идэвхгүй бол null. */
  async resolveSession(token: string): Promise<AuthContext | null> {
    const sessionId = sha256Hex(token);
    const session = await this.prisma.authSession.findUnique({ where: { id: sessionId }, include: { user: true } });
    const now = Date.now();
    if (!session || session.expiresAt.getTime() <= now || session.user.deletedAt) {
      if (session) await this.logout(sessionId);
      return null;
    }

    const { user } = session;
    if (now - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      // Зурагчны session идэвхтэй байх тусам сунгагдана; админых үгүй (абсолют 12 цаг)
      const data: Prisma.AuthSessionUpdateInput = { lastSeenAt: new Date(now) };
      if (user.role === 'PHOTOGRAPHER') data.expiresAt = new Date(now + SESSION_TTL_MS.PHOTOGRAPHER);
      await this.prisma.authSession.update({ where: { id: sessionId }, data });
    }

    return {
      sessionId,
      userId: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      mfaRequired: isMfaRequired(user.role, user.totpEnabledAt !== null, this.adminMfaRequired),
      mfaPassed: session.mfaPassedAt !== null,
    };
  }

  async me(auth: AuthContext) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      displayName: user.displayName,
      mfa: {
        enabled: user.totpEnabledAt !== null,
        required: auth.mfaRequired,
        passed: auth.mfaPassed,
      },
    };
  }

  // ---------------------------------------------------------------- нууц үг сэргээх

  /**
   * Имэйл бүртгэлтэй эсэхээс үл хамааран ижил хариу (204). Имэйлийг worker илгээнэ — API-ийн хариуны хугацаа
   * SMTP-ээс хамаарахгүй. Токен нэг удаагийн, 30 минут, DB-д зөвхөн SHA-256.
   */
  async requestPasswordReset(input: PasswordResetRequestInput, meta: RequestMeta): Promise<void> {
    const ipHash = hashIp(meta.ip, this.ipSecret);
    await this.rateLimiter.consume(RESET_BY_IP, ipHash);
    await this.rateLimiter.consume(RESET_BY_EMAIL, sha256Hex(input.email));

    const user = await this.prisma.user.findFirst({ where: { email: input.email, deletedAt: null } });
    if (!user || user.status === 'SUSPENDED' || user.status === 'REJECTED') return;

    const token = randomToken();
    const reset = await this.prisma.$transaction(async (tx) => {
      // Шинэ холбоос илгээхэд өмнөх ашиглаагүй холбоосууд хүчингүй
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
      return tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256Hex(token),
          ipHash,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MIN * 60_000),
        },
      });
    });
    await this.emailQueue.add(
      'password_reset',
      { kind: 'password_reset', resetId: reset.id, tokenEnc: this.cipher.encrypt(token) },
      { jobId: `password-reset-${reset.id}` },
    );
  }

  /** Шинэ нууц үг тохируулж, бүх төхөөрөмж дээрх session-ийг хаана. Админы 2FA хэвээр (нууц үг дангаараа хүрэхгүй). */
  async confirmPasswordReset(input: PasswordResetConfirmInput, meta: RequestMeta): Promise<void> {
    const ipHash = hashIp(meta.ip, this.ipSecret);
    await this.rateLimiter.consume(RESET_CONFIRM_BY_IP, ipHash);

    const invalid = () => new BadRequestException({ statusCode: 400, code: 'reset_token_invalid' });
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256Hex(input.token) },
      include: { user: true },
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date() || reset.user.deletedAt) throw invalid();
    const { user } = reset;
    if (user.status === 'SUSPENDED' || user.status === 'REJECTED') throw invalid();

    const passwordHash = await hashPassword(input.password);
    await this.prisma.$transaction(async (tx) => {
      // Зэрэг ирсэн хоёр хүсэлтийн зөвхөн нэг нь токеныг ашиглана
      const { count } = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (count !== 1) throw invalid();
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.authSession.deleteMany({ where: { userId: user.id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id, id: { not: reset.id } } });
      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'auth.password.reset',
          entityType: 'user',
          entityId: user.id,
          ipHash,
        },
        tx,
      );
    });
    await this.rateLimiter.reset(LOGIN_BY_EMAIL, sha256Hex(user.email));
  }

  // ---------------------------------------------------------------- 2FA (TOTP)

  async startTotpSetup(auth: AuthContext): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (user.totpEnabledAt) {
      // Идэвхтэй 2FA-г солихын тулд эхлээд өөр админ reset хийнэ (Phase 6) — session хулгайлагч дахин тохируулж чадахгүй
      throw new ConflictException({ statusCode: 409, code: 'mfa_already_enabled' });
    }
    const secret = newTotpSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpPendingSecretEnc: this.cipher.encrypt(secret) },
    });
    return { secret, otpauthUri: totpUri(secret, user.email) };
  }

  async enableTotp(auth: AuthContext, code: string, meta: RequestMeta): Promise<{ recoveryCodes: string[] }> {
    await this.rateLimiter.consume(MFA_BY_USER, auth.userId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (user.totpEnabledAt) throw new ConflictException({ statusCode: 409, code: 'mfa_already_enabled' });
    if (!user.totpPendingSecretEnc) throw new ConflictException({ statusCode: 409, code: 'mfa_setup_not_started' });

    const secret = this.cipher.decrypt(user.totpPendingSecretEnc);
    const check = checkTotp(secret, code, null);
    if (!check.ok) throw new UnauthorizedException({ statusCode: 401, code: 'invalid_mfa_code' });

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          totpSecretEnc: user.totpPendingSecretEnc,
          totpPendingSecretEnc: null,
          totpEnabledAt: new Date(),
          totpLastStep: check.step,
          recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
        },
      });
      await tx.authSession.update({ where: { id: auth.sessionId }, data: { mfaPassedAt: new Date() } });
      // Бусад төхөөрөмж дээрх 2FA-гүй session-уудыг хаана
      await tx.authSession.deleteMany({ where: { userId: user.id, id: { not: auth.sessionId } } });
      await this.audit.log(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'auth.mfa.enable',
          entityType: 'user',
          entityId: user.id,
          ipHash: hashIp(meta.ip, this.ipSecret),
        },
        tx,
      );
    });
    await this.rateLimiter.reset(MFA_BY_USER, auth.userId);
    return { recoveryCodes };
  }

  async verifyMfa(auth: AuthContext, input: MfaVerifyInput, meta: RequestMeta): Promise<{ recoveryCodesLeft: number }> {
    await this.rateLimiter.consume(MFA_BY_USER, auth.userId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
    if (!user.totpEnabledAt || !user.totpSecretEnc) {
      throw new ConflictException({ statusCode: 409, code: 'mfa_not_enabled' });
    }

    const verified =
      'code' in input ? await this.consumeTotp(user, input.code) : await this.consumeRecoveryCode(user, input.recoveryCode);
    if (!verified) throw new UnauthorizedException({ statusCode: 401, code: 'invalid_mfa_code' });

    await this.prisma.authSession.update({ where: { id: auth.sessionId }, data: { mfaPassedAt: new Date() } });
    await this.rateLimiter.reset(MFA_BY_USER, auth.userId);
    const fresh = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if ('recoveryCode' in input) {
      await this.audit.log({
        actorId: user.id,
        actorRole: user.role,
        action: 'auth.mfa.recovery_code_used',
        entityType: 'user',
        entityId: user.id,
        after: { recoveryCodesLeft: fresh.recoveryCodeHashes.length },
        ipHash: hashIp(meta.ip, this.ipSecret),
      });
    }
    return { recoveryCodesLeft: fresh.recoveryCodeHashes.length };
  }

  // ---------------------------------------------------------------- дотоод

  private async issueSession(user: User, meta: RequestMeta): Promise<IssuedSession> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS[user.role]);
    await this.prisma.authSession.create({
      data: {
        id: sha256Hex(token),
        userId: user.id,
        expiresAt,
        ipHash: hashIp(meta.ip, this.ipSecret),
        userAgent: meta.userAgent ?? null,
      },
    });
    let mfa: MfaState = 'none';
    if (isMfaRequired(user.role, user.totpEnabledAt !== null, this.adminMfaRequired)) {
      mfa = user.totpEnabledAt ? 'required' : 'setup_required';
    }
    return { token, expiresAt, mfa };
  }

  /** Step-ийг атомаар хадгална: зэрэг ирсэн хоёр хүсэлтийн зөвхөн нэг нь ижил кодыг ашиглана. */
  private async consumeTotp(user: User, code: string): Promise<boolean> {
    const check = checkTotp(this.cipher.decrypt(user.totpSecretEnc!), code, user.totpLastStep);
    if (!check.ok) return false;
    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: check.step } }] },
      data: { totpLastStep: check.step },
    });
    return count === 1;
  }

  private async consumeRecoveryCode(user: User, code: string): Promise<boolean> {
    const hashed = hashRecoveryCode(code);
    if (!user.recoveryCodeHashes.includes(hashed)) return false;
    // Массив хуучирсан бол (зэрэг хэрэглэсэн) update таарахгүй
    const { count } = await this.prisma.user.updateMany({
      where: { id: user.id, recoveryCodeHashes: { equals: user.recoveryCodeHashes } },
      data: { recoveryCodeHashes: user.recoveryCodeHashes.filter((h) => h !== hashed) },
    });
    return count === 1;
  }
}
