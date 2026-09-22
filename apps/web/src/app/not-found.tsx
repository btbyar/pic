import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/site-header';
import { ButtonLink } from '@/components/ui';
import Link from 'next/link';

/** 404: хальс тасарсан кадр */
export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center gap-8 overflow-hidden px-5 text-center">
      <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 size-[36rem] -translate-x-1/2 -translate-y-1/2 animate-drift rounded-full bg-gold/10 blur-[120px]" />
      <Link href="/" className="absolute left-5 top-6 inline-flex min-h-11 items-center">
        <Logo />
      </Link>
      <span aria-hidden className="numeral-outline animate-rise font-display text-[clamp(8rem,28vw,18rem)] font-semibold leading-none">
        404
      </span>
      <div className="-mt-6 flex max-w-md animate-rise flex-col gap-3 stagger [--i:1]">
        <h1 className="font-display text-5xl font-semibold leading-none">{t('title')}</h1>
        <p className="text-mist">{t('body')}</p>
      </div>
      <div className="flex animate-rise flex-wrap justify-center gap-3 stagger [--i:2]">
        <ButtonLink href="/photographers">{t('photographers')}</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          {t('home')}
        </ButtonLink>
      </div>
    </main>
  );
}
