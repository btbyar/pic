'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavItem {
  href: string;
  label: string;
  /** Зөвхөн яг энэ хаяг идэвхтэй (жишээ нь /admin — дэд хуудсууд нь өөр таб) */
  exact?: boolean;
}

/** Ажлын талбарын цэс: өргөн дэлгэцэд босоо, утсан дээр хэвтээгээр гүйнэ */
export function AppNav({ items, orientation = 'horizontal' }: { items: NavItem[]; orientation?: 'horizontal' | 'vertical' }) {
  const pathname = usePathname();
  const vertical = orientation === 'vertical';
  return (
    <nav className={vertical ? '' : '-mx-4 overflow-x-auto px-4'}>
      <ul className={vertical ? 'flex flex-col gap-0.5' : 'flex gap-1'}>
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-10 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition ${
                  vertical ? 'border-l-2' : ''
                } ${
                  active
                    ? `bg-surface-3 text-ink ${vertical ? 'border-ink' : ''}`
                    : `text-ink-soft hover:bg-surface-3 hover:text-ink ${vertical ? 'border-transparent' : ''}`
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
