import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@pic/db';
import type { Role } from '@pic/shared';
import { PRISMA } from '../prisma/prisma.module';

export interface AuditEntry {
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
  ipHash?: string;
}

type Tx = Pick<PrismaClient, 'auditLog'>;

@Injectable()
export class AuditService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Transaction дотор дуудвал үндсэн өөрчлөлттэй хамт commit/rollback болно. */
  async log(entry: AuditEntry, tx: Tx = this.prisma): Promise<void> {
    await tx.auditLog.create({ data: entry });
  }
}
