'use client';

import { useSyncExternalStore } from 'react';

// "Миний татсан зургууд": бүртгэлгүй худалдан авагчийн захиалгууд энэ төхөөрөмж дээр.
// Өөр төхөөрөмжөөс имэйлээр ирсэн холбоосоор нээхэд энд нэмэгдэнэ.

const KEY = 'pic:orders:v1';
const CHANGE = 'pic:orders-change';
const MAX = 100;

export interface SavedOrder {
  id: string;
  token: string;
  eventTitle: string;
  total: number;
  createdAt: string;
}

const EMPTY: SavedOrder[] = [];
let cached: { raw: string | null; value: SavedOrder[] } = { raw: null, value: EMPTY };

function read(): SavedOrder[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cached.raw) return cached.value;
  let value = EMPTY;
  try {
    value = raw ? (JSON.parse(raw) as SavedOrder[]) : EMPTY;
  } catch {
    value = EMPTY;
  }
  cached = { raw, value };
  return value;
}

export function saveOrder(order: SavedOrder) {
  const rest = read().filter((o) => o.id !== order.id);
  try {
    localStorage.setItem(KEY, JSON.stringify([order, ...rest].slice(0, MAX)));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGE));
}

export function findSavedOrder(id: string): SavedOrder | undefined {
  return read().find((o) => o.id === id);
}

export function forgetOrder(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(read().filter((o) => o.id !== id)));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useSavedOrders(): SavedOrder[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Захиалгын нууц холбоос: токен #fragment-д (сервер, proxy log-д очихгүй) */
export function orderHref(id: string, token: string): string {
  return `/orders/${id}#t=${encodeURIComponent(token)}`;
}
