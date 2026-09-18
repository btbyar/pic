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
| 8 | Face модель | ⚠️ **YuNet (MIT) + SFace (Apache 2.0)** — InsightFace-ийн моделийг лицензгүйгээр арилжаанд ашиглах боломжгүй тул (2026-09-16). LFW дээр 99.42% (`services/ml/benchmark/RESULTS.md`); launch-аас өмнө бодит эвэнтийн зураг дээр дахин хэмжинэ, хангалтгүй бол `FaceEngine`-ээр AWS Rekognition эсвэл InsightFace лиценз руу шилжинэ. `vector(128)` migration хийгдсэн (2026-09-17). Сургалтын өгөгдлийн эрхийг хуульчаар шалгуулна |
| 9 | Вектор хайлт | `event_id` btree + exact scan (HNSW биш) |
| 10 | Upload | Browser → R2 шууд presigned **PUT (файл бүр нэг хүсэлт)**, өөрсдийн жижиг uploader (Uppy биш). Зураг ≤50MB тул multipart шаардлагагүй; тасалдвал SHA-256 давхардлаар файлын түвшинд үргэлжилнэ (2026-09-16) |
| 11 | OCR | ⏸ **Хойшлуулсан (2026-09-17, хэрэглэгчийн шийдвэр).** RapidOCR туршсан: бүтэн зурагт жижиг дугаар олдохгүй, tile-аар хуваавал 3–20с/зураг. Дараа нь нүүрний доорх цээжийг тайрч уншуулах аргаар эргэж ирнэ. `bib_detection` хүснэгт, `bibPattern` талбар хэвээр |
| 12 | Derivative | thumb 400px WebP, preview 1000px WebP + watermark |
| 13 | Rate limit | IP + анонимаар өгсөн cookie, хэтэрвэл Turnstile |
| 14 | Жижиг нүүр | Хадгална, default-аар хайлтаас хасна (`face.minSizePx`) |
| 15 | Хувилбар түгжилт | TypeScript 6.0.3 (pnpm catalog), Prisma 7.10.0, pnpm 12.4.2, Node 24 LTS. TS 7 болон Prisma 8-rc ашиглахгүй |
| 16 | Dev storage | MinIO-г `quay.io`-ийн түгжсэн tag-аар (Docker Hub-аас устсан). Prod: Cloudflare R2 |
| 17 | DB тест | Docker-гүйгээр PGlite (WASM Postgres + pgvector) дээр migration-ыг ажиллуулж шалгана |
| 18 | Хэрэглэгчийн төрөл | Оролцогч (бүртгэлгүй), зурагчин, админ. Тусдаа "зохион байгуулагч" төрөл MVP-д байхгүй — эвэнтийг зурагчин үүсгэж, бусдыг урина |
| 19 | Эвэнтийн ангилал | Prisma enum `EventCategory` (гүйлт, дугуй, спорт, төгсөлт, фестиваль, концерт, баяр ёслол, байгууллага, бусад). Шинэ ангилалд migration шаардлагатай |
| 20 | Web ↔ API | Browser `/api/*` → Next.js rewrite → NestJS. Session cookie first-party хэвээр, CORS шаардлагагүй |
| 21 | Нууц үг сэргээх | Phase 5-д имэйл илгээх системтэй хамт. Тэр хүртэл админ гараар тусална |
| 23 | Цагаар шүүх | ❌ **Хасагдсан (2026-09-17, хэрэглэгчийн шийдвэр).** Галерей ба хайлтын үр дүнд цагийн шүүлтүүр байхгүй. Зургууд авсан цагаар эрэмбэлэгдсэн хэвээр |
| 24 | Хайлт | Зөвхөн селфигээр. "Таны зургууд" = шууд төсөө ≥ tHigh; "Магадгүй" = шууд ≥ tLow **эсвэл** өргөтгөлөөр ≥ tHigh (өргөтгөл хэзээ ч "Таны зургууд"-д оруулахгүй — андуурлын гинжин алдаанаас хамгаална) |
| 25 | Багц үнэ хэрэглэгдэх нөхцөл | Сагсан дахь **бүх** зураг тухайн хүний хүчинтэй (≤24ц) селфи хайлтын үр дүнд (Таны зургууд + Магадгүй) байгаа бөгөөд багц хямд үед л. Үгүй бол хэн ч бүх эвэнтийг багц үнээр авах боломжтой болно. Session ID-г зөвхөн шалгахад ашиглаж, захиалгад **хадгалахгүй** (2026-09-17) |
| 26 | Захиалгын нууц холбоос | Токен URL-ийн `#t=` fragment-д (сервер, proxy log, Referer-т очихгүй), API руу `x-order-token` header-ээр. DB-д SHA-256; имэйл сонгосон үед л илгээх хүртэл AES-GCM-ээр шифрлэж, илгээсний дараа NULL |
| 27 | Имэйл | nodemailer + SMTP (dev: Mailpit, prod: SMTP relay). Worker илгээнэ — API-ийн хариуны хугацаа SMTP-ээс хамаарахгүй, job-д хүлээн авагч/холбоос орохгүй |
| 28 | Татах | `POST /orders/:id/items/:itemId/download` → JSON `{url}` (presigned GET, 5 мин, attachment). ZIP-ээр бүгдийг татах MVP-д байхгүй — браузер нэг нэгээр дараалуулж татна |
| 29 | Буцаалт | Админ зураг тус бүрээр буцаана (TOTP дахин асууна). Мөнгийг одоогоор банкаар **гараар** шилжүүлж, гүйлгээний дугаарыг бүртгэнэ — QPay-ийн буцаалтын API-г merchant гэрээний дараа нягтална (2026-09-18) |
| 30 | Зурагчны төлбөр | Сараар (Улаанбаатарын цаг): тухайн сард төлөгдсөн борлуулалт − тухайн сард хийсэн буцаалт. Төлсөн сарын дүн дараа өөрчлөгдөхгүй; сөрөг дүн дараагийн сард суутгагдана. Зөвхөн хаагдсан сарыг, TOTP + банкны гүйлгээний дугаартай тэмдэглэнэ |
| 31 | Админы DB эрх | Админ модуль `ADMIN_DATABASE_URL` (`pic_admin_role`)-оор уншина — биометрт огт эрхгүй. Нүүрний өгөгдөл устгах нь app role-той `PhotoPurgeService`-ээр ("устга" гэж хэлж чадна, харж чадахгүй) |
| 22 | Хайлтын босго | SFace-д LFW хэмжилтээр: "Таны зургууд" ≥ **0.45**, "Магадгүй" ≥ **0.40**, хайлтад орох нүүр ≥ **24px** (ArcFace-ийн 0.50/0.35/32 биш). 0.35 бол селфи тутамд ~22 буруу зураг. Админ тохиргоогоор өөрчилнө (2026-09-17) |

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
  category         EventCategory @default(OTHER)        // RUNNING, CYCLING, GRADUATION ...
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

**Phase 2c-ийн бодит хэрэгжилт:**
- `POST /photographer/events/:id/upload-batches` → `POST /photographer/upload-batches/:id/files` (≤100 файл: нэр, хэмжээ, төрөл, SHA-256) → браузер PUT → `POST /photographer/upload-batches/:id/complete` (≤100).
- Presigned URL-д `Content-Type` ба `Content-Length` гарын үсэгт орно — өөр хэмжээтэй файлыг storage өөрөө 403-аар татгалзана. Complete нь HEAD-ээр дахин шалгана.
- Давхардал: `(event_id, sha256)` unique + `INSERT … ON CONFLICT DO NOTHING` — зэрэг хүсэлтэд аюулгүй. Өөрийн тасалдсан (`UPLOADING`) файлд шинэ URL олгож, шинэ batch руу шилжүүлнэ.
- Storage түлхүүр: `events/{eventId}/originals/{photoId}.{ext}` — файлын нэр орохгүй.
- Browser: 50 файлаар hash → бүртгэл → 4 зэрэг PUT (3 оролдлого, алдаа гарвал шинэ URL) → complete. Явцыг 250ms тутам render хийнэ.
- `photo-ingest` BullMQ job (`jobId = photoId`) үүсгэнэ; worker нь Phase 2d.
**Phase 2d-ийн бодит хэрэгжилт:**
- Worker нь тусдаа процесс (`apps/api/dist/worker.js`, Docker `worker` target), API-тай ижил Prisma/Storage модуль ашиглана. `WORKER_CONCURRENCY` (default 2).
- Ingest: эх зургийн SHA-256-г дахин тооцож browser-ийн мэдэгдсэнтэй тулгана (`sha256_mismatch` → FAILED) → sharp: auto-rotate, thumb 400px WebP q72, preview 1000px WebP q75 + хөндлөн давтагдсан "PIC · PREVIEW" watermark → `pic-public/events/{eventId}/{thumb|preview}/{photoId}.webp` (`Cache-Control: immutable`). sharp metadata хуулдаггүй тул EXIF/GPS үлдэхгүй (тестээр баталгаажсан).
- Цаг: EXIF `DateTimeOriginal` + `OffsetTimeOriginal`, offset байхгүй бол эвэнтийн цагийн бүс → `captured_at_raw`. `captured_at` = raw + зурагчны `clock_offset_sec` — UPDATE дотор subquery-ээр тооцдог тул засвар зэрэг өөрчлөгдсөн ч зөв. Засвар өөрчлөхөд тухайн зурагчны бүх зургийг SQL-ээр дахин тооцно.
- Алдаа: эвдэрсэн/дэмжигдээгүй файл нь `UnrecoverableError` → шууд FAILED; сүлжээ/storage алдаа 3 удаа exponential backoff.
- Эвэнтийн анхны боловсруулагдсан зураг cover болно (thumb URL).
- `maintenance` queue: цаг тутам 24 цагаас дээш `UPLOADING` мөрийг устгана (эхлээд `DELETE … RETURNING`, дараа нь объект — дуусгасан зургийн эх файлыг устгахгүй).
- Галерей: `GET /events/:slug/photos?cursor&t` — 60-аар, `captured_at ASC NULLS LAST`. Virtualized grid ба цагаар шүүх нь Phase 4.
- Хурд (dev laptop, 2400×1600 JPEG, concurrency 2): 30 зураг ≈ 3 секунд (зураг тутамд ~0.2с). Бодит 24MP зураг дээр Phase 3-т дахин хэмжинэ.
- **Production R2:** bucket-д CORS тохируулна — `AllowedOrigins: [WEB_ORIGIN]`, `AllowedMethods: [PUT]`, `AllowedHeaders: [content-type]`. MinIO dev-д default-аар зөвшөөрдөг.
- Дахин индексжүүлэх: шинэ `modelVersion`-оор faces/bib job → бүгд дуусахад хуучин embedding устгах (хайлт тасалдахгүй).
- Том batch жижиг эвэнтүүдийг хаахгүйн тулд batch-ийн хэмжээгээр BullMQ priority тавина.

**Хурдны тооцоо (баталгаажаагүй, Phase 3-т benchmark хийнэ):** зураг тутамд ~1.5 CPU-секунд (decode+derivative 0.4, detection 0.3–0.5, ~6 нүүрний embedding 0.25, OCR 0.5). 10,000 зураг ≈ 4 CPU-цаг → 8 vCPU дээр ~40–60 минут. 8 цагийн зорилт хангалттай зайтай.

**Phase 3-ын бодит хэрэгжилт (OCR-гүй):**
- ML сервис: `POST /v1/faces` (multipart зураг, `Authorization: Bearer ML_SERVICE_TOKEN`) → нүүр бүрийн bbox, 5 цэг, detScore, sizePx, quality (Laplacian хурц байдал), 128-dim L2-normalized embedding. Зураг/embedding хадгалахгүй. OpenCV модель thread-safe биш тул lock + `ML_WORKERS` процесс.
- Модель: opencv_zoo-ийн тогтсон commit + SHA-256, Docker build үед татна (`python -m app.models`).
- Worker: `photo-ingest` DERIVED болмогц `photo-index` job (5 оролдлого, 30с-ээс exponential — ML дахин асах хүртэл). Эх зургийг EXIF-ээр эргүүлж 2560px JPEG болгон илгээнэ; bbox-ийг эх зургийн координатаар, `face_size_px`-ийг ML-д илгээсэн нягтралаар хадгална (таних чанарт нөлөөлөх нь тэр).
- Transaction: тухайн зураг + model_version-ийн хуучин embedding устгаад шинээр INSERT → `INDEXED`, `face_count`. `faceSearchEnabled=false` эвэнтэд ML дуудахгүй, биометр өгөгдөл үүсгэхгүй.
- Индексжүүлэлт бүтэлгүйтвэл зураг DERIVED хэвээр (галерейд харагдана), `failure_reason = "index: …"`.
- Хэмжилт (dev laptop): 1920×1280 бүлэг зураг ≈ 0.2с; 6 зураг upload → INDEXED ≈ 4с. LFW 250×250: 33мс.

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

- Анхны утга (SFace, LFW хэмжилт — шийдвэр #22): `tLow = 0.40`, `tHigh = 0.45`, `minFace = 24px`. LFW нь бодит эвэнтээс хялбар тул launch-аас өмнө бодит зургаар дахин калибровка хийнэ (`services/ml/benchmark/lfw.py`-г загвар болгоно).
- ⚠️ **HNSW биш exact scan:** HNSW нь эхлээд ойрын `ef_search` (default 40) нүүрийг олоод *дараа нь* `event_id`-аар шүүдэг → олон эвэнттэй DB дээр үр дүн бараг хоосон буцна. Хайлт үргэлж нэг эвэнт доторх тул `event_id` btree + бүрэн тооцоолол: 40,000 нүүр (10k зураг) ≈ 50–150ms. Нэг эвэнт ~300,000 нүүрээс хэтэрвэл event-ээр partition + HNSW руу шилжинэ.
- Rate limit: Redis sliding window, түлхүүр = IP + анонимаар өгсөн cookie, хэтэрвэл Cloudflare Turnstile.

**Phase 4-ийн бодит хэрэгжилт:**
- `POST /events/:slug/search` (multipart `selfie`, `consent=true`, `t`): Nest FileInterceptor memoryStorage (≤8MB, jpeg/png/webp) → sharp 1024px → ML `/v1/faces` → хамгийн том нүүр → `search_session`-д embedding + `consent_version` + `model_version` → хайлт → `{ sessionId, expiresAt, multipleFaces, mine[], maybe[] }`. Браузер селфиг урьдчилан ≤800px JPEG болгоно.
- Бүх векторын харьцуулалт DB дотор: query embedding-ийг `search_session`-ээс, өргөтгөлийн embedding-ийг `face_embedding.id`-гаар subquery-ээр авна — вектор API руу буцаж ирэхгүй.
- `GET /events/:slug/search/:sessionId` — хуудас refresh (селфи дахин шаардахгүй); хугацаа дууссан бол 410. `DELETE /search-sessions/:id` — хэрэглэгч өөрөө embedding-ээ шууд устгана.
- ≤24 цаг: `expires_at = now() + min(TTL, 23ц55м)` + worker 5 минут тутам хугацаа дууссан embedding-ийг NULL болгоно; embedding-гүй мөр 30 хоногийн дараа устна (зөвхөн тоо: result_count). Session-д IP/cookie/хэрэглэгч байхгүй (e2e тест баганын жагсаалтыг шалгана).
- Rate limit: `search.rateLimitPerMinute` (default 10) hash-лагдсан IP-гаар; үр дүн дахин авах 120/мин.
- `POST /photos/:id/removal-requests` — нэвтрэлтгүй, шалтгаан (ME_IN_PHOTO/INAPPROPRIATE/COPYRIGHT/OTHER) + тайлбар + холбоо барих (заавал биш), 10/цаг IP. Шийдвэрлэх нь Phase 6-ийн админ самбар.
- Зөвшөөрлийн текст `apps/web/messages/mn.json → search.consent`, хувилбар `CONSENT_VERSION`. ⚠️ Хуульчаар хянуулаагүй (ялангуяа насны босго, биометрийн мэдээллийн нэр томьёо).
- Web: `/events/[slug]/find` — зөвшөөрөл → камер (getUserMedia, урд камер) эсвэл файл → үр дүн (`?s=sessionId` URL-д). Grid-д `content-visibility: auto` (бүрэн virtualized grid биш — 1000+ зурагтай үр дүнд хэрэгтэй бол нэмнэ).

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

**Phase 6-ийн бодит хэрэгжилт:**
- Устгуулах хүсэлт: `hide` (эргүүлж болно; embedding шууд устана, сэргээхэд дахин индексжүүлнэ), `delete` (TOTP; файл + embedding + мөр, `order_item.photo_id` NULL), `reject`. Бүгд audit log-д.
- Retention: worker цаг тутам — хугацаа дууссан эвэнтийн зураг, 30 хоногоос өмнө soft-delete хийсэн зураг бүрмөсөн устна. Эвэнтийн мөр, захиалга, audit үлдэнэ. Админы тоймд 7 хоногийн дотор устах эвэнтүүд.
- Санхүү: `packages/shared/src/payouts.ts` (`buildLedger` — unit тест), `apps/api/src/finance/ledger.ts` (SQL нэгтгэл), буцаалт `SELECT … FOR UPDATE`-ээр давхардлаас хамгаалагдана. Зурагчны банкны данс FieldCipher-ээр шифрлэгдэнэ.
- Зурагчны нийтийн профайл: `slug` (DB CHECK), био, хот, 256px WebP зураг (EXIF хасна). Зөвхөн APPROVED зурагчин харагдана. Нүүр хуудасны тоо Redis-д 10 минут cache.

**Phase 5-ийн бодит хэрэгжилт:**
- Үнэ: `packages/shared/src/orders.ts` — `priceOrder` (багц нөхцөл #25), `allocateOrder` (нийт дүнг зураг бүрт тэнцүү хувааж үлдэгдлийг 1₮-өөр тараана, зураг бүрийн `splitRevenue`). Нийлбэр үргэлж яг таарна (unit тест + DB CHECK).
- `POST /events/:slug/orders/quote` — сагсны үнэ, худалдаанаас хасагдсан зургууд, багц яагаад хэрэглэгдээгүй шалтгаан. `POST /events/:slug/orders` — нэг эвэнт = нэг захиалга; 0₮ бол шууд PAID.
- `PaymentProvider`: `QPayProvider` (v2: auth/token → invoice → payment/check, 401 үед нэг удаа дахин нэвтэрнэ) ба `MockPaymentProvider` (Redis-д төлөв, `POST /orders/:id/mock-pay` зөвхөн dev). Production-д mock бол API асахгүй.
- PAID болох 3 зам, бүгд `OrderPaymentsService.reconcile` → провайдераас шалгана: (1) QPay callback `/payments/qpay/callback?payment=<id>` (агуулгад итгэхгүй, үргэлж `SUCCESS`), (2) захиалгын хуудасны 3с polling (Redis-ээр 3с-д нэг удаа QPay руу), (3) worker 5 минут тутам хугацаа дууссан захиалгыг эцсийн удаа шалгаад EXPIRED + нэхэмжлэх цуцлах. QPay хариу өгөхгүй бол EXPIRED болгохгүй. Нөхцөлтэй UPDATE тул давхар тоологдохгүй; `event_daily_stat`-д orders/revenue.
- Хугацаа: `order.paymentTtlMinutes` (default 30). Хожуу төлөгдвөл EXPIRED → PAID.
- Татах: PAID/PARTIALLY_REFUNDED, буцаагаагүй, зураг нуугдаагүй/устаагүй, эвэнтийн retention дуусаагүй. `Download`-д HMAC(IP). Нэг захиалгаас цагт 600 татах хязгаар.
- Нууц үг сэргээх: `password_reset_token` (SHA-256, 30 мин, DB CHECK ≤1 цаг, `pic_admin_role` эрхгүй). Шинэ хүсэлт хуучныг хүчингүй болгоно; амжилттай бол бүх session устна, audit log. Имэйл байгаа эсэхээс үл хамааран 204.
- Web: `/cart` (localStorage), `/orders/[id]#t=` (QR — `qrcode`, банкны deeplink, countdown, татах), `/my/orders` (энэ төхөөрөмжийн захиалгууд), `/forgot-password`, `/reset-password#token=`.

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

---

## 9. Үе шатны нэмэлт ажил (зах зээлийн судалгаанаас)

pix.mn, gnb.mn-тэй харьцуулж нэмсэн (2026-09-16). Функцийг санаа болгон авна, дизайн/брэндийг хуулахгүй.

| Боломж | Үе шат | Тэмдэглэл |
|---|---|---|
| Эвэнтийн ангилал, жагсаалтын шүүлтүүр | 2b ✅ | |
| Зурагчны нийтийн профайл (нэр, студи, байршил, эвэнтийн тоо, галерей) | 6 ✅ | `PhotographerProfile`-д `slug`, `bio`, `city`, `avatarKey` нэмнэ; `/photographers`, `/photographers/[slug]` |
| Нүүр хуудасны статистик (эвэнт, зургийн тоо) | 6 ✅ | `EventDailyStat`-аас, cache-тэй |
| Нууц үг сэргээх (имэйл) | 5 ✅ | Нэг удаагийн токен, 30 минут, hash-ээр хадгална; бүх session хаана |
| "Миний татсан зургууд" | 5 ✅ | Бүртгэлгүй худалдан авагчид: захиалгын нууц холбоос + сонголттой имэйл |
| Видео | MVP-ээс гадуур | |
| Англи хэл | MVP-ээс гадуур | next-intl бүтэц бэлэн |
