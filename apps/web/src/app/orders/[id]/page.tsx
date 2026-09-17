import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OrderDetail } from './order-detail';

// Захиалгын холбоос нууц: хайлтын системд орохгүй, өөр сайт руу Referer дамжуулахгүй
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <OrderDetail id={id} />;
}
