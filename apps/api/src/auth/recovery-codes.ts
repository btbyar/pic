import { randomInt } from 'node:crypto';
import { sha256Hex } from '../common/crypto';

// Андуурагдах тэмдэгтгүй (0/O, 1/I/L) цагаан толгой
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

/** Хэрэглэгч зураастай/зураасгүй, жижиг үсгээр бичсэн ч таарна */
export function hashRecoveryCode(code: string): string {
  return sha256Hex(code.toUpperCase().replace(/[^0-9A-Z]/g, ''));
}
