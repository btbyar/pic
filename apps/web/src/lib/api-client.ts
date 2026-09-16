'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

export interface ApiError {
  status: number;
  code: string;
  retryAfterSec?: number;
  issues?: { path: string; message: string }[];
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Browser-оос API дуудах: /api/* нь Next.js-ээр дамжиж NestJS руу очно (next.config.ts). */
export async function api<T = unknown>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown } = {},
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : {},
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, error: { status: 0, code: 'network' } };
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body: unknown = isJson ? await res.json().catch(() => null) : null;
  if (res.ok) return { ok: true, data: body as T };

  const err = (body ?? {}) as Partial<ApiError>;
  return {
    ok: false,
    error: {
      status: res.status,
      code: typeof err.code === 'string' ? err.code : 'unknown',
      ...(err.retryAfterSec !== undefined ? { retryAfterSec: err.retryAfterSec } : {}),
      ...(err.issues ? { issues: err.issues } : {}),
    },
  };
}

/** API алдааны кодыг монгол мессеж болгоно */
export function useErrorMessage() {
  const t = useTranslations('errors');
  return useCallback(
    (error: ApiError) => {
      if (error.code === 'rate_limited') {
        return t('rate_limited', { minutes: Math.max(1, Math.ceil((error.retryAfterSec ?? 60) / 60)) });
      }
      return t.has(error.code) ? t(error.code) : t('unknown');
    },
    [t],
  );
}

/** Талбар тус бүрийн алдааг `issues`-ээс гаргана */
export function fieldErrors(error: ApiError | null): Set<string> {
  return new Set((error?.issues ?? []).map((i) => i.path));
}
