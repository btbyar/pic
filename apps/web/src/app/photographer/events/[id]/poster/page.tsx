import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import QRCode from 'qrcode';
import { BackLink } from '@/components/back-link';
import { Alert, PageHeader } from '@/components/ui';
import { serverApi } from '@/lib/api-server';
import { formatEventRange } from '@/lib/datetime';
import type { MyEventDetail } from '@/lib/types';
import { PrintButton } from './print-button';

/** Хэвлэх хуудсанд QR-ийг серверт зурна (браузерын JS хүлээхгүй) */
async function qrSvg(url: string) {
  return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, color: { dark: '#0b0a0c', light: '#ffffff' } });
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
      <div className="flex flex-col gap-8 print:hidden">
        <BackLink href={`/photographer/events/${event.id}`}>{event.title}</BackLink>
        <PageHeader kicker={t('kicker')} title={t('title')} intro={<p>{t('intro')}</p>} action={<PrintButton label={t('print')} />} />
        {event.visibility !== 'PUBLIC' ? <Alert kind="info">{t('introHidden')}</Alert> : null}
      </div>

      {/*
        Кино афиш, цагаан цаасан дээр. Хэвлэхэд зөвхөн хар бэх + нэг алтан-хүрэн өнгө (#8a5a1c — цагаан дээр 5.9:1).
        A4 харьцаа дэлгэц дээр ч, хэвлэхэд ч ижил.
      */}
      <div className="mx-auto w-full max-w-[210mm] animate-rise overflow-hidden rounded-2xl bg-white text-[#0b0a0c] shadow-[0_40px_120px_-30px_rgba(232,180,90,0.35)] print:max-w-none print:rounded-none print:shadow-none">
        <div className="flex aspect-[210/297] flex-col px-[8%] py-[7%] print:aspect-auto print:min-h-[277mm]">
          <div className="flex items-center justify-between border-b border-black/15 pb-4">
            <span className="flex items-center gap-2">
              <svg viewBox="0 0 64 64" width={28} height={28} aria-hidden>
                <circle cx="32" cy="32" r="22" fill="#0b0a0c" />
                <circle cx="41" cy="23" r="17" fill="#ffffff" />
              </svg>
              <span className="font-display text-3xl font-semibold italic leading-none">pic</span>
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-black/60">{t('presents')}</span>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-8 py-10 text-center sm:gap-10">
            <div className="flex flex-col items-center gap-3">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#8a5a1c]">{formatEventRange(event.startsAt, event.endsAt, event.timezone)}</p>
              <h1 className="text-balance font-display text-[clamp(2.25rem,7vw,4.5rem)] font-semibold leading-[0.9] tracking-[-0.03em]">{event.title}</h1>
              {event.location ? <p className="text-lg text-black/65">{event.location}</p> : null}
            </div>

            <p className="font-display text-[clamp(1.75rem,5vw,3rem)] font-semibold italic leading-none text-[#8a5a1c]">{t('headline')}</p>

            {/* QR тасалбар дотор */}
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-[#0b0a0c] px-8 pb-5 pt-8">
              {/* biome-ignore lint: QR-ийг серверт үүсгэсэн SVG, гаднаас орж ирэх өгөгдөл биш */}
              <div className="w-52 max-w-full sm:w-60 print:w-72" dangerouslySetInnerHTML={{ __html: svg }} />
              <p className="font-mono text-xs text-black/60">{url.replace(/^https?:\/\//, '')}</p>
            </div>
          </div>

          <ol className="grid grid-cols-3 gap-4 border-t border-black/15 pt-5 text-left">
            {(['scan', 'selfie', 'buy'] as const).map((k, i) => (
              <li key={k} className="flex flex-col gap-1.5">
                <span className="font-mono text-xs text-[#8a5a1c]">0{i + 1}</span>
                <span className="text-sm leading-snug sm:text-base">{t(`steps.${k}`)}</span>
              </li>
            ))}
          </ol>
          <p className="pt-4 text-center text-xs text-black/55">{t('privacy')}</p>
        </div>
      </div>
    </>
  );
}
