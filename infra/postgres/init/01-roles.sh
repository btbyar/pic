#!/bin/sh
# Dev Postgres анх үүсэхэд нэг удаа ажиллана (docker-entrypoint-initdb.d).
# Prod дээр эдгээр login хэрэглэгчийг ops гараар үүсгэнэ; migration нь зөвхөн NOLOGIN group role үүсгэдэг.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$PIC_APP_DB_PASSWORD" \
  -v admin_password="$PIC_ADMIN_DB_PASSWORD" <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pic_app_role') THEN
    CREATE ROLE pic_app_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pic_admin_role') THEN
    CREATE ROLE pic_admin_role NOLOGIN;
  END IF;
END $$;

SELECT format('CREATE ROLE pic_app LOGIN PASSWORD %L IN ROLE pic_app_role', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pic_app') \gexec

SELECT format('CREATE ROLE pic_admin LOGIN PASSWORD %L IN ROLE pic_admin_role', :'admin_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pic_admin') \gexec
SQL
