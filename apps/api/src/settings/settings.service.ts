import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import type { PrismaClient } from '@pic/db';
import { defaultSystemSettings, type SystemSettingKey, type SystemSettings, systemSettingSchemas } from '@pic/shared';
import { PRISMA } from '../prisma/prisma.module';

const CACHE_TTL_MS = 30_000;

/**
 * SystemSetting хүснэгтээс тохиргоо уншина. Админ өөрчилсний дараа ≤30 секундэд хүчинтэй болно.
 * DB-д буруу утга байвал default-оор ажиллаж, анхааруулга бичнэ (платформ зогсохгүй).
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache: { value: SystemSettings; expiresAt: number } | null = null;

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async get<K extends SystemSettingKey>(key: K): Promise<SystemSettings[K]> {
    return (await this.all())[key];
  }

  async all(): Promise<SystemSettings> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.value;
    const settings = defaultSystemSettings();
    const rows = await this.prisma.systemSetting.findMany();
    for (const row of rows) {
      const schema = systemSettingSchemas[row.key as SystemSettingKey];
      if (!schema) continue;
      const parsed = schema.safeParse(row.value);
      if (parsed.success) (settings as Record<string, unknown>)[row.key] = parsed.data;
      else this.logger.warn(`Invalid system setting "${row.key}", using default`);
    }
    this.cache = { value: settings, expiresAt: Date.now() + CACHE_TTL_MS };
    return settings;
  }

  invalidate() {
    this.cache = null;
  }
}

@Global()
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
