import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';

export interface RateLimitRule {
  /** Redis түлхүүрийн угтвар, ж: "login:email" */
  name: string;
  limit: number;
  windowSec: number;
}

/**
 * Fixed-window хязгаарлагч. Хайлтын (Phase 4) хувьд sliding window руу шилжүүлнэ;
 * нэвтрэлтийн brute-force хамгаалалтад энэ хангалттай.
 */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Хязгаар хэтэрсэн бол 429 шиднэ. `key` нь аль хэдийн hash-лагдсан байх ёстой (имэйл/IP түүхийгээр биш). */
  async consume(rule: RateLimitRule, key: string): Promise<void> {
    const redisKey = `rl:${rule.name}:${key}`;
    const results = await this.redis.multi().incr(redisKey).expire(redisKey, rule.windowSec, 'NX').ttl(redisKey).exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    if (count > rule.limit) {
      const ttl = Number(results?.[2]?.[1] ?? rule.windowSec);
      throw new HttpException(
        { statusCode: 429, code: 'rate_limited', retryAfterSec: Math.max(ttl, 1) },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async reset(rule: RateLimitRule, key: string): Promise<void> {
    await this.redis.del(`rl:${rule.name}:${key}`);
  }
}
