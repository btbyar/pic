import { randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Mailer, type MailMessage } from '../src/mail/mailer';

/** Илгээсэн имэйлийг санах ойд хадгална */
export class FakeMailer extends Mailer {
  sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }

  /** Сүүлийн имэйлийн текстээс холбоос */
  lastLink(): string {
    const text = this.sent.at(-1)?.text ?? '';
    const match = /https?:\/\/\S+/.exec(text);
    if (!match) throw new Error('no link in last email');
    return match[0];
  }
}

interface FakeInvoice {
  id: string;
  body: Record<string, unknown>;
  paidAmount: number | null;
  cancelled: boolean;
}

/** QPay merchant API v2-ийн хуурамч сервер: token, invoice, payment/check, invoice цуцлах */
export class FakeQPay {
  readonly server: Server;
  url = '';
  invoices = new Map<string, FakeInvoice>();
  requests: { method: string; path: string; headers: IncomingHttpHeaders; body: unknown }[] = [];
  tokensIssued = 0;
  /** Дараагийн API хүсэлтэд 401 буцаах (token хүчингүй болсныг дуурайна) */
  expireTokenOnce = false;
  failAll = false;
  private validToken = '';

  constructor(readonly username = 'merchant', readonly password = 'secret') {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const body: unknown = raw ? JSON.parse(raw) : null;
        const path = req.url ?? '';
        this.requests.push({ method: req.method ?? '', path, headers: req.headers, body });
        const send = (status: number, data?: unknown) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(data === undefined ? '' : JSON.stringify(data));
        };
        if (this.failAll) return send(502, { error: 'down' });

        if (req.method === 'POST' && path === '/v2/auth/token') {
          const expected = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
          if (req.headers.authorization !== expected) return send(401, { error: 'bad credentials' });
          this.tokensIssued++;
          this.validToken = `token-${this.tokensIssued}`;
          return send(200, { access_token: this.validToken, expires_in: Math.floor(Date.now() / 1000) + 86_400 });
        }
        if (req.headers.authorization !== `Bearer ${this.validToken}` || this.expireTokenOnce) {
          this.expireTokenOnce = false;
          this.validToken = '';
          return send(401, { error: 'token expired' });
        }
        if (req.method === 'POST' && path === '/v2/invoice') {
          // Жинхэнэ QPay-ийн адил давтагдашгүй (тест олон удаа ажиллахад DB-ийн unique-тэй мөргөлдөхгүй)
          const id = `inv-${randomUUID()}`;
          this.invoices.set(id, { id, body: body as Record<string, unknown>, paidAmount: null, cancelled: false });
          return send(200, {
            invoice_id: id,
            qr_text: `QPAY-QR-${id}`,
            qr_image: 'iVBORw0KGgo=',
            qPay_shortUrl: `https://s.qpay.mn/${id}`,
            urls: [{ name: 'Khan bank', description: 'Хаан банк', logo: 'https://qpay.mn/khan.png', link: `khanbank://q?qPay_QRcode=${id}` }],
          });
        }
        if (req.method === 'POST' && path === '/v2/payment/check') {
          const invoice = this.invoices.get((body as { object_id: string }).object_id);
          const rows =
            invoice?.paidAmount != null
              ? [{ payment_id: `pay-${invoice.id}`, payment_status: 'PAID', payment_amount: String(invoice.paidAmount) }]
              : [];
          return send(200, { count: rows.length, paid_amount: invoice?.paidAmount ?? 0, rows });
        }
        const cancel = /^\/v2\/invoice\/(.+)$/.exec(path);
        if (req.method === 'DELETE' && cancel) {
          const invoice = this.invoices.get(decodeURIComponent(cancel[1]!));
          if (invoice) invoice.cancelled = true;
          return send(200, { message: 'cancelled' });
        }
        send(404, { error: 'not found' });
      });
    });
  }

  async listen(): Promise<this> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}/v2`;
    return this;
  }

  /** Хэрэглэгч банкны аппаар төлсөн гэж тэмдэглэнэ */
  pay(invoiceId: string, amount?: number) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`unknown invoice ${invoiceId}`);
    invoice.paidAmount = amount ?? Number(invoice.body['amount']);
  }

  close() {
    this.server.close();
  }
}
