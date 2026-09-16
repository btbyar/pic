import { z } from 'zod';

// Админ UI-аас deploy хийлгүйгээр өөрчлөгдөх тохиргоо (SystemSetting хүснэгт).
// Түлхүүр бүр өөрийн schema-тай; DB-д утга байхгүй бол default ашиглана.
export const systemSettingSchemas = {
  'search.thresholdHigh': z.number().min(0).max(1).default(0.5),
  'search.thresholdLow': z.number().min(0).max(1).default(0.35),
  'search.expansionTopK': z.number().int().min(0).max(20).default(5),
  'search.sessionTtlHours': z.number().int().min(1).max(24).default(24),
  'search.rateLimitPerMinute': z.number().int().min(1).max(120).default(10),
  'face.minSizePx': z.number().int().min(0).max(512).default(32),
  'face.minQuality': z.number().min(0).max(1).default(0),
  'upload.maxFileSizeMb': z.number().int().min(1).max(200).default(50),
  'download.urlTtlSeconds': z.number().int().min(30).max(3600).default(300),
} as const;

export type SystemSettingKey = keyof typeof systemSettingSchemas;
export type SystemSettings = {
  [K in SystemSettingKey]: z.output<(typeof systemSettingSchemas)[K]>;
};

export const SYSTEM_SETTING_KEYS = Object.keys(systemSettingSchemas) as SystemSettingKey[];

export function defaultSystemSettings(): SystemSettings {
  return Object.fromEntries(
    SYSTEM_SETTING_KEYS.map((key) => [key, systemSettingSchemas[key].parse(undefined)]),
  ) as SystemSettings;
}
