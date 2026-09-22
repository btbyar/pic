'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { BackLink } from '@/components/back-link';
import { EventForm } from '@/components/event-form';
import { Card, PageHeader } from '@/components/ui';
import { rememberAccessLink } from '@/lib/access-link';
import { api } from '@/lib/api-client';
import type { MyEvent } from '@/lib/types';

export default function NewEventPage() {
  const t = useTranslations();
  const router = useRouter();

  return (
    <>
      <BackLink href="/photographer/events">{t('photographer.myEvents')}</BackLink>
      <PageHeader kicker={t('photographer.newEventKicker')} title={t('photographer.newEvent')} intro={<p>{t('photographer.newEventIntro')}</p>} />
      <Card className="max-w-3xl animate-rise stagger [--i:3]">
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
