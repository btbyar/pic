import type { Metadata } from 'next';
import { MyOrders } from './my-orders';

export const metadata: Metadata = { robots: { index: false } };

export default function MyOrdersPage() {
  return <MyOrders />;
}
