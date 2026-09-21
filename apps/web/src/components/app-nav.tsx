'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export interface NavItem {
  href: string;
  label: string;
  /** Зөвхөн яг энэ хаяг идэвхтэй (жишээ нь /admin — дэд хуудсууд нь өөр таб) */
  exact?: boolean;
  icon?: ReactNode;
  /** Анхаарал шаардсан зүйлийн тоо (ж: хүлээгдэж буй хүсэлт) — 0 бол харуулахгүй */
  count?: number;
}

/** Ажлын талбарын цэс: өргөн дэлгэцэд босоо, утсан дээр хэвтээгээр гүйнэ */
export function AppNav({ items, orientation = 'horizontal' }: { items: NavItem[]; orientation?: 'horizontal' | 'vertical' }) {
  const pathname = usePathname();
  const vertical = orientation === 'vertical';
  return (
    <nav className={vertical ? '' : 'min-w-0 flex-1 overflow-x-auto'}>
      <ul className={vertical ? 'flex flex-col gap-1' : 'flex gap-1'}>
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 whitespace-nowrap rounded-xl px-3 text-[15px] transition ${vertical ? 'min-h-11' : 'min-h-10 text-sm'} ${
                  active ? 'bg-brand-50 font-semibold text-brand-700' : 'font-medium text-ink-soft hover:bg-surface-3 hover:text-ink'
                }`}
              >
                {item.icon && vertical ? <span className="shrink-0">{item.icon}</span> : null}
                <span className={vertical ? 'flex-1' : ''}>{item.label}</span>
                {item.count ? (
                  <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold tabular-nums text-on-brand">{item.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
