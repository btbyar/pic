// Prisma enum-уудын толь. Web нь Prisma client импортлохгүй тул эндээс авна.
// packages/db дахь тест хоёрыг тулгаж шалгадаг.

export const ROLES = ['PHOTOGRAPHER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const EVENT_VISIBILITIES = ['PUBLIC', 'UNLISTED', 'HIDDEN'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export const PROCESSING_STATUSES = ['UPLOADING', 'UPLOADED', 'DERIVED', 'INDEXED', 'FAILED'] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const ORDER_STATUSES = [
  'PENDING',
  'PAID',
  'FAILED',
  'EXPIRED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYOUT_STATUSES = ['PENDING', 'PAID'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const REMOVAL_STATUSES = ['NEW', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] as const;
export type RemovalStatus = (typeof REMOVAL_STATUSES)[number];
