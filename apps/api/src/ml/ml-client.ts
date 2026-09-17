import { Global, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

export const EMBEDDING_DIM = 128;
const ML_TIMEOUT_MS = 60_000;

export interface MlFace {
  bbox: [number, number, number, number];
  landmarks: [number, number][];
  detScore: number;
  sizePx: number;
  quality: number;
  embedding: number[];
}

export interface MlFacesResponse {
  width: number;
  height: number;
  modelVersion: string;
  faces: MlFace[];
}

/** ML сервис зургийг уншиж чадаагүй (эвдэрсэн/хэт том) — дахин оролдох утгагүй */
export class MlRejectedImageError extends Error {
  constructor(readonly status: number) {
    super(`ml_${status}`);
    this.name = 'MlRejectedImageError';
  }
}

/** ML сервис түр ажиллахгүй (асаагүй, модель ачаалаагүй, токен буруу, timeout) */
export class MlUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MlUnavailableError';
  }
}

/** API (селфи хайлт) ба worker (индексжүүлэлт) хоёулаа ашиглана. Зураг, embedding-ийг log-д бичихгүй. */
@Injectable()
export class MlClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('ML_BASE_URL', { infer: true }).replace(/\/+$/, '');
    this.token = config.get('ML_SERVICE_TOKEN', { infer: true });
  }

  async detectFaces(jpeg: Buffer): Promise<MlFacesResponse> {
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'image.jpg');
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/v1/faces`, {
        method: 'POST',
        body: form,
        headers: this.token ? { authorization: `Bearer ${this.token}` } : {},
        signal: AbortSignal.timeout(ML_TIMEOUT_MS),
      });
    } catch (err) {
      throw new MlUnavailableError(err instanceof Error ? err.message : 'ml request failed');
    }
    if (res.status === 422 || res.status === 413) throw new MlRejectedImageError(res.status);
    if (!res.ok) throw new MlUnavailableError(`ML responded ${res.status}`);
    const body = (await res.json()) as MlFacesResponse;
    return { ...body, faces: body.faces.filter((f) => f.embedding.length === EMBEDDING_DIM) };
  }
}

@Global()
@Module({ providers: [MlClient], exports: [MlClient] })
export class MlModule {}

/** pgvector-ийн текст формат. Параметр болгож дамжуулна (SQL-д шууд залгахгүй). */
export function toVectorLiteral(embedding: number[]): string {
  if (!embedding.every(Number.isFinite)) throw new Error('embedding contains non-finite values');
  return `[${embedding.join(',')}]`;
}
