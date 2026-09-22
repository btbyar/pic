import type { ReactNode } from 'react';

/** Хуудас солигдох бүрт шинэ кадр шиг зөөлөн гарч ирнэ */
export default function SiteTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-fade">{children}</div>;
}
