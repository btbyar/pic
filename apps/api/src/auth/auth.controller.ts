import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Env } from '../config/env';
import { clientIp, userAgent } from '../common/request-meta';
import { ZodPipe } from '../common/zod.pipe';
import {
  type LoginInput,
  loginSchema,
  mfaCodeSchema,
  type MfaVerifyInput,
  mfaVerifySchema,
  type RegisterInput,
  registerSchema,
} from './auth.schemas';
import { AuthService, type IssuedSession, type RequestMeta } from './auth.service';
import { clearSessionCookie, setSessionCookie } from './cookie';
import { AllowPendingMfa, AllowUnapproved, type AuthContext, CurrentUser, Public } from './decorators';

const meta = (req: Request): RequestMeta => ({ ip: clientIp(req), userAgent: userAgent(req) });

@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.secureCookies = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  @Public()
  @Post('register')
  async register(
    @Body(new ZodPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.withCookie(res, await this.auth.registerPhotographer(body, meta(req)));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.withCookie(res, await this.auth.login(body, meta(req)));
  }

  @AllowPendingMfa()
  @AllowUnapproved()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.sessionId);
    clearSessionCookie(res, this.secureCookies);
  }

  @AllowPendingMfa()
  @AllowUnapproved()
  @Get('me')
  me(@CurrentUser() user: AuthContext) {
    return this.auth.me(user);
  }

  @AllowPendingMfa()
  @AllowUnapproved()
  @Post('mfa/setup')
  @HttpCode(200)
  startTotpSetup(@CurrentUser() user: AuthContext) {
    return this.auth.startTotpSetup(user);
  }

  @AllowPendingMfa()
  @AllowUnapproved()
  @Post('mfa/enable')
  @HttpCode(200)
  enableTotp(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(mfaCodeSchema)) body: { code: string },
    @Req() req: Request,
  ) {
    return this.auth.enableTotp(user, body.code, meta(req));
  }

  @AllowPendingMfa()
  @AllowUnapproved()
  @Post('mfa/verify')
  @HttpCode(200)
  verifyMfa(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(mfaVerifySchema)) body: MfaVerifyInput,
    @Req() req: Request,
  ) {
    return this.auth.verifyMfa(user, body, meta(req));
  }

  private withCookie(res: Response, session: IssuedSession) {
    setSessionCookie(res, session.token, session.expiresAt, this.secureCookies);
    // Токеныг body-д буцаахгүй — зөвхөн httpOnly cookie
    return { mfa: session.mfa };
  }
}
