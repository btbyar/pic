import { Global, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Имэйл илгээгч. Тестэд санах ойн хувилбараар орлуулна. */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}

/** SMTP (dev: Mailpit, prod: SES/Mailgun/Postmark г.м. SMTP relay) */
@Injectable()
export class SmtpMailer extends Mailer implements OnModuleDestroy {
  private readonly transport: Transporter;
  private readonly from: string;
  private readonly logger = new Logger('Mailer');

  constructor(config: ConfigService<Env, true>) {
    super();
    this.transport = createTransport(config.get('SMTP_URL', { infer: true }));
    this.from = config.get('MAIL_FROM', { infer: true });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
    // Хүлээн авагчийн хаяг, агуулгыг log-д бичихгүй
    this.logger.log(`sent "${message.subject}"`);
  }

  onModuleDestroy() {
    this.transport.close();
  }
}

@Global()
@Module({
  providers: [{ provide: Mailer, useClass: SmtpMailer }],
  exports: [Mailer],
})
export class MailModule {}
