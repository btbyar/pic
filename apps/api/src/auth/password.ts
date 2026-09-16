import { hash, verify } from '@node-rs/argon2';

// OWASP-ийн argon2id санал болгосон доод хэмжээ (seed-тэй ижил)
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, OPTIONS);

let dummyHash: Promise<string> | undefined;

/**
 * Хэрэглэгч олдоогүй үед ч argon2 тооцоолол хийж хугацааг тэнцүүлнэ —
 * хариу өгөх хугацаагаар бүртгэлтэй имэйлийг таах боломжгүй болгоно.
 */
export async function verifyPassword(passwordHash: string | null, password: string): Promise<boolean> {
  if (passwordHash === null) {
    dummyHash ??= hashPassword('dummy-password-for-timing');
    await verify(await dummyHash, password);
    return false;
  }
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
