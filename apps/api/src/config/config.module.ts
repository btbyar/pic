import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env';

/** API болон worker хоёулаа ижил тохиргоо, ижил шалгалт ашиглана */
export const AppConfigModule = ConfigModule.forRoot({
  isGlobal: true,
  // apps/api-аас ажиллуулахад монорепогийн root .env-ийг уншина
  envFilePath: ['.env', '../../.env'],
  validate: validateEnv,
});
