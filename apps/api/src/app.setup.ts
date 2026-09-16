import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { originCheck } from './common/origin-check';
import type { Env } from './config/env';

/** main.ts болон e2e тест ижил middleware-тэй ажиллана. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const webOrigin = config.get('WEB_ORIGIN', { infer: true });

  // Reverse proxy (Caddy/Cloudflare) ардаас req.ip зөв гарахын тулд
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.use(originCheck([webOrigin]));
  app.enableCors({ origin: webOrigin, credentials: true });
}
