import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeftIcon } from './icons';

/** Хуудасны дээд талын "буцах" — шилэн чип */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="glass group inline-flex min-h-11 max-w-full items-center gap-2 self-start rounded-full pl-2 pr-4 text-sm font-semibold text-ivory transition hover:bg-white/10"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 transition group-hover:-translate-x-0.5">
        <ArrowLeftIcon size={15} />
      </span>
      <span className="truncate">{children}</span>
    </Link>
  );
}
