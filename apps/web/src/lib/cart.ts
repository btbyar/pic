'use client';

import { useSyncExternalStore } from 'react';
import type { PublicPhoto } from './types';

// Сагс DB-д биш, энэ төхөөрөмжийн localStorage-д (docs/ARCHITECTURE.md §2.5). Эвэнт бүр тусдаа захиалга болно.

const KEY = 'pic:cart:v1';
const CHANGE = 'pic:cart-change';

/** Сагсанд үнэ харуулах, захиалга үүсгэхэд хэрэгтэй эвэнтийн мэдээлэл */
export interface CartEventInfo {
  slug: string;
  title: string;
  pricePerPhoto: number;
  bundlePrice: number | null;
  /** Нууц (UNLISTED) эвэнтийн холбоосны токен */
  accessToken?: string | undefined;
}

export interface CartPhoto {
  id: string;
  thumbUrl: string;
}

export interface CartEvent extends CartEventInfo {
  /** Багц үнийн шалгалтад — 24 цагийн дотор, хэрэглэгч устгаагүй үед л хүчинтэй */
  searchSessionId?: string | undefined;
  photos: CartPhoto[];
  updatedAt: number;
}

export type Cart = Record<string, CartEvent>;

const EMPTY: Cart = {};
let cached: { raw: string | null; value: Cart } = { raw: null, value: EMPTY };

function read(): Cart {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  // useSyncExternalStore ижил утгад ижил объект шаарддаг
  if (raw === cached.raw) return cached.value;
  let value: Cart = EMPTY;
  try {
    value = raw ? (JSON.parse(raw) as Cart) : EMPTY;
  } catch {
    value = EMPTY;
  }
  cached = { raw, value };
  return value;
}

function write(cart: Cart) {
  try {
    if (Object.keys(cart).length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(cart));
  } catch {
    // private mode / дүүрсэн — сагс энэ хуудсанд л ажиллана
  }
  window.dispatchEvent(new Event(CHANGE));
}

function update(fn: (cart: Cart) => Cart) {
  write(fn({ ...read() }));
}

export function addToCart(event: CartEventInfo, photos: Pick<PublicPhoto, 'id' | 'thumbUrl'>[], searchSessionId?: string) {
  update((cart) => {
    const current = cart[event.slug];
    const existing = new Set(current?.photos.map((p) => p.id));
    cart[event.slug] = {
      ...event,
      searchSessionId: searchSessionId ?? current?.searchSessionId,
      photos: [...(current?.photos ?? []), ...photos.filter((p) => !existing.has(p.id)).map(({ id, thumbUrl }) => ({ id, thumbUrl }))],
      updatedAt: Date.now(),
    };
    return cart;
  });
}

export function removeFromCart(slug: string, photoIds: string[]) {
  const remove = new Set(photoIds);
  update((cart) => {
    const current = cart[slug];
    if (!current) return cart;
    const photos = current.photos.filter((p) => !remove.has(p.id));
    if (photos.length === 0) delete cart[slug];
    else cart[slug] = { ...current, photos, updatedAt: Date.now() };
    return cart;
  });
}

export function clearCartEvent(slug: string) {
  update((cart) => {
    delete cart[slug];
    return cart;
  });
}

/** Хайлтын өгөгдлөө устгахад багцын эрх мөн алга болно */
export function forgetSearchSession(sessionId: string) {
  update((cart) => {
    for (const [slug, event] of Object.entries(cart)) {
      if (event.searchSessionId === sessionId) cart[slug] = { ...event, searchSessionId: undefined };
    }
    return cart;
  });
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  // Өөр tab дээр өөрчлөгдвөл
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useCart(): Cart {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function cartPhotoCount(cart: Cart): number {
  return Object.values(cart).reduce((n, e) => n + e.photos.length, 0);
}
