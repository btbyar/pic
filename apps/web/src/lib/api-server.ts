import { cookies } from 'next/headers';
import type { Me } from './types';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

export interface ServerResult<T> {
  status: number;
  data: T | null;
}

/** Server component-оос API дуудах. Хэрэглэгчийн session cookie-г дамжуулна. */
export async function serverApi<T>(path: string): Promise<ServerResult<T>> {
  const cookieHeader = (await cookies()).toString();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: 'no-store',
    });
  } catch {
    // API унтарсан/хүрэхгүй — хуудас 500 болохын оронд хоосон төлөвөө харуулна
    return { status: 503, data: null };
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? ((await res.json()) as T) : null;
  return { status: res.status, data: res.ok ? body : null };
}

/** Нэвтрээгүй, эсвэл бүртгэл идэвхгүй бол null */
export async function getMe(): Promise<Me | null> {
  const { data } = await serverApi<Me>('/auth/me');
  return data;
}
