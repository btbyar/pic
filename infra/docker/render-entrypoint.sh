#!/bin/sh
# render.yaml дотор утгуудыг нийлүүлж чадахгүй тул энд үүсгэнэ:
# DATABASE_URL (эзэмшигч) + нууц үг → pic_app / pic_admin холболт, ML_HOSTPORT → ML_BASE_URL.
# Аль нэг нь гараар тохируулагдсан бол түүнийг хэвээр үлдээнэ.
set -eu

with_user() {
  node -e 'const u = new URL(process.env.DATABASE_URL); u.username = process.argv[1]; u.password = process.argv[2]; console.log(u.toString())' "$1" "$2"
}

if [ -z "${APP_DATABASE_URL:-}" ]; then APP_DATABASE_URL=$(with_user pic_app "$PIC_APP_DB_PASSWORD"); fi
if [ -z "${ADMIN_DATABASE_URL:-}" ]; then ADMIN_DATABASE_URL=$(with_user pic_admin "$PIC_ADMIN_DB_PASSWORD"); fi
if [ -z "${ML_BASE_URL:-}" ] && [ -n "${ML_HOSTPORT:-}" ]; then ML_BASE_URL="http://$ML_HOSTPORT"; fi
export APP_DATABASE_URL ADMIN_DATABASE_URL ML_BASE_URL

exec "$@"
