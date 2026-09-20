import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import QRCode from 'qrcode';
import { BackLink } from '@/components/back-link';
import { serverApi } from '@/lib/api-server';
import { formatEventRange } from '@/lib/datetime';
import type { MyEventDetail } from '@/lib/types';
import { PrintButton } from './print-button';

/** Хэвлэх хуудсанд QR-ийг серверт зурна (браузерын JS хүлээхгүй) */
async function qrSvg(url: string) {
  return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#1c1917', light: '#ffffff' } });
}

export default async function EventPosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: event } = await serverApi<MyEventDetail>(`/photographer/events/${id}`);
  if (!event) notFound();

  const t = await getTranslations('poster');
  const head = await headers();
  const origin = `${head.get('x-forwarded-proto') ?? 'http'}://${head.get('host')}`;
  const url = `${origin}/events/${event.slug}`;
  const svg = await qrSvg(url);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink href={`/photographer/events/${event.id}`}>{event.title}</BackLink>
        <PrintButton label={t('print')} />
      </div>
      <p className="max-w-2xl text-sm text-ink-soft print:hidden">
        {event.visibility === 'PUBLIC' ? t('intro') : t('introHidden')}
      </p>

      {/* A4 хуудас: дэлгэц дээр ч, хэвлэхэд ч ижил харьцаа */}
      <div className="mx-auto w-full max-w-[210mm] rounded-xl border border-line bg-white p-10 text-center text-black print:max-w-none print:rounded-none print:border-0 print:p-0">
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-2">
            <img src="/icon-print.svg" alt="" width={32} height={32} />
            <span className="font-display text-2xl font-bold">Pic</span>
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="text-balance font-display text-4xl font-bold leading-tight">{event.title}</h1>
            <p className="text-lg text-neutral-600">{formatEventRange(event.startsAt, event.endsAt, event.timezone)}</p>
            {event.location ? <p className="text-lg text-neutral-600">{event.location}</p> : null}
          </div>

          <p className="max-w-md text-balance text-2xl font-semibold text-[#0f7a45]">{t('headline')}</p>

          {/* biome-ignore lint: QR-ийг серверт үүсгэсэн SVG, гаднаас орж ирэх өгөгдөл биш */}
          <div className="w-64 max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />

          <p className="font-mono text-sm text-neutral-600">{url.replace(/^https?:\/\//, '')}</p>

          <ol className="flex max-w-lg flex-col gap-2 text-left text-lg">
            {(['scan', 'selfie', 'buy'] as const).map((k, i) => (
              <li key={k} className="flex gap-3">
                <span className="font-display font-bold tabular-nums text-[#0f7a45]">{i + 1}.</span>
                {t(`steps.${k}`)}
              </li>
            ))}
          </ol>

          <p className="text-sm text-neutral-600">{t('privacy')}</p>
        </div>
      </div>
    </>
  );
}
