import { notFound, redirect } from 'next/navigation';
import { serverApi } from '@/lib/api-server';
import type { PublicEvent } from '@/lib/types';
import { SelfieSearch } from './selfie-search';

export default async function FindMyPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t: token } = await searchParams;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();

  const query = token ? `?t=${encodeURIComponent(token)}` : '';
  const { status, data: event } = await serverApi<PublicEvent>(`/events/${slug}${query}`);
  if (status === 404 || !event) notFound();
  if (!event.faceSearchEnabled) redirect(`/events/${slug}${query}`);

  return <SelfieSearch event={event} accessToken={token} />;
}
