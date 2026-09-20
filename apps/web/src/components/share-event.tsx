'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CheckIcon, LinkIcon, ShareIcon } from './icons';

const button =
  'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm font-medium text-ink transition hover:border-brand-300 hover:text-brand-700';

/** Эвэнтийн холбоосыг хуваалцах: утсан дээр системийн цэс, бусад дээр хуулах ба Facebook */
export function ShareEvent({ title }: { title: string }) {
  const t = useTranslations('share');
  const [copied, setCopied] = useState(false);

  const url = () => (typeof window === 'undefined' ? '' : window.location.href.split('#')[0]!);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-soft">{t('label')}</span>
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
        className={button}
        onClick={async () => {
          await navigator.clipboard.writeText(url());
          setCopied(true);
        }}
      >
        {copied ? <CheckIcon size={16} className="text-brand-600" /> : <LinkIcon size={16} />}
        {copied ? t('copied') : t('copyLink')}
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
