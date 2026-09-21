import type {
  BundleBlocker,
  EventCategory,
  EventVisibility,
  OrderStatus,
  ProcessingStatus,
  RemovalStatus,
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
  /** 400px thumb — карт */
  coverUrl: string | null;
  /** Watermark-гүй том зураг (hero, баннер) */
  coverLargeUrl: string | null;
  photoCount: number;
}

export interface PublicEvent extends EventBase {
  photographers?: { name: string; slug: string | null }[];
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

export interface AdminOverview {
  pendingPhotographers: number;
  newRemovals: number;
  failedPhotos: number;
  month: { orders: number; revenue: number; since: string };
  expiringEvents: { id: string; slug: string; title: string; expiresAt: string; photoCount: number }[];
}

export interface AdminRemovalRequest {
  id: string;
  reason: string;
  contact: string | null;
  status: RemovalStatus;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  photo: { id: string; eventTitle: string; eventSlug: string; hidden: boolean; previewUrl: string | null } | null;
}

export interface AdminRemovalPage {
  items: AdminRemovalRequest[];
  nextCursor: string | null;
}

export interface AdminOrderRow {
  id: string;
  status: OrderStatus;
  eventTitleSnap: string;
  totalAmount: number;
  contactEmail: string | null;
  createdAt: string;
  paidAt: string | null;
  itemCount: number;
}

export interface AdminOrderDetail {
  id: string;
  status: OrderStatus;
  eventTitle: string;
  totalAmount: number;
  contactEmail: string | null;
  createdAt: string;
  paidAt: string | null;
  items: {
    id: string;
    photoId: string | null;
    filename: string;
    photographer: string;
    pricing: 'SINGLE' | 'BUNDLE';
    price: number;
    photographerAmount: number;
    platformAmount: number;
    refunded: boolean;
  }[];
  payments: { id: string; provider: string; status: string; amount: number; providerInvoiceId: string; providerPaymentId: string | null; createdAt: string }[];
  refunds: { id: string; amount: number; reason: string; providerRef: string | null; createdBy: string; createdAt: string }[];
}

export interface PayoutAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface LedgerMonth {
  period: string;
  gross: number;
  refunded: number;
  carriedIn: number;
  net: number;
  payable: number;
}

export interface PayoutInfo {
  status: 'PENDING' | 'PAID';
  netAmount: number;
  paidAt: string | null;
  reference: string | null;
}

export interface AdminPayouts {
  period: string;
  closed: boolean;
  currentPeriod: string;
  rows: (Omit<LedgerMonth, 'period'> & {
    photographerId: string;
    displayName: string;
    email: string | null;
    account: PayoutAccount | null;
    payout: PayoutInfo | null;
  })[];
}

export interface Earnings {
  revenueSharePct: number | null;
  currentPeriod: string;
  account: PayoutAccount | null;
  months: (LedgerMonth & { payout: PayoutInfo | null })[];
}

export interface PhotographerCard {
  slug: string;
  displayName: string;
  city: string | null;
  bio: string | null;
  avatarUrl: string | null;
  /** Хамгийн сүүлийн эвэнтийн cover — картын баннер */
  coverUrl: string | null;
  eventCount: number;
}

export interface PhotographerPage {
  slug: string;
  displayName: string;
  city: string | null;
  bio: string | null;
  avatarUrl: string | null;
  photoCount: number;
  events: PublicEvent[];
}

export interface MyProfile {
  displayName: string;
  slug: string;
  slugSaved: boolean;
  city: string | null;
  bio: string | null;
  avatarUrl: string | null;
}

export interface HomeStats {
  events: number;
  photos: number;
  photographers: number;
}

/** Зурагчны борлуулалт — зурагчны хувь, буцаалт хассан */
export interface PhotographerSales {
  byEvent: { eventId: string; photos: number; amount: number }[];
  recent: {
    id: string;
    eventId: string | null;
    eventTitle: string;
    paidAt: string;
    photos: number;
    amount: number;
    bundle: boolean;
    refunded: boolean;
  }[];
}
