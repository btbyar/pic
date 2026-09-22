'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CheckIcon, LinkIcon, ShareIcon } from './icons';

const button =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold text-ivory ring-1 ring-inset ring-line-strong transition duration-300 hover:bg-white/[0.06] hover:ring-mist active:scale-95';

/** Эвэнтийн холбоосыг хуваалцах: утсан дээр системийн цэс, бусад дээр хуулах ба Facebook */
export function ShareEvent({ title }: { title: string }) {
  const t = useTranslations('share');
  const [copied, setCopied] = useState(false);

  const url = () => (typeof window === 'undefined' ? '' : window.location.href.split('#')[0]!);

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('label')}>
      {/* navigator.share зөвхөн утсан дээр байдаг — байхгүй бол доорх товчнууд ажиллана */}
      <button
        type="button"
        className={`${button} sm:hidden`}
        onClick={() => void navigator.share?.({ title, url: url() }).catch(() => undefined)}
      >
        <ShareIcon size={16} />
        {t('share')}
      </button>
      <button
        type="button"
        className={`${button} ${copied ? '!text-jade !ring-jade/50' : ''}`}
        onClick={async () => {
          await navigator.clipboard.writeText(url());
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <CheckIcon size={16} className="animate-pop" /> : <LinkIcon size={16} />}
        <span aria-live="polite">{copied ? t('copied') : t('copyLink')}</span>
      </button>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url())}`}
        target="_blank"
        rel="noreferrer noopener"
        className={button}
        onClick={(e) => {
          // Client component тул href нь эхний render-д хоосон — дарахад л бодит хаягийг тавина
          e.currentTarget.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url())}`;
        }}
      >
        Facebook
      </a>
    </div>
  );
}
