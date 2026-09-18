import Link from 'next/link';
import { Logo } from './site-header';
import type { ReactNode } from 'react';

export function AuthShell({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5 py-10">
      <Link href="/" className="self-start">
        <Logo />
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        {intro ? <p className="text-slate-600">{intro}</p> : null}
      </div>
      {children}
    </main>
  );
}
