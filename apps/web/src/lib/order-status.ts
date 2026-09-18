import type { OrderStatus } from '@pic/shared';

export const ORDER_TONE: Record<OrderStatus, 'green' | 'amber' | 'slate' | 'red'> = {
  PAID: 'green',
  PENDING: 'amber',
  EXPIRED: 'slate',
  FAILED: 'red',
  REFUNDED: 'red',
  PARTIALLY_REFUNDED: 'amber',
};
