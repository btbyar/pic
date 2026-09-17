import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../src/config/env';
import { MlClient, type MlFace } from '../src/ml/ml-client';

export const FAKE_MODEL_VERSION = 'fake-sface';
export const FAKE_ML_TOKEN = 'ml-token';

/** ML сервисийг орлох сервер: хүлээн авсан хүсэлтийг бүртгэж, тохируулсан хариу буцаана */
export class FakeMl {
  readonly server: Server;
  requests: { headers: IncomingHttpHeaders; body: Buffer }[] = [];
  status = 200;
  faces: MlFace[] = [];
  width = 0;
  height = 0;
  url = '';

  constructor() {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        this.requests.push({ headers: req.headers, body: Buffer.concat(chunks) });
        res.writeHead(this.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ width: this.width, height: this.height, modelVersion: FAKE_MODEL_VERSION, faces: this.faces }));
      });
    });
  }

  async listen(): Promise<this> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  client(): MlClient {
    const values = { ML_BASE_URL: this.url, ML_SERVICE_TOKEN: FAKE_ML_TOKEN };
    const config = { get: (key: keyof typeof values) => values[key] };
    return new MlClient(config as unknown as ConfigService<Env, true>);
  }

  close() {
    this.server.close();
  }
}

/** 128 хэмжээст нэгж векторын жинтэй нийлбэр: { 0: 0.8, 2: 0.6 } → 0.8·e0 + 0.6·e2 (L2-normalized) */
export function vec(weights: Record<number, number>): number[] {
  const v = Array.from({ length: 128 }, (_, i) => weights[i] ?? 0);
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}

export function fakeFace(embedding: number[], sizePx = 80, bbox: [number, number, number, number] = [10, 10, 80, 96]): MlFace {
  return {
    bbox,
    landmarks: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
    detScore: 0.93,
    sizePx,
    quality: 0.8,
    embedding,
  };
}
