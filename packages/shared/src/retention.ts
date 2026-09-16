export const DEFAULT_RETENTION_DAYS = 180;
export const MAX_RETENTION_DAYS = 3650;
export const SOFT_DELETE_RESTORE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Эвэнт дууссанаас хойш `retentionDays` хоногийн дараа бүх зураг, embedding устна. */
export function computeEventExpiresAt(endsAt: Date, retentionDays: number): Date {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > MAX_RETENTION_DAYS) {
    throw new RangeError(`retentionDays must be an integer 1..${MAX_RETENTION_DAYS}, got ${retentionDays}`);
  }
  return new Date(endsAt.getTime() + retentionDays * DAY_MS);
}

/** Soft delete хийсэн зүйлийг бүрмөсөн устгах (purge) хугацаа болсон эсэх. */
export function isPurgeDue(deletedAt: Date, now: Date): boolean {
  return now.getTime() - deletedAt.getTime() >= SOFT_DELETE_RESTORE_DAYS * DAY_MS;
}
