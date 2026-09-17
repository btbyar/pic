export interface BankDeeplink {
  name: string;
  description: string;
  logo: string;
  link: string;
}

export interface CreateInvoiceInput {
  /** Манай Payment мөрийн ID — callback URL болон sender_invoice_no-д */
  paymentId: string;
  amount: number;
  description: string;
}

export interface Invoice {
  invoiceId: string;
  /** QR кодонд хувиргах текст (банкны апп уншина) */
  qrText: string;
  /** Утсан дээр банкны апп шууд нээх холбоосууд */
  deeplinks: BankDeeplink[];
  shortUrl: string | null;
  raw: unknown;
}

export interface InvoiceCheck {
  paid: boolean;
  paidAmount: number;
  providerPaymentId: string | null;
  raw: unknown;
}

/** Төлбөрийн үйлчилгээ түр ажиллахгүй (сүлжээ, 5xx, token) */
export class PaymentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentUnavailableError';
  }
}

/**
 * Төлбөрийн провайдер (QPay эсвэл хөгжүүлэлтийн mock).
 * Дүрэм: callback-т хэзээ ч итгэхгүй — төлөгдсөн эсэхийг үргэлж `checkInvoice`-ээр провайдераас асууна.
 */
export abstract class PaymentProvider {
  abstract readonly name: 'QPAY' | 'MOCK';
  abstract createInvoice(input: CreateInvoiceInput): Promise<Invoice>;
  abstract checkInvoice(invoiceId: string): Promise<InvoiceCheck>;
  /** Хугацаа нь дууссан нэхэмжлэхийг цуцлах (амжилтгүй болсон ч захиалга EXPIRED хэвээр) */
  abstract cancelInvoice(invoiceId: string): Promise<void>;
}
