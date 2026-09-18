import { z } from 'zod';

const base64Key32 = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64-encoded');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url(),

  APP_DATABASE_URL: z.string().min(1),
  // Админ модуль: pic_admin_role — biometric schema-д огт эрхгүй (docs/ARCHITECTURE.md §8)
  ADMIN_DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  S3_ENDPOINT: z.url(),
  // Браузерт өгөх presigned URL-ийн host
  S3_PUBLIC_ENDPOINT: z.url(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  S3_BUCKET_ORIGINALS: z.string().min(1),
  S3_BUCKET_PUBLIC: z.string().min(1),
  // pic-public-ийн нийтийн хаяг (prod: R2 custom domain / CDN)
  PUBLIC_MEDIA_BASE_URL: z.url(),

  // BullMQ түлхүүрийн угтвар. E2E тест тусдаа угтвар ашиглаж, ажиллаж буй dev worker-тэй мөргөлдөхгүй.
  QUEUE_PREFIX: z.string().regex(/^[a-z0-9-]+$/).default('pic'),
  // Нэг worker процесс зэрэг боловсруулах зургийн тоо (CPU-ийн цөмийн тоотой ойролцоо)
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(2),

  ML_BASE_URL: z.url(),
  // API/worker → ML сервисийн дотоод токен (ML талд ижил нэртэй хувьсагч)
  ML_SERVICE_TOKEN: z.string().default(''),

  // TOTP secret, банкны данс шифрлэх AES-256-GCM түлхүүр
  FIELD_ENCRYPTION_KEY: base64Key32,
  // IP хаягийг hash-лах HMAC түлхүүр
  IP_HASH_SECRET: z.string().min(32),

  // Админы 2FA. Зөвхөн хөгжүүлэлтэд түр унтрааж болно — production-д унтраавал API асахгүй.
  ADMIN_MFA_REQUIRED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // Төлбөр: "mock" нь зөвхөн хөгжүүлэлтэд (жинхэнэ мөнгө шилжихгүй)
  PAYMENT_PROVIDER: z.enum(['mock', 'qpay']).default('mock'),
  QPAY_BASE_URL: z.url().default('https://merchant-sandbox.qpay.mn/v2'),
  QPAY_USERNAME: z.string().default(''),
  QPAY_PASSWORD: z.string().default(''),
  QPAY_INVOICE_CODE: z.string().default(''),
  // QPay төлбөр орсны дараа дуудах манай хаяг (интернэтээс хүрэх ёстой)
  QPAY_CALLBACK_URL: z.url().default('http://localhost:4000/payments/qpay/callback'),

  // Имэйл: smtp://user:pass@host:port эсвэл smtps://… (dev: Mailpit smtp://localhost:1025)
  SMTP_URL: z.string().regex(/^smtps?:\/\//, 'must start with smtp:// or smtps://').default('smtp://localhost:1025'),
  MAIL_FROM: z.string().min(3).default('Pic <no-reply@pic.local>'),
})
  .refine((env) => env.NODE_ENV !== 'production' || env.ADMIN_MFA_REQUIRED, {
    path: ['ADMIN_MFA_REQUIRED'],
    message: 'admin 2FA cannot be disabled in production',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.ML_SERVICE_TOKEN.length >= 32, {
    path: ['ML_SERVICE_TOKEN'],
    message: 'must be at least 32 characters in production',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.PAYMENT_PROVIDER === 'qpay', {
    path: ['PAYMENT_PROVIDER'],
    message: 'mock payments are not allowed in production',
  })
  .refine(
    (env) => env.PAYMENT_PROVIDER !== 'qpay' || (env.QPAY_USERNAME && env.QPAY_PASSWORD && env.QPAY_INVOICE_CODE),
    { path: ['QPAY_USERNAME'], message: 'QPAY_USERNAME, QPAY_PASSWORD and QPAY_INVOICE_CODE are required for qpay' },
  );

export type Env = z.output<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
