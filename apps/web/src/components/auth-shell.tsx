import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Logo } from './site-header';

/**
 * Нэвтрэх, бүртгүүлэх: хоёр хуваасан тайз. Зүүн — харанхуй танхим, том serif ишлэл, гэрлийн туяа.
 * Утсан дээр зөвхөн маягт (ишлэл нь толгойд жижгээр).
 */
export function AuthShell({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const t = useTranslations('authShell');
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative isolate hidden flex-col justify-between overflow-hidden border-r border-line p-12 lg:flex">
        <div aria-hidden className="absolute -left-40 -top-40 -z-10 size-[40rem] animate-drift rounded-full bg-gold/[0.12] blur-[120px]" />
        <div aria-hidden className="absolute bottom-0 left-1/4 -z-10 h-full w-40 rotate-12 bg-linear-to-t from-transparent via-gold/[0.05] to-transparent blur-2xl" />
        <Link href="/" className="inline-flex min-h-11 items-center self-start">
          <Logo size="lg" />
        </Link>
        <div className="flex max-w-lg flex-col gap-6">
          <span className="kicker">{t('kicker')}</span>
          <p className="font-display text-6xl font-semibold leading-[0.95] tracking-[-0.03em]">
            {t.rich('quote', { em: (chunks) => <em className="font-medium text-gold">{chunks}</em> })}
          </p>
          <p className="text-lg text-mist">{t('body')}</p>
        </div>
        <div aria-hidden className="sprockets" />
      </aside>

      <main className="relative flex flex-col px-5 py-8 sm:px-10">
        <div aria-hidden className="absolute right-0 top-0 -z-10 size-80 rounded-full bg-gold/[0.06] blur-3xl lg:hidden" />
        <Link href="/" className="inline-flex min-h-11 items-center self-start lg:hidden">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-10">
          <div className="flex animate-rise flex-col gap-3">
            <h1 className="font-display text-5xl font-semibold leading-none tracking-[-0.02em]">{title}</h1>
            {intro ? <p className="text-mist">{intro}</p> : null}
          </div>
          <div className="flex animate-rise flex-col gap-6 stagger [--i:1]">{children}</div>
        </div>
      </main>
    </div>
  );
}
