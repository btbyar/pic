'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';

export interface NavItem {
  href: string;
  label: string;
  /** Зөвхөн яг энэ хаяг идэвхтэй (жишээ нь /admin — дэд хуудсууд нь өөр таб) */
  exact?: boolean;
  icon?: ReactNode;
  /** Анхаарал шаардсан зүйлийн тоо (ж: хүлээгдэж буй хүсэлт) — 0 бол харуулахгүй */
  count?: number;
}

/** Ажлын талбарын цэс: өргөн дэлгэцэнд босоо (алтан заагчтай), утсан дээр хэвтээ чипүүд */
export function AppNav({ items, orientation = 'horizontal' }: { items: NavItem[]; orientation?: 'horizontal' | 'vertical' }) {
  const pathname = usePathname();
  const vertical = orientation === 'vertical';
  const navRef = useRef<HTMLElement>(null);

  // Утсан дээр идэвхтэй таб хэвтээ жагсаалтын гадна үлдэхгүй
  useEffect(() => {
    if (vertical) return;
    navRef.current?.querySelector('[aria-current=page]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname, vertical]);
  return (
    <nav ref={navRef} className={vertical ? '' : 'min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]'}>
      <ul className={vertical ? 'flex flex-col gap-1' : 'flex gap-1.5'}>
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={
                  vertical
                    ? `group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition duration-300 ${
                        active ? 'bg-white/[0.06] text-ivory' : 'text-mist hover:bg-white/[0.03] hover:text-ivory'
                      }`
                    : `flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition ${
                        active ? 'bg-ivory text-night ring-ivory' : 'text-mist ring-line hover:text-ivory'
                      }`
                }
              >
                {vertical ? (
                  <span
                    aria-hidden
                    className={`absolute -left-4 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gold transition duration-300 ${active ? 'opacity-100' : 'opacity-0'}`}
                  />
                ) : null}
                {item.icon && vertical ? <span className={`shrink-0 transition ${active ? 'text-gold' : ''}`}>{item.icon}</span> : null}
                <span className={vertical ? 'flex-1' : ''}>{item.label}</span>
                {item.count ? (
                  <span className="rounded-full bg-gold px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums text-gold-ink">{item.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
