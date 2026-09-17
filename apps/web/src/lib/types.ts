import type { EventCategory, EventVisibility, ProcessingStatus, Role, UserStatus } from '@pic/shared';

// API хариуны хэлбэр (apps/api/src/**/*.service.ts-тэй тохирно)

export interface Me {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  displayName: string;
  mfa: { enabled: boolean; required: boolean; passed: boolean };
}

interface EventBase {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  category: EventCategory;
  featured: boolean;
  pricePerPhoto: number;
  bundlePrice: number | null;
  faceSearchEnabled: boolean;
  coverUrl: string | null;
  photoCount: number;
}

export interface PublicEvent extends EventBase {
  photographers?: string[];
}

export interface PublicPhoto {
  id: string;
  width: number | null;
  height: number | null;
  capturedAt: string | null;
  thumbUrl: string;
  previewUrl: string;
}

export interface PublicPhotoPage {
  items: PublicPhoto[];
  nextCursor: string | null;
}

export interface SearchResults {
  sessionId: string;
  expiresAt: string;
  multipleFaces: boolean;
  mine: PublicPhoto[];
  maybe: PublicPhoto[];
}

export interface PublicEventPage {
  items: PublicEvent[];
  nextCursor: string | null;
}

export interface MyEvent extends EventBase {
  visibility: EventVisibility;
  hasAccessLink: boolean;
  bibPattern: string | null;
  retentionDays: number;
  expiresAt: string;
  isOwner: boolean;
  createdAt: string;
  accessLink?: string;
}

export interface MyEventDetail extends MyEvent {
  myClockOffsetSec: number;
  photographers: { userId: string; displayName: string; email?: string; isOwner: boolean }[];
}

export interface AdminPhotographer {
  id: string;
  email: string;
  displayName: string;
  phone: string | null;
  status: UserStatus;
  createdAt: string;
  revenueSharePct: number | null;
  rejectionReason: string | null;
  suspendReason: string | null;
}

export interface PhotoStats {
  total: number;
  byStatus: Record<ProcessingStatus, number>;
}
