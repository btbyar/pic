# Pic — Эвэнтийн зураг хайх платформ

Марафон, гүйлт, төгсөлт, фестивалийн зургаас оролцогчид **өөрийн царайгаар** (дараа нь цээжний дугаараар) зургаа олж, худалдаж авах вэб платформ.

- Архитектур, өгөгдлийн схем, pipeline: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Одоогийн үе шат: **Phase 6** — админ самбар (устгах хүсэлт, захиалга, буцаалт, зурагчны төлбөр), retention, зурагчны профайл ✅ → MVP-ийн бүх үе шат дууссан; launch-ын өмнөх ажлыг доорх "Анхааруулга"-аас харна уу

## Бүтэц

```
apps/web          Next.js 16 (App Router) + Tailwind 4 + next-intl — оролцогч, зурагчин, /admin
apps/api          NestJS 12 — REST API + BullMQ worker (зураг боловсруулах)
services/ml       Python 3.11 + FastAPI — нүүр илрүүлэх (YuNet) + embedding (SFace)
packages/db       Prisma 7 схем, migration, seed, client
packages/shared   Zod schema, enum, мөнгө/retention-ийн цэвэр функц
packages/config   tsconfig preset
infra/            Dockerfile, Postgres init, MinIO init
```

## Шаардлага

| Хэрэгсэл | Хувилбар | Тайлбар |
|---|---|---|
| Node.js | **24 LTS** | Prisma 7 нь Node 25-ыг албан ёсоор дэмждэггүй |
| pnpm | 12.4.2 | `npm install -g pnpm@12.4.2` |
| Docker Desktop | сүүлийн | Windows дээр WSL2 шаардлагатай |
| uv | 0.12+ | Python 3.11-ийг өөрөө татна |

## Суулгах

### 1. Хамаарал суулгах

```bash
pnpm install
```

### 2. Орчны хувьсагч

```bash
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
```

`.env` доторх `change-me` утгуудыг бүгдийг соль. `FIELD_ENCRYPTION_KEY`, `IP_HASH_SECRET` үүсгэх:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`PIC_APP_DB_PASSWORD`, `PIC_ADMIN_DB_PASSWORD` нь `APP_DATABASE_URL`, `ADMIN_DATABASE_URL` доторх нууц үгтэй таарах ёстой.

### 3. Infra асаах (Postgres + pgvector, Redis, MinIO, Mailpit)

```bash
docker compose up -d
```

- Postgres: `localhost:5432` — анх үүсэхэд `infra/postgres/init/01-roles.sh` нь `pic_app`, `pic_admin` login хэрэглэгч үүсгэнэ
- Redis: `localhost:6379`
- MinIO API: `localhost:9000`, console: `localhost:9001` — `pic-originals`, `pic-public` bucket автоматаар үүснэ
- Mailpit: SMTP `localhost:1025`, илгээсэн имэйлүүд http://localhost:8025 (гадагш хэзээ ч илгээхгүй)

> Postgres volume аль хэдийн үүссэн бол init скрипт дахин ажиллахгүй. Нууц үг сольсон бол `docker compose down -v` (бүх dev өгөгдөл устна).

### 4. Migration + seed

```bash
pnpm db:deploy      # migration хэрэглэх
pnpm db:seed        # dev өгөгдөл
```

Seed үүсгэх зүйлс: админ (`SEED_ADMIN_EMAIL`), батлагдсан зурагчин `bat@pic.local`, батлагдаагүй зурагчин `saraa@pic.local`, 3 эвэнт (нийтийн / нууц холбоостой / нуусан), системийн тохиргооны default утгууд. Нууц холбоосны токен консолд хэвлэгдэнэ.

### 5. Хөгжүүлэлтийн сервер

```bash
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000/health — database, redis, storage, ml төлөвийг буцаана
- Worker: байршуулсан зургийг боловсруулна (EXIF цаг, 400px thumb, watermark-тай 1000px preview). `pnpm dev` дотор хамт асна; тусад нь: `pnpm --filter @pic/api dev:worker`

ML сервис (тусдаа терминал):

```bash
cd services/ml
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Анх асахдаа моделийг (~39MB) татаж SHA-256-аар шалгана. `ML_SERVICE_TOKEN` нь API-тай ижил байх ёстой (root `.env`-ээс уншина). ML асаагүй үед зургууд галерейд харагдсаар, нүүрээр хайх индекс ML асахад автоматаар нөхөгдөнө.

Царай танихын нарийвчлалыг хэмжих (LFW ~180MB татна, ~10 минут):

```bash
cd services/ml
uv run python -m benchmark.lfw      # → benchmark/RESULTS.md
```

### Төлбөр (QPay)

Хөгжүүлэлтэд `PAYMENT_PROVIDER=mock`: захиалгын хуудсанд "Туршилтын төлбөр төлөх" товч гарна, мөнгө шилжихгүй.

Жинхэнэ QPay-д:
1. QPay-тэй merchant гэрээ байгуулж `QPAY_USERNAME`, `QPAY_PASSWORD`, `QPAY_INVOICE_CODE` авна (эхлээд sandbox).
2. `.env`: `PAYMENT_PROVIDER=qpay`, `QPAY_BASE_URL` (sandbox эсвэл `https://merchant.qpay.mn/v2`).
3. `QPAY_CALLBACK_URL` — интернэтээс хүрэх хаяг (`https://<домэйн>/api/payments/qpay/callback`). Callback ирэхгүй байсан ч захиалгын хуудас болон worker төлбөрийг шалгадаг.

> Production-д (`NODE_ENV=production`) `PAYMENT_PROVIDER=mock` бол API асахгүй.

### Бүгдийг контейнерт ажиллуулах

```bash
docker compose --profile app up -d --build
```

`migrate` контейнер эхлээд migration хэрэглэж, дараа нь `api`, `worker`, `web`, `ml` асна. Worker-ийг олон хувь болгож (`--scale worker=3`) хурдасгаж болно.

## Тест

```bash
pnpm test                          # бүх TypeScript багц (Docker шаардлагагүй)
pnpm --filter @pic/api test:e2e    # API-г жинхэнэ Postgres/Redis дээр (docker compose up -d && pnpm db:deploy шаардана)
cd services/ml && uv run pytest    # Python
```

`packages/db` тест нь migration SQL-ийг **PGlite (WASM Postgres + pgvector)** дээр ажиллуулдаг — Docker шаардлагагүй. Шалгадаг зүйлс: админ role biometric өгөгдөлд хандах эрхгүй, audit log өөрчлөгдөхгүй, хайлтын session 24 цагаас удаан амьдрахгүй, нууц үг сэргээх токен богино хугацаатай, орлогын хуваарилалтын нийлбэр зөв, cosine хайлт, cascade устгалт.

## Өгөгдлийн сангийн дүрэм

- **Migration бүтэц:** `prisma migrate diff`-ийн гаргасан SQL + гараар нэмсэн prelude (pgvector) ба postlude (CHECK, trigger, role/grant). Шинэ migration-д гараар хэсэг нэмбэл мөн `[гараар]` гэж тэмдэглэ.
- **Биометр:** `face_embedding`, `search_session` нь `biometric` schema-д. `pic_admin_role` энэ schema-д огт эрхгүй — админ модуль `ADMIN_DATABASE_URL`-ээр холбогдоно.
- **Вектор:** Prisma `vector(128)`-г дэмждэггүй тул эдгээр багана raw SQL-ээр бичигдэж/уншигдана.
- **Мөнгө:** бүхэл төгрөг (`Int`), бутархайгүй. Захиалгын нийт дүн ба зураг бүрийн зурагчин/платформын хэсэг үргэлж яг таарна (`order_item_amounts_valid` CHECK).

## Анхааруулга

- **Цээжний дугаар:** OCR одоогоор хойшлогдсон (docs/ARCHITECTURE.md шийдвэр #11). Хайлт зөвхөн царайгаар.
- **Нүүр таних модель:** InsightFace-ийн бэлэн моделиуд (`buffalo_l` г.м.) арилжааны бус лицензтэй тул **YuNet (MIT) + SFace (Apache 2.0)** ашиглана. Нарийвчлалыг бодит эвэнтийн зураг дээр хэмжиж, хангалтгүй бол `FaceEngine` interface-ээр AWS Rekognition эсвэл InsightFace-ийн арилжааны лиценз руу шилжинэ. Моделийн сургалтын өгөгдлийн эрхийг хуульчаар шалгуулна.
- **Админы 2FA:** хөгжүүлэлтэд `.env`-д `ADMIN_MFA_REQUIRED=false` гэж түр унтрааж болно. Production-д (`NODE_ENV=production`) унтраавал API асахгүй.
- **Зургийн нийтийн файлууд:** thumb/preview нь `pic-public` bucket-д нийтэд нээлттэй (URL нь таамаглахад хэцүү UUID). Нуусан эвэнтийн preview ч URL мэдэгдвэл нээгдэнэ — watermark-тай тул зөвшөөрөгдөх эрсдэл. Эх зураг хэзээ ч нийтэд гарахгүй.
- **Cloudflare R2 CORS:** зурагчны браузер зургийг шууд R2 руу илгээдэг тул production bucket-д `WEB_ORIGIN`-оос `PUT` (`content-type` header) зөвшөөрөх CORS дүрэм заавал тохируулна.
- **MinIO:** community Docker image 2025-09-өөс хойш шинэчлэгдээгүй; зөвхөн dev-д, хувилбарыг түгжиж ашиглана. Production нь Cloudflare R2.
- **Имэйл (production):** SPF/DKIM тохируулсан домэйнээс SMTP relay-ээр (`SMTP_URL`, `MAIL_FROM`) илгээнэ, үгүй бол нууц үг сэргээх/захиалгын имэйл spam-д орно.
- **Худалдан авагчийн холбоос:** бүртгэлгүй худалдан авагч захиалгаа зөвхөн нууц холбоосоор (имэйл эсвэл тухайн төхөөрөмж) нээнэ. Холбоос алдвал сэргээх арга одоогоор байхгүй — имэйл үлдээхийг зөвлөнө.
- **Буцаалт, зурагчны төлбөр:** мөнгийг админ банкаар гараар шилжүүлж, гүйлгээний дугаарыг системд бүртгэнэ (автомат шилжүүлэг байхгүй).
- **Тестийн өгөгдөл:** API e2e тест dev DB дээр ажиллаж, туршилтын хэрэглэгч/эвэнт/захиалга үлдээдэг. Production DB дээр хэзээ ч бүү ажиллуул.
- **e-barimt:** MVP-д байхгүй (шийдвэр #3). Татварын шаардлагыг launch-аас өмнө нягтална.
- **Хувийн мэдээлэл:** зөвшөөрлийн текстийг (`apps/web/messages/mn.json` → `search.consent`) хуульчаар хянуулна. Текст өөрчлөгдвөл `packages/shared/src/search.ts`-ийн `CONSENT_VERSION`-ийг шинэчил.
