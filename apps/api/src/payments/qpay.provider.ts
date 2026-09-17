import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import {
  type BankDeeplink,
  type CreateInvoiceInput,
  type Invoice,
  type InvoiceCheck,
  PaymentProvider,
  PaymentUnavailableError,
} from './payment-provider';

const TIMEOUT_MS = 15_000;
/** Token-ийг хугацаа дуусахаас өмнө шинэчлэх зай */
const TOKEN_SKEW_MS = 60_000;

interface TokenResponse {
  access_token: string;
  /** QPay нь unix timestamp (секунд) буцаадаг; зарим орчинд үргэлжлэх хугацаа (секунд) */
  expires_in: number;
}

interface InvoiceResponse {
  invoice_id: string;
  qr_text: string;
  qPay_shortUrl?: string;
  urls?: BankDeeplink[];
}

interface CheckResponse {
  count: number;
  paid_amount?: number;
  rows: { payment_id: string; payment_status: string; payment_amount: number | string }[];
}

/**
 * QPay merchant API v2 (https://developer.qpay.mn).
 * Нэвтрэх: Basic auth → access token (санах ойд, хугацаа дуусахаар дахин авна).
 */
@Injectable()
export class QPayProvider extends PaymentProvider {
  readonly name = 'QPAY' as const;
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly invoiceCode: string;
  private readonly callbackUrl: string;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.baseUrl = config.get('QPAY_BASE_URL', { infer: true }).replace(/\/+$/, '');
    this.username = config.get('QPAY_USERNAME', { infer: true });
    this.password = config.get('QPAY_PASSWORD', { infer: true });
    this.invoiceCode = config.get('QPAY_INVOICE_CODE', { infer: true });
    this.callbackUrl = config.get('QPAY_CALLBACK_URL', { infer: true });
  }

  async createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
    const callback = new URL(this.callbackUrl);
    callback.searchParams.set('payment', input.paymentId);
    const res = await this.request<InvoiceResponse>('POST', '/invoice', {
      invoice_code: this.invoiceCode,
      sender_invoice_no: input.paymentId,
      invoice_receiver_code: 'terminal',
      invoice_description: input.description.slice(0, 255),
      amount: input.amount,
      callback_url: callback.toString(),
    });
    if (!res.invoice_id || !res.qr_text) throw new PaymentUnavailableError('qpay invoice response is missing fields');
    return {
      invoiceId: res.invoice_id,
      qrText: res.qr_text,
      deeplinks: (res.urls ?? []).map(({ name, description, logo, link }) => ({ name, description, logo, link })),
      shortUrl: res.qPay_shortUrl ?? null,
      // qr_image (base64 PNG) нь том тул хадгалахгүй — QR-ийг qr_text-ээс браузер зурна
      raw: { invoice_id: res.invoice_id, qPay_shortUrl: res.qPay_shortUrl ?? null, urls: res.urls ?? [] },
    };
  }

  async checkInvoice(invoiceId: string): Promise<InvoiceCheck> {
    const res = await this.request<CheckResponse>('POST', '/payment/check', {
      object_type: 'INVOICE',
      object_id: invoiceId,
      offset: { page_number: 1, page_limit: 100 },
    });
    const paidRows = (res.rows ?? []).filter((r) => r.payment_status === 'PAID');
    const paidAmount = paidRows.reduce((sum, r) => sum + Number(r.payment_amount), 0);
    return {
      paid: paidRows.length > 0,
      paidAmount,
      providerPaymentId: paidRows[0]?.payment_id ?? null,
      raw: res,
    };
  }

  async cancelInvoice(invoiceId: string): Promise<void> {
    await this.request('DELETE', `/invoice/${encodeURIComponent(invoiceId)}`);
  }

  // ---------------------------------------------------------------- дотоод

  private async request<T>(method: 'POST' | 'DELETE', path: string, body?: unknown, retried = false): Promise<T> {
    const token = await this.accessToken();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new PaymentUnavailableError(`qpay ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.status === 401 && !retried) {
      this.token = null;
      return this.request<T>(method, path, body, true);
    }
    if (!res.ok) {
      // Хариуны body-д картын/хэрэглэгчийн мэдээлэл байж болзошгүй тул зөвхөн статус
      throw new PaymentUnavailableError(`qpay ${path} responded ${res.status}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_SKEW_MS > Date.now()) return this.token.value;
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/auth/token`, {
        method: 'POST',
        headers: { authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new PaymentUnavailableError(`qpay auth: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) throw new PaymentUnavailableError(`qpay auth responded ${res.status}`);
    const data = (await res.json()) as TokenResponse;
    const expiresAt = data.expires_in > 1e9 ? data.expires_in * 1000 : Date.now() + data.expires_in * 1000;
    this.token = { value: data.access_token, expiresAt };
    return data.access_token;
  }
}
