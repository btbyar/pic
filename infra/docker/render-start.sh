#!/bin/sh
# API асахаас өмнө migration + bootstrap (олон удаа ажиллуулахад аюулгүй).
# Render-ийн Docker Command хашилт задалдаггүй тул энэ файлыг image-ийн default CMD болгосон.
set -eu

cd /repo/packages/db
pnpm migrate:deploy
pnpm bootstrap

cd /repo/apps/api
exec node dist/main.js
