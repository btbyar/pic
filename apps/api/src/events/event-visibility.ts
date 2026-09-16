import type { EventVisibility } from '@pic/shared';
import { safeEqualHex, sha256Hex } from '../common/crypto';

export interface VisibilityTarget {
  visibility: EventVisibility;
  accessTokenHash: string | null;
  expiresAt: Date;
  deletedAt: Date | null;
}

export interface Viewer {
  /** URL-ийн `?t=` токен (түүхий) */
  accessToken?: string | undefined;
  isMember: boolean;
  isAdmin: boolean;
}

/**
 * Нийтийн эвэнтийн хуудсыг харж болох эсэх. Болохгүй бол controller 404 буцаана —
 * нуусан/нууц эвэнт байгаа эсэхийг ч задруулахгүй.
 */
export function canViewEvent(event: VisibilityTarget, viewer: Viewer, now = new Date()): boolean {
  if (event.deletedAt) return false;
  // Retention хугацаа дууссан эвэнтийг устгах job хүлээж буй ч хэн ч харахгүй
  if (event.expiresAt.getTime() <= now.getTime()) return false;
  if (viewer.isMember || viewer.isAdmin) return true;

  switch (event.visibility) {
    case 'PUBLIC':
      return true;
    case 'UNLISTED':
      return (
        event.accessTokenHash !== null &&
        typeof viewer.accessToken === 'string' &&
        viewer.accessToken.length > 0 &&
        viewer.accessToken.length <= 128 &&
        safeEqualHex(sha256Hex(viewer.accessToken), event.accessTokenHash)
      );
    case 'HIDDEN':
      return false;
  }
}
