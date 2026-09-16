// packages/shared дахь enum толь нь Prisma схемтэй зөрөхгүй байх ёстой.
import {
  EVENT_VISIBILITIES,
  ORDER_STATUSES,
  PAYOUT_STATUSES,
  PROCESSING_STATUSES,
  REMOVAL_STATUSES,
  ROLES,
  USER_STATUSES,
} from '@pic/shared';
import { describe, expect, it } from 'vitest';
import {
  EventVisibility,
  OrderStatus,
  PayoutStatus,
  ProcessingStatus,
  RemovalStatus,
  Role,
  UserStatus,
} from '../src/generated/prisma/enums.js';

describe('shared enums mirror Prisma enums', () => {
  it.each([
    ['Role', Role, ROLES],
    ['UserStatus', UserStatus, USER_STATUSES],
    ['EventVisibility', EventVisibility, EVENT_VISIBILITIES],
    ['ProcessingStatus', ProcessingStatus, PROCESSING_STATUSES],
    ['OrderStatus', OrderStatus, ORDER_STATUSES],
    ['PayoutStatus', PayoutStatus, PAYOUT_STATUSES],
    ['RemovalStatus', RemovalStatus, REMOVAL_STATUSES],
  ] as const)('%s', (_name, prismaEnum, sharedValues) => {
    expect(Object.values(prismaEnum)).toEqual([...sharedValues]);
  });
});
