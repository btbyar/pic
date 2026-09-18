'use client';

import { BackLink } from '@/components/back-link';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { EventForm } from '@/components/event-form';
import { Card } from '@/components/ui';
import { api } from '@/lib/api-client';
import { rememberAccessLink } from '@/lib/access-link';
import type { MyEvent } from '@/lib/types';

export default function NewEventPage() {
  const t = useTranslations();
  const router = useRouter();

  return (
    <>
      <BackLink href="/photographer/events">{t('photographer.myEvents')}</BackLink>
      <h1 className="text-2xl font-bold">{t('photographer.newEvent')}</h1>
      <Card>
        <EventForm
          submitLabel={t('eventForm.create')}
          busyLabel={t('eventForm.creating')}
          onSubmit={async (values) => {
            const res = await api<MyEvent>('/photographer/events', { method: 'POST', body: values });
            if (!res.ok) return res.error;
            if (res.data.accessLink) rememberAccessLink(res.data.id, res.data.accessLink);
            router.push(`/photographer/events/${res.data.id}`);
            router.refresh();
            return null;
          }}
        />
      </Card>
    </>
  );
}
