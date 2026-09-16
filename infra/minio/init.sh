#!/bin/sh
# Dev bucket-уудыг үүсгэнэ. Олон удаа ажиллуулахад аюулгүй.
set -eu

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

mc mb --ignore-existing "local/$S3_BUCKET_ORIGINALS"
mc mb --ignore-existing "local/$S3_BUCKET_PUBLIC"

# Original: хувийн, зөвхөн presigned URL
mc anonymous set none "local/$S3_BUCKET_ORIGINALS"
# Thumb/preview: GetObject нийтэд нээлттэй, жагсаалт (list) хаалттай
mc anonymous set download "local/$S3_BUCKET_PUBLIC"

echo "minio-init: buckets ready"
