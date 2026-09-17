import type {
  BundleBlocker,
  EventCategory,
  EventVisibility,
  OrderStatus,
  ProcessingStatus,
  Role,
  UserStatus,
} from '@pic/shared';

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

export interface OrderQuote {
  photoIds: string[];
  unavailable: string[];
  pricePerPhoto: number;
  bundlePrice: number | null;
  price: {
    subtotal: number;
    total: number;
    bundleApplied: boolean;
    bundleBlocker: BundleBlocker | null;
  } | null;
}

export interface CreatedOrder {
  id: string;
  accessToken: string;
  total: number;
}

export interface OrderView {
  id: string;
  status: OrderStatus;
  eventTitle: string;
  totalAmount: number;
  bundleApplied: boolean;
  emailOnFile: boolean;
  createdAt: string;
  paidAt: string | null;
  paymentDueAt: string | null;
  downloadableUntil: string | null;
  mockPayment: boolean;
  payment: {
    provider: 'QPAY' | 'MOCK';
    qrText: string;
    shortUrl: string | null;
    deeplinks: { name: string; description: string; logo: string; link: string }[];
  } | null;
  items: {
    id: string;
    photoId: string | null;
    available: boolean;
    refunded: boolean;
    width: number | null;
    height: number | null;
    thumbUrl: string | null;
  }[];
}
