# Pic — Эвэнтийн зураг хайх платформ

Марафон, гүйлт, төгсөлт, фестивалийн зургаас оролцогчид **өөрийн царай эсвэл цээжний дугаараар** зургаа олж, худалдаж авах вэб платформ.

- Архитектур, өгөгдлийн схем, pipeline: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Одоогийн үе шат: **Phase 2** — нэвтрэлт ✅, эвэнт ✅, зураг байршуулах ✅, зураг боловсруулах (2d) ⏳

## Бүтэц

```
apps/web          Next.js 16 (App Router) + Tailwind 4 + next-intl — оролцогч, зурагчин, /admin
apps/api          NestJS 12 — REST API (+ дараа нь BullMQ worker)
services/ml       Python 3.11 + FastAPI — царай, bib OCR (Phase 3)
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

### 3. Infra асаах (Postgres + pgvector, Redis, MinIO)

```bash
docker compose up -d
```

- Postgres: `localhost:5432` — анх үүсэхэд `infra/postgres/init/01-roles.sh` нь `pic_app`, `pic_admin` login хэрэглэгч үүсгэнэ
- Redis: `localhost:6379`
- MinIO API: `localhost:9000`, console: `localhost:9001` — `pic-originals`, `pic-public` bucket автоматаар үүснэ

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

ML сервис (тусдаа терминал):

```bash
cd services/ml
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

### Бүгдийг контейнерт ажиллуулах

```bash
docker compose --profile app up -d --build
```

`migrate` контейнер эхлээд migration хэрэглэж, дараа нь `api`, `web`, `ml` асна.

## Тест

```bash
pnpm test                          # бүх TypeScript багц (Docker шаардлагагүй)
pnpm --filter @pic/api test:e2e    # API-г жинхэнэ Postgres/Redis дээр (docker compose up -d && pnpm db:deploy шаардана)
cd services/ml && uv run pytest    # Python
```

`packages/db` тест нь migration SQL-ийг **PGlite (WASM Postgres + pgvector)** дээр ажиллуулдаг — Docker шаардлагагүй. Шалгадаг зүйлс: админ role biometric өгөгдөлд хандах эрхгүй, audit log өөрчлөгдөхгүй, хайлтын session 24 цагаас удаан амьдрахгүй, орлогын хуваарилалтын нийлбэр зөв, cosine хайлт, cascade устгалт.

## Өгөгдлийн сангийн дүрэм

- **Migration бүтэц:** `prisma migrate diff`-ийн гаргасан SQL + гараар нэмсэн prelude (pgvector) ба postlude (CHECK, trigger, role/grant). Шинэ migration-д гараар хэсэг нэмбэл мөн `[гараар]` гэж тэмдэглэ.
- **Биометр:** `face_embedding`, `search_session` нь `biometric` schema-д. `pic_admin_role` энэ schema-д огт эрхгүй — админ модуль `ADMIN_DATABASE_URL`-ээр холбогдоно.
- **Вектор:** Prisma `vector(512)`-г дэмждэггүй тул эдгээр багана raw SQL-ээр бичигдэж/уншигдана.
- **Мөнгө:** бүхэл төгрөг (`Int`), бутархайгүй.

## Анхааруулга

- **Нүүр таних модель:** InsightFace-ийн бэлэн моделиуд (`buffalo_l` г.м.) арилжааны бус лицензтэй тул **YuNet (MIT) + SFace (Apache 2.0)** ашиглана. Нарийвчлалыг бодит эвэнтийн зураг дээр хэмжиж, хангалтгүй бол `FaceEngine` interface-ээр AWS Rekognition эсвэл InsightFace-ийн арилжааны лиценз руу шилжинэ. Моделийн сургалтын өгөгдлийн эрхийг хуульчаар шалгуулна.
- **Админы 2FA:** хөгжүүлэлтэд `.env`-д `ADMIN_MFA_REQUIRED=false` гэж түр унтрааж болно. Production-д (`NODE_ENV=production`) унтраавал API асахгүй.
- **Cloudflare R2 CORS:** зурагчны браузер зургийг шууд R2 руу илгээдэг тул production bucket-д `WEB_ORIGIN`-оос `PUT` (`content-type` header) зөвшөөрөх CORS дүрэм заавал тохируулна.
- **MinIO:** community Docker image 2025-09-өөс хойш шинэчлэгдээгүй; зөвхөн dev-д, хувилбарыг түгжиж ашиглана. Production нь Cloudflare R2.
- **Хувийн мэдээлэл:** зөвшөөрлийн текстийг хуульчаар хянуулна.
