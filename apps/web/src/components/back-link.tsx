import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeftIcon } from './icons';

/** Хуудасны дээд талын "буцах" холбоос */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-ink-soft hover:text-ink">
      <ArrowLeftIcon size={16} className="shrink-0" />
      {children}
    </Link>
  );
}
