import {
  ConflictException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Event, Order, PrismaClient } from '@pic/db';
import {
  allocateOrder,
  type CreateOrderInput,
  DEFAULT_PHOTOGRAPHER_SHARE_PCT,
  DOWNLOADABLE_ORDER_STATUSES,
  type OrderPriceInput,
  type OrderQuoteInput,
  type PhotoStorageKeys,
  priceOrder,
} from '@pic/shared';
import type { Redis } from 'ioredis';
import type { AuthContext } from '../auth/decorators';
import { FieldCipher, hashIp, randomToken, safeEqualHex, sha256Hex, uuidv7 } from '../common/crypto';
import { RateLimiter } from '../common/rate-limiter';
import type { Env } from '../config/env';
import { EventsService, VISIBLE_PHOTO } from '../events/events.service';
import { MockPaymentProvider } from '../payments/mock.provider';
import { OrderPaymentsService } from '../payments/order-payments.service';
import { type BankDeeplink, PaymentProvider, PaymentUnavailableError } from '../payments/payment-provider';
import { PRISMA } from '../prisma/prisma.module';
import { REDIS } from '../redis/redis.module';
import { SearchService } from '../search/search.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.module';

const CREATE_BY_IP = { name: 'order:create', limit: 20, windowSec: 60 * 60 };
const QUOTE_BY_IP = { name: 'order:quote', limit: 120, windowSec: 60 };
const READ_BY_IP = { name: 'order:read', limit: 120, windowSec: 60 };
/** Нэг захиалгаас цагт татах дээд тоо (холбоос олон нийтэд тархсан үед хамгаална) */
const DOWNLOADS_PER_ORDER = { name: 'order:download', limit: 600, windowSec: 60 * 60 };
/** Polling (3с тутам) бүрт QPay руу хүсэлт илгээхгүй */
const PROVIDER_CHECK_THROTTLE_MS = 3_000;

interface PaymentView {
  provider: 'QPAY' | 'MOCK';
  qrText: string;
  deeplinks: BankDeeplink[];
  shortUrl: string | null;
}

export interface OrderRequestMeta {
  ip: string;
  userAgent: string | undefined;
}

/**
 * Бүртгэлгүй худалдан авалт. Захиалгад хандах эрх = нууц токен (DB-д зөвхөн SHA-256), SearchSession-тэй холбоогүй.
 * Үнийг үргэлж серверт дахин тооцно — браузерын үнэд итгэхгүй.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly cipher: FieldCipher;
  private readonly ipSecret: string;
  private readonly allowMockPayments: boolean;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly events: EventsService,
    private readonly search: SearchService,
    private readonly payments: OrderPaymentsService,
    private readonly provider: PaymentProvider,
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly rateLimiter: RateLimiter,
    config: ConfigService<Env, true>,
  ) {
    this.cipher = new FieldCipher(config.get('FIELD_ENCRYPTION_KEY', { infer: true }));
    this.ipSecret = config.get('IP_HASH_SECRET', { infer: true });
    this.allowMockPayments = config.get('NODE_ENV', { infer: true }) !== 'production' && provider.name === 'MOCK';
  }

  // ================================================================ үнэ

  async quote(slug: string, input: OrderQuoteInput, auth: AuthContext | undefined, ip: string) {
    await this.rateLimiter.consume(QUOTE_BY_IP, hashIp(ip, this.ipSecret));
    const event = await this.events.findViewableEvent(slug, { accessToken: input.t, auth });
    const { photos, unavailable } = await this.loadPhotos(event, input.photoIds);
    if (photos.length === 0) {
      return { photoIds: [], unavailable, pricePerPhoto: event.pricePerPhoto, bundlePrice: event.bundlePrice, price: null };
    }
    const price = priceOrder(await this.priceInput(event, photos.map((p) => p.id), input.searchSessionId));
    return {
      photoIds: photos.map((p) => p.id),
      unavailable,
      pricePerPhoto: event.pricePerPhoto,
      bundlePrice: event.bundlePrice,
      price,
    };
  }

  // ================================================================ захиалга үүсгэх

  async create(slug: string, input: CreateOrderInput, auth: AuthContext | undefined, ip: string) {
    await this.rateLimiter.consume(CREATE_BY_IP, hashIp(ip, this.ipSecret));
    const event = await this.events.findViewableEvent(slug, { accessToken: input.t, auth });
    const { photos, unavailable } = await this.loadPhotos(event, input.photoIds);
    if (unavailable.length > 0) {
      // Сагсанд байх хооронд нуугдсан/устсан зураг — хэрэглэгч сагсаа шинэчилж, үнийг дахин харна
      throw new ConflictException({ statusCode: 409, code: 'photos_unavailable', photoIds: unavailable });
    }

    const price = priceOrder(await this.priceInput(event, input.photoIds, input.searchSessionId));
    const amounts = allocateOrder(price.total, photos.map((p) => p.sharePct));
    const token = randomToken();
    const free = price.total === 0;
    const ttlMin = await this.settings.get('order.paymentTtlMinutes');
    const now = new Date();

    const order = await this.prisma.order.create({
      data: {
        eventId: event.id,
        eventTitleSnap: event.title,
        totalAmount: price.total,
        accessTokenHash: sha256Hex(token),
        contactEmail: input.email ?? null,
        accessTokenEnc: input.email ? this.cipher.encrypt(token) : null,
        paymentDueAt: new Date(now.getTime() + ttlMin * 60_000),
        items: {
          create: photos.map((photo, i) => ({
            photoId: photo.id,
            photoFilenameSnap: photo.originalFilename,
            photographerId: photo.photographerId,
            pricing: price.bundleApplied ? 'BUNDLE' : 'SINGLE',
            ...amounts[i]!,
          })),
        },
      },
    });

    if (free) {
      await this.payments.markPaid(order.id, null, null, null);
    } else {
      await this.openInvoice(order, event, photos.length);
    }
    return { id: order.id, accessToken: token, total: price.total };
  }

  // ================================================================ харах, татах

  async get(orderId: string, token: string, ip: string) {
    await this.rateLimiter.consume(READ_BY_IP, hashIp(ip, this.ipSecret));
    let order = await this.authorize(orderId, token);

    if (order.status === 'PENDING' || order.status === 'EXPIRED') {
      const due = await this.redis.set(`paycheck:${order.id}`, '1', 'PX', PROVIDER_CHECK_THROTTLE_MS, 'NX');
      if (due) {
        try {
          if ((await this.payments.reconcile(order.id)) === 'PAID') order = await this.authorize(orderId, token);
        } catch (err) {
          // QPay түр унасан ч захиалгын хуудас нээгдэнэ; дараагийн polling дахин шалгана
          if (!(err instanceof PaymentUnavailableError)) throw err;
          this.logger.warn(`payment check failed for ${order.id}: ${err.message}`);
        }
      }
    }

    const [items, event, payment] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: { orderId: order.id },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          pricing: true,
          refundId: true,
          photo: { select: { id: true, storageKeys: true, width: true, height: true, hiddenAt: true, deletedAt: true } },
        },
      }),
      order.eventId
        ? this.prisma.event.findUnique({ where: { id: order.eventId }, select: { expiresAt: true, deletedAt: true } })
        : null,
      order.status === 'PENDING'
        ? this.prisma.payment.findFirst({ where: { orderId: order.id, status: 'PENDING' }, orderBy: { createdAt: 'desc' } })
        : null,
    ]);

    const raw = payment?.rawPayload as { qrText?: string; deeplinks?: BankDeeplink[]; shortUrl?: string | null } | undefined;
    const paymentView: PaymentView | null =
      payment && raw?.qrText
        ? { provider: payment.provider as PaymentView['provider'], qrText: raw.qrText, deeplinks: raw.deeplinks ?? [], shortUrl: raw.shortUrl ?? null }
        : null;

    return {
      id: order.id,
      status: order.status,
      eventTitle: order.eventTitleSnap,
      totalAmount: order.totalAmount,
      bundleApplied: items.some((i) => i.pricing === 'BUNDLE'),
      emailOnFile: order.contactEmail !== null,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      paymentDueAt: order.paymentDueAt,
      downloadableUntil: event && !event.deletedAt ? event.expiresAt : null,
      payment: paymentView,
      mockPayment: this.allowMockPayments && paymentView?.provider === 'MOCK',
      items: items.map((item) => {
        const photo = item.photo;
        const available = photo !== null && !photo.hiddenAt && !photo.deletedAt && item.refundId === null;
        const keys = photo?.storageKeys as PhotoStorageKeys | undefined;
        return {
          id: item.id,
          photoId: photo?.id ?? null,
          available,
          refunded: item.refundId !== null,
          width: photo?.width ?? null,
          height: photo?.height ?? null,
          thumbUrl: available && keys?.thumb ? this.storage.publicUrl(keys.thumb) : null,
        };
      }),
    };
  }

  /** Эх зургийн богино хугацааны татах URL. Татсан бүрийг Download-д бүртгэнэ (IP-г HMAC-аар). */
  async downloadUrl(orderId: string, itemId: string, token: string, meta: OrderRequestMeta) {
    const order = await this.authorize(orderId, token);
    if (!DOWNLOADABLE_ORDER_STATUSES.includes(order.status)) {
      throw new ConflictException({ statusCode: 409, code: 'order_not_paid' });
    }
    await this.rateLimiter.consume(DOWNLOADS_PER_ORDER, order.id);

    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId: order.id },
      include: { photo: { include: { event: { select: { slug: true, expiresAt: true, deletedAt: true } } } } },
    });
    if (!item) throw new NotFoundException({ statusCode: 404, code: 'order_item_not_found' });
    const photo = item.photo;
    // Буцаалт хийсэн, устгуулах хүсэлтээр нуусан, retention-оор устсан зургийг татуулахгүй
    if (item.refundId || !photo || photo.hiddenAt || photo.deletedAt || photo.event.deletedAt || photo.event.expiresAt <= new Date()) {
      throw new GoneException({ statusCode: 410, code: 'photo_unavailable' });
    }

    await this.prisma.download.create({
      data: {
        orderItemId: item.id,
        photoId: photo.id,
        ipHash: hashIp(meta.ip, this.ipSecret),
        userAgent: meta.userAgent ?? null,
      },
    });
    const keys = photo.storageKeys as unknown as PhotoStorageKeys;
    const url = await this.storage.presignGet('originals', keys.original, {
      expiresInSec: await this.settings.get('download.urlTtlSeconds'),
      filename: photo.originalFilename,
    });
    return { url };
  }

  /** Хөгжүүлэлт: mock нэхэмжлэхийг "төлөх". Production болон QPay горимд байхгүй (404). */
  async simulatePayment(orderId: string, token: string) {
    if (!this.allowMockPayments) throw new NotFoundException({ statusCode: 404, code: 'not_found' });
    const order = await this.authorize(orderId, token);
    const payment = await this.prisma.payment.findFirst({ where: { orderId: order.id, provider: 'MOCK', status: 'PENDING' } });
    if (!payment) throw new ConflictException({ statusCode: 409, code: 'invalid_status_transition' });
    if (!(this.provider instanceof MockPaymentProvider) || !(await this.provider.simulatePayment(payment.providerInvoiceId))) {
      throw new ConflictException({ statusCode: 409, code: 'invalid_status_transition' });
    }
    return { status: await this.payments.reconcile(order.id) };
  }

  /** QPay callback: манай Payment ID → захиалга */
  async orderIdForPayment(paymentId: string): Promise<string | null> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, select: { orderId: true } });
    return payment?.orderId ?? null;
  }

  // ================================================================ дотоод

  private async authorize(orderId: string, token: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    // Токен буруу үед ч "олдсонгүй" — захиалга байгаа эсэхийг задруулахгүй
    if (!order || !safeEqualHex(sha256Hex(token), order.accessTokenHash)) {
      throw new NotFoundException({ statusCode: 404, code: 'order_not_found' });
    }
    return order;
  }

  private async loadPhotos(event: Event, photoIds: string[]) {
    const rows = await this.prisma.photo.findMany({
      where: { id: { in: photoIds }, eventId: event.id, ...VISIBLE_PHOTO },
      select: {
        id: true,
        originalFilename: true,
        photographerId: true,
        photographer: { select: { photographerProfile: { select: { revenueSharePct: true } } } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    // Сагсны дарааллыг хадгална
    const photos = photoIds.flatMap((id) => {
      const r = byId.get(id);
      return r
        ? [{
            id: r.id,
            originalFilename: r.originalFilename,
            photographerId: r.photographerId,
            sharePct: r.photographer.photographerProfile?.revenueSharePct ?? DEFAULT_PHOTOGRAPHER_SHARE_PCT,
          }]
        : [];
    });
    return { photos, unavailable: photoIds.filter((id) => !byId.has(id)) };
  }

  /** Багц: зөвхөн сагсан дахь бүх зураг энэ хүний хайлтын үр дүнд байгаа үед (decision #4) */
  private async priceInput(event: Event, photoIds: string[], searchSessionId: string | undefined): Promise<OrderPriceInput> {
    const base = { itemCount: photoIds.length, pricePerPhoto: event.pricePerPhoto, bundlePrice: event.bundlePrice };
    // Багц хямд биш бол хайлтыг дахин тооцох шаардлагагүй
    if (event.bundlePrice === null || event.bundlePrice >= photoIds.length * event.pricePerPhoto) {
      return { ...base, searchMatch: true };
    }
    if (!searchSessionId) return { ...base, searchMatch: 'no_search' };
    const matched = await this.search.matchedPhotoIds(searchSessionId, event.id);
    if (!matched) return { ...base, searchMatch: 'search_expired' };
    return { ...base, searchMatch: photoIds.every((id) => matched.has(id)) ? true : 'not_matched' };
  }

  private async openInvoice(order: Order, event: Event, itemCount: number) {
    const paymentId = uuidv7();
    try {
      const invoice = await this.provider.createInvoice({
        paymentId,
        amount: order.totalAmount,
        description: `Pic: ${event.title} (${itemCount} зураг)`,
      });
      await this.prisma.payment.create({
        data: {
          id: paymentId,
          orderId: order.id,
          provider: this.provider.name,
          providerInvoiceId: invoice.invoiceId,
          amount: order.totalAmount,
          rawPayload: {
            invoice: invoice.raw as object,
            qrText: invoice.qrText,
            deeplinks: invoice.deeplinks as unknown as object[],
            shortUrl: invoice.shortUrl,
          },
        },
      });
    } catch (err) {
      if (!(err instanceof PaymentUnavailableError)) throw err;
      this.logger.warn(`invoice for order ${order.id} failed: ${err.message}`);
      await this.prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED', accessTokenEnc: null } });
      throw new HttpException({ statusCode: 503, code: 'payment_unavailable' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
