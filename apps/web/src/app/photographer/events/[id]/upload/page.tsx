import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/api-server';
import type { MyEventDetail } from '@/lib/types';
import { Uploader } from './uploader';

export default async function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await serverApi<MyEventDetail>(`/photographer/events/${id}`);
  if (!data) notFound();
  return <Uploader eventId={data.id} eventTitle={data.title} />;
}
