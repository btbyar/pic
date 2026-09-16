# Архитектурын баримт (v1 — батлагдсан 2026-09-15)

> "⚠️" тэмдэгтэй хэсгүүд нь анхны даалгавраас зөрсөн, батлагдсан шийдвэрүүд.

## Батлагдсан шийдвэрүүд

| # | Сэдэв | Шийдвэр |
|---|---|---|
| 1 | Олон зурагчин | Нэг эвэнтэд олон зурагчин (`EventPhotographer`), орлого зураг бүрийн эзэнд |
| 2 | Захиалга олох | Нууц холбоос + сонголттой имэйл, SearchSession-тэй холбоогүй |
| 3 | e-barimt | MVP-д үгүй, загварт зай үлдээнэ |
| 4 | Багц үнэ | "Энэ эвэнтээс олдсон миний бүх зураг X₮" |
| 5 | Зурагчны нэвтрэлт | Имэйл + нууц үг |
| 6 | Frontend | Next.js 16 (App Router) |
| 7 | Prod | Нэг VPS (~8 vCPU) гэж тооцно, concurrency env-ээр тохируулна |
| 8 | Face модель | Dev: InsightFace `buffalo_l`. **Prod-оос өмнө арилжааны лиценз шийдэх** |
| 9 | Вектор хайлт | `event_id` btree + exact scan (HNSW биш) |
| 10 | Upload | Browser → R2 шууд presigned (Uppy, multipart) |
| 11 | OCR | RapidOCR (PaddleOCR загвар, ONNX Runtime) |
| 12 | Derivative | thumb 400px WebP, preview 1000px WebP + watermark |
| 13 | Rate limit | IP + анонимаар өгсөн cookie, хэтэрвэл Turnstile |
| 14 | Жижиг нүүр | Хадгална, default-аар хайлтаас хасна (`face.minSizePx`) |
| 15 | Хувилбар түгжилт | TypeScript 6.0.3 (pnpm catalog), Prisma 7.10.0, pnpm 12.4.2, Node 24 LTS. TS 7 болон Prisma 8-rc ашиглахгүй |
| 16 | Dev storage | MinIO-г `quay.io`-ийн түгжсэн tag-аар (Docker Hub-аас устсан). Prod: Cloudflare R2 |
| 17 | DB тест | Docker-гүйгээр PGlite (WASM Postgres + pgvector) дээр migration-ыг ажиллуулж шалгана |

---

## 1. Монорепогийн бүтэц

```
pic/
├─ apps/
│  ├─ web/                 Next.js (App Router) — оролцогч, зурагчин, /admin
│  │  ├─ app/[locale]/...  next-intl, default locale = mn
│  │  └─ messages/mn.json  бүх UI текст
│  └─ api/                 NestJS
│     ├─ src/main.ts       HTTP сервер
│     ├─ src/worker.ts     BullMQ worker (ижил код, тусдаа контейнер)
│     └─ src/modules/
│        auth, users, photographers, events, uploads, photos,
│        search, orders, payments, downloads, removal-requests,
│        admin, audit, settings, retention, stats
├─ services/
│  └─ ml/                  FastAPI + onnxruntime (uv-ээр удирдана)
│     ├─ app/faces.py      SCRFD + ArcFace
│     ├─ app/bibs.py       текст илрүүлэлт + таних
│     └─ models/           ONNX жин (git-д орохгүй, татах скрипттэй)
├─ packages/
│  ├─ db/                  ⚠️ Prisma схем, migration, seed, client (тусдаа багц — api, worker хоёулаа ашиглана)
│  ├─ shared/              Zod schema, DTO type, enum, үнийн тооцооны цэвэр функц
│  └─ config/              tsconfig, eslint, prettier preset
├─ infra/
│  ├─ docker/              Dockerfile-ууд (web, api, ml)
│  └─ minio/init.sh        bucket + CORS тохиргоо
├─ docs/
├─ docker-compose.yml      dev: postgres(pgvector), redis, minio, mailpit, api, worker, ml, web
├─ docker-compose.prod.yml
├─ .env.example
└─ pnpm-workspace.yaml
```

**Интерфейсээр тусгаарлах цэгүүд** (дараа солих боломжтой):
- `PaymentProvider` → `QPayProvider`, `MockPaymentProvider`
- `FaceEngine` → `InsightFaceHttpEngine` (дараа нь `RekognitionEngine`)
- `BibReader` → `OcrHttpBibReader`
- `ObjectStorage` → S3 SDK (MinIO / R2 ижил код)

**Bucket-ууд:**
- `pic-originals` — хувийн, зөвхөн presigned URL
- `pic-public` — thumb/preview, CDN-ээр, таамаглах боломжгүй key (`{eventId}/{photoId}-{hash}.webp`)

---

## 2. Өгөгдлийн сангийн схем (Prisma ноорог)

Мөнгөн дүн бүгд `Int` (төгрөг, бутархайгүй). ID нь `uuid`. Биометрийн хүснэгтүүд тусдаа Postgres schema `biometric`-д байна (доор 2.4).

### 2.1 Хэрэглэгч, эрх

```prisma
enum Role        { PHOTOGRAPHER ADMIN }          // PARTICIPANT = бүртгэлгүй, DB-д хэрэглэгч биш
enum UserStatus  { PENDING APPROVED REJECTED SUSPENDED }

model User {
  id            String     @id @default(uuid())
  email         String     @unique
  passwordHash  String                             // argon2id
  role          Role
  status        UserStatus @default(PENDING)
  displayName   String
  phone         String?
  totpSecretEnc String?                            // AES-GCM-ээр шифрлэсэн; ADMIN-д заавал
  totpEnabledAt DateTime?
  createdAt     DateTime   @default(now())
  deletedAt     DateTime?
  photographer  PhotographerProfile?
  sessions      AuthSession[]
}

// ⚠️ "Photographer" тусдаа хүснэгт биш: User + Profile. Админ ч User, нэг auth урсгал.
model PhotographerProfile {
  userId           String   @id
  revenueSharePct  Int      @default(70)          // зурагчны хувь
  bankName         String?
  bankAccountEnc   String?
  approvedById     String?
  approvedAt       DateTime?
  rejectionReason  String?
}

model AuthSession {                                 // httpOnly cookie, JWT localStorage-д биш
  id           String   @id                          // санамсаргүй 256-bit, hash-ээр хадгална
  userId       String
  mfaPassedAt  DateTime?
  expiresAt    DateTime
  createdAt    DateTime @default(now())
}
```

### 2.2 Эвэнт, зураг

```prisma
enum EventVisibility { PUBLIC UNLISTED HIDDEN }      // UNLISTED = нууц холбоосоор
enum ProcessingStatus { UPLOADING UPLOADED DERIVED INDEXED FAILED }

model Event {
  id               String   @id @default(uuid())
  slug             String   @unique
  title            String
  description      String?
  location         String?
  startsAt         DateTime
  endsAt           DateTime
  timezone         String   @default("Asia/Ulaanbaatar")
  ownerId          String                             // үүсгэсэн зурагчин
  visibility       EventVisibility @default(HIDDEN)
  accessTokenHash  String?                            // UNLISTED холбоосны токен
  featured         Boolean  @default(false)
  pricePerPhoto    Int                                // ₮
  bundlePrice      Int?                               // "Миний бүх зураг" багц (асуулт #4)
  retentionDays    Int      @default(180)
  expiresAt        DateTime                           // endsAt + retentionDays, retention job үүгээр ажиллана
  bibPattern       String?                            // жишээ: ^\d{3,5}$
  faceSearchEnabled Boolean @default(true)
  createdAt        DateTime @default(now())
  deletedAt        DateTime?
  photographers    EventPhotographer[]
  @@index([visibility, startsAt])
  @@index([expiresAt])
}

// ⚠️ Нэг эвэнтэд олон зурагчин (асуулт #1). Камерын цагийн зөрүүг энд засна.
model EventPhotographer {
  eventId        String
  userId         String
  clockOffsetSec Int @default(0)
  @@id([eventId, userId])
}

model UploadBatch {
  id             String   @id @default(uuid())
  eventId        String
  photographerId String
  totalFiles     Int
  createdAt      DateTime @default(now())
}

model Photo {
  id               String   @id @default(uuid())
  eventId          String
  photographerId   String
  uploadBatchId    String?
  originalFilename String
  storageKeys      Json                               // { original, preview, thumb }
  width            Int?
  height           Int?
  bytes            Int
  sha256           String?                            // давхардал илрүүлэх
  capturedAtRaw    DateTime?                          // EXIF-ийн засаагүй утга
  capturedAt       DateTime?                          // offset засагдсан, UTC
  processingStatus ProcessingStatus @default(UPLOADING)
  failureReason    String?
  faceCount        Int      @default(0)
  hiddenAt         DateTime?                          // админ албадан нуусан
  hiddenReason     String?
  deletedAt        DateTime?                          // soft delete, 30 хоногийн дараа purge
  createdAt        DateTime @default(now())
  @@unique([eventId, sha256])
  @@index([eventId, capturedAt])
  @@index([eventId, processingStatus])
}

model BibDetection {
  id          String  @id @default(uuid())
  photoId     String
  eventId     String                                  // шүүлтэд зориулж давхардуулсан
  bibNumber   String
  confidence  Float
  bbox        Json
  source      String  @default("OCR")                 // OCR | MANUAL
  @@index([eventId, bibNumber])
}
```

### 2.3 Захиалга, төлбөр

```prisma
enum OrderStatus   { PENDING PAID FAILED EXPIRED REFUNDED PARTIALLY_REFUNDED }
enum PayoutStatus  { PENDING PAID }

model Order {
  id               String   @id @default(uuid())
  eventId          String
  status           OrderStatus @default(PENDING)
  totalAmount      Int
  accessTokenHash  String                             // /orders/{id}?t=... холбоосоор дахин татах
  contactEmail     String?                            // сонголттой, зөвхөн холбоос илгээхэд (асуулт #2)
  paidAt           DateTime?
  createdAt        DateTime @default(now())
  // SearchSession-тэй ХОЛБОГДОХГҮЙ
}

model OrderItem {
  id                  String  @id @default(uuid())
  orderId             String
  photoId             String?                         // retention устгасны дараа null болно
  photoFilenameSnap   String                          // санхүүгийн бүртгэлд үлдэнэ
  photographerId      String
  price               Int
  photographerSharePct Int                            // худалдан авах мөчийн snapshot
  photographerAmount  Int
  platformAmount      Int
  refundedAt          DateTime?
}

model Payment {                                       // нэг захиалгад олон оролдлого
  id                String  @id @default(uuid())
  orderId           String
  provider          String                            // QPAY | MOCK
  providerInvoiceId String  @unique
  providerPaymentId String?
  status            String
  amount            Int
  rawPayload        Json
  createdAt         DateTime @default(now())
}

model Refund {
  id          String   @id @default(uuid())
  orderId     String
  amount      Int
  reason      String                                  // заавал
  itemIds     String[]
  createdById String
  createdAt   DateTime @default(now())
}

model Download {
  id          String   @id @default(uuid())
  orderItemId String
  photoId     String?
  ipHash      String                                  // HMAC(ip), түүхий IP биш
  userAgent   String?
  createdAt   DateTime @default(now())
}

model Payout {
  id              String  @id @default(uuid())
  photographerId  String
  period          String                              // "2026-09"
  grossAmount     Int
  refundAdjust    Int
  netAmount       Int
  status          PayoutStatus @default(PENDING)
  paidAt          DateTime?
  paidById        String?
  reference       String?
  @@unique([photographerId, period])
}
```

### 2.4 Биометр (`biometric` schema — админ модулиас хандах эрхгүй)

```prisma
model FaceEmbedding {
  id            String  @id @default(uuid())
  photoId       String
  eventId       String
  vector        Unsupported("vector(512)")           // Prisma дэмждэггүй → raw SQL
  bbox          Json
  detScore      Float
  faceSizePx    Int                                    // богино талын пиксел
  quality       Float                                  // blur + pose оноо
  modelVersion  String                                 // дахин индексжүүлэхэд
  @@index([eventId, modelVersion])
  @@schema("biometric")
}

model SearchSession {
  id            String   @id                           // санамсаргүй UUID v4
  eventId       String
  queryVector   Unsupported("vector(512)")?          // 24 цагийн дотор NULL болгоно
  resultCount   Int
  createdAt     DateTime @default(now())
  expiresAt     DateTime                               // createdAt + 24h (тохируулж болно, max 24h)
  // IP, нэр, имэйл, утас — БАЙХГҮЙ
  @@schema("biometric")
}
```

- `api` DB хэрэглэгч `biometric` schema-д хандана; `admin` модуль ашиглах Prisma client нь **тусдаа DB role**-оор холбогдож, энэ schema-д `GRANT` байхгүй → кодын алдаанаас ч хамгаална.
- ⚠️ Индекс: HNSW-ийн оронд **`eventId`-аар шүүсэн exact scan** (доор 4-т тайлбар).

### 2.5 Үйл ажиллагаа, тохиргоо

```prisma
enum RemovalStatus { NEW IN_REVIEW RESOLVED REJECTED }

model RemovalRequest {
  id           String  @id @default(uuid())
  photoId      String
  reason       String
  contact      String?
  status       RemovalStatus @default(NEW)
  handledById  String?
  resolution   String?
  createdAt    DateTime @default(now())
  resolvedAt   DateTime?
}

model AuditLog {                                       // зөвхөн INSERT (DB trigger-ээр UPDATE/DELETE хориглоно)
  id          BigInt   @id @default(autoincrement())
  actorId     String
  action      String                                   // "photo.hide", "refund.create" ...
  entityType  String
  entityId    String
  before      Json?
  after       Json?
  ipHash      String?
  createdAt   DateTime @default(now())
  @@index([entityType, entityId])
}

model SystemSetting {                                  // UI-аас өөрчлөгдөх тохиргоо, Redis-д 30с cache
  key         String   @id                             // search.thresholdHigh, search.thresholdLow, face.minSizePx ...
  value       Json
  updatedById String?
  updatedAt   DateTime @updatedAt
}

model EventDailyStat {                                 // Redis counter → 5 минут тутам flush
  eventId   String
  date      DateTime @db.Date
  views     Int @default(0)
  searches  Int @default(0)
  orders    Int @default(0)
  revenue   Int @default(0)
  @@id([eventId, date])
}
```

Сагс DB-д биш — браузерийн `localStorage`-д, checkout хийхэд `Order` болно.

---

## 3. Upload + боловсруулалтын pipeline

```
Зурагчин (Uppy)                API (NestJS)                 R2/MinIO            Worker (BullMQ)            ML (FastAPI)
─────────────────              ────────────                 ────────            ───────────────            ────────────
1. файлууд сонгох ──────────▶ POST /uploads/batch
                               Photo(UPLOADING) үүсгэх
                               presigned PUT/multipart URL ◀─
2. ШУУД R2 руу PUT ─────────────────────────────────────────▶ originals/…
   (6 зэрэг, IndexedDB-д төлөв → tab хаагдсан ч үргэлжилнэ)
3. POST /photos/complete ────▶ HEAD object шалгах
   (50-аар багцалж)            → UPLOADED, flow үүсгэх ─────────────────────────▶
                                                                                4. ingest (sharp)
                                                                                   EXIF → capturedAt (+tz, +clockOffset)
                                                                                   auto-rotate, GPS хасах
                                                                                   thumb 400px WebP
                                                                                   preview 1000px WebP + watermark
                                                                                   → pic-public, status=DERIVED
                                                                                   (галерейд харагдаж эхэлнэ)
                                                                                5a. faces ──────────────▶ original татах, decode
                                                                                                           SCRFD (det_size тохиргоотой)
                                                                                                           нүүр бүр: size, quality
                                                                                                           ArcFace → L2 normalize
                                                                                   ◀──────────────────── [{bbox, vector, …}]
                                                                                   raw SQL: DELETE old + INSERT (idempotent)
                                                                                5b. bib (зэрэгцээ) ─────▶ текст илрүүлэх + таних
                                                                                   ◀──────────────────── ["1234", …]
                                                                                   bibPattern-оор шүүх → BibDetection
                                                                                6. finalize → INDEXED, faceCount
```

- BullMQ `FlowProducer`: `finalize` (parent) ← `faces`, `bib` (children) ← `ingest` дууссаны дараа.
- Retry: 3 оролдлого, exponential backoff → дараа нь `FAILED`, админ "дахин ажиллуулах".
- Sweeper job: 24 цагаас дээш `UPLOADING` байгаа мөрийг цэвэрлэх.
- Дахин индексжүүлэх: шинэ `modelVersion`-оор faces/bib job → бүгд дуусахад хуучин embedding устгах (хайлт тасалдахгүй).
- Том batch жижиг эвэнтүүдийг хаахгүйн тулд batch-ийн хэмжээгээр BullMQ priority тавина.

**Хурдны тооцоо (баталгаажаагүй, Phase 3-т benchmark хийнэ):** зураг тутамд ~1.5 CPU-секунд (decode+derivative 0.4, detection 0.3–0.5, ~6 нүүрний embedding 0.25, OCR 0.5). 10,000 зураг ≈ 4 CPU-цаг → 8 vCPU дээр ~40–60 минут. 8 цагийн зорилт хангалттай зайтай.

---

## 4. Хайлтын урсгал

```
1. Зөвшөөрлийн дэлгэц (checkbox) → камер / файл
2. Браузер дээр ≤800px JPEG болгож багасгах (~60KB, 3G-д)
3. POST /events/:id/search/face   (multer memoryStorage — диск рүү хэзээ ч бичихгүй)
4. API → ML /v1/embed-query (bytes) → 0 нүүр: алдаа; олон нүүр: хамгийн томыг сонгох
   buffer-ийг хаяна; ML лог-д зураг/вектор бичихгүй
5. SearchSession{uuid, queryVector, expiresAt=+24h}
6. SQL (exact scan, event доторх):
     SELECT photo_id, MAX(1 - (vector <=> $q)) AS score
     FROM biometric.face_embedding
     WHERE event_id = $e AND model_version = $v
       AND face_size_px >= $minFace AND quality >= $minQ
     GROUP BY photo_id HAVING MAX(...) >= $tLow
   + сонголттой JOIN: bib_detection (дугаар), photo.captured_at (интервал)
7. Өргөтгөл (recall нэмэх):
   a. score ≥ tHigh зургуудаас хамгийн сайн ≤5 нүүрийн embedding-ийг нэмэлт query болгож дахин хайх
   b. эдгээр зургуудын ≥2-т ижил bib илэрсэн бол → "Таны дугаар 1234 уу?" санал болгож, тэр bib-ийн зургийг нэмэх
8. Хариу: { sessionId, mine: score ≥ tHigh, maybe: tLow ≤ score < tHigh }, cursor pagination sessionId-аар
```

- Анхны утга: `tLow = 0.35`, `tHigh = 0.50` — **хоёулаа таамаг**. Бодит эвэнтийн 200–300 гараар тэмдэглэсэн зургаар калибровка хийх скрипт Phase 3-т бичнэ.
- ⚠️ **HNSW биш exact scan:** HNSW нь эхлээд ойрын `ef_search` (default 40) нүүрийг олоод *дараа нь* `event_id`-аар шүүдэг → олон эвэнттэй DB дээр үр дүн бараг хоосон буцна. Хайлт үргэлж нэг эвэнт доторх тул `event_id` btree + бүрэн тооцоолол: 40,000 нүүр (10k зураг) ≈ 50–150ms. Нэг эвэнт ~300,000 нүүрээс хэтэрвэл event-ээр partition + HNSW руу шилжинэ.
- Rate limit: Redis sliding window, түлхүүр = IP + анонимаар өгсөн cookie, хэтэрвэл Cloudflare Turnstile.

---

## 5. Төлбөр ба татах

```
Сагс(localStorage) → POST /orders → Order(PENDING), үнэ серверт дахин тооцно
→ PaymentProvider.createInvoice → QR + банкны deeplink
→ QPay callback ──▶ callback-т ИТГЭХГҮЙ, /payment/check-ээр баталгаажуулах → PAID (idempotent)
   + клиент 3с тутам polling (callback ирэхгүй тохиолдолд)
→ /orders/{id}?t=token → татах товч
→ GET /downloads/:itemId?t=… → PAID, refund хийгдээгүйг шалгах → Download лог
   → 302 presigned URL (TTL 5 мин, Content-Disposition: attachment)
```

Орлогын хуваарилалт `OrderItem` дээр худалдан авах мөчид тогтоогдоно (дараа нь хувь өөрчлөгдсөн ч түүх эвдрэхгүй). Payout = сарын `photographerAmount` нийлбэр − тухайн сард буцаагдсан дүн.

---

## 6. Устгалт ба retention

| Үйлдэл | Embedding / bib | R2 объект | Photo мөр | Санхүүгийн бүртгэл |
|---|---|---|---|---|
| Админ устгах (soft) | **шууд** hard delete | 30 хоногийн дараа | `deletedAt`, 30 хоног сэргээх | хэвээр |
| Устгах хүсэлт шийдвэрлэсэн | шууд | шууд | hard delete | хэвээр (`photoId=null`) |
| Retention дууссан | шууд | шууд | hard delete | хэвээр |
| SearchSession | 24ц дотор `queryVector=NULL` (15 мин тутам job) | — | — | — |

⚠️ Soft delete-ийн үед ч embedding-ийг шууд устгана — сэргээхэд дахин индексжүүлнэ. Хүний хүсэлтээр устгасан зүйл 30 хоног "далд байж" хайлтад дахин гарах эрсдэлгүй.

Админд: 7 хоногийн дотор устах эвэнтүүдийн сануулга.

---

## 7. Auth ба RBAC

- NestJS эзэмшинэ: argon2id, httpOnly + Secure + SameSite=Lax cookie, Origin шалгалт.
- `@Roles()` guard + `@Public()` декоратор; default = хаалттай.
- Зурагчин: бүртгүүлэх → `PENDING` → админ батлах хүртэл эвэнт үүсгэж чадахгүй.
- Админ: TOTP заавал (otplib) + 10 recovery code; устгах/буцаалт үйлдэлд TOTP дахин асуух.
- Админ бүр `AuditLog`-д автоматаар бичигдэнэ (interceptor).

---

## 8. Өгөгдлийн сангийн хамгаалалтыг хэрхэн шалгаж байгаа

Приваси ба эрхийн дүрмүүд зөвхөн код дотор биш, **DB түвшинд** хэрэгждэг тул тэдгээрийг тест хамардаг (`packages/db/test/migration.test.ts`). Тест нь migration SQL-ийг PGlite дээр ажиллуулаад дараахийг шалгана:

| Дүрэм | Хэрэгжилт | Тест |
|---|---|---|
| Админ embedding/селфи хардаггүй | `biometric` schema, `pic_admin_role`-д GRANT байхгүй | `has_schema_privilege` = false |
| Хайлтын session ≤ 24 цаг | `CHECK (expires_at <= created_at + interval '24 hours')` | 25 цаг INSERT амжилтгүй |
| Audit log өөрчлөгдөхгүй | `BEFORE UPDATE OR DELETE` trigger + REVOKE | UPDATE/DELETE exception |
| Орлогын хуваарилалт зөрөхгүй | `CHECK (photographer_amount + platform_amount = price)` | зөрүүтэй мөр амжилтгүй |
| Нууц эвэнт токенгүй байж болохгүй | `CHECK (visibility <> 'UNLISTED' OR access_token_hash IS NOT NULL)` | токенгүй INSERT амжилтгүй |
| Зураг устахад нүүр устана | FK `ON DELETE CASCADE` | embedding тоо 0 болно |

Хайлтын SQL-ийн хэлбэрийг (event-ээр шүүсэн exact cosine) мөн тест давтдаг тул §4-ийн шийдвэр кодоос салж хоцрохгүй.
