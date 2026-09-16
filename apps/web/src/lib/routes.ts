import type { Me } from './types';

/** Нэвтэрсний дараа хэрэглэгчийг хаашаа чиглүүлэх */
export function homeFor(me: Me): string {
  if (me.mfa.required && !me.mfa.passed) return me.mfa.enabled ? '/mfa' : '/mfa/setup';
  return me.role === 'ADMIN' ? '/admin' : '/photographer';
}
