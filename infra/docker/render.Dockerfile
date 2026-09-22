# syntax=docker/dockerfile:1.7
# Render: api ба worker хоёулаа энэ image-ийг ашиглана (Render build target сонгодоггүй).
# Web нь Vercel дээр тул энд build хийхгүй.

FROM node:24-bookworm-slim
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@12.4.2
# Worker-ийн preview watermark-д фонт, Prisma-д openssl хэрэгтэй
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core fontconfig openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile --filter "@pic/api..."
RUN pnpm --filter "@pic/api..." build
RUN chmod +x infra/docker/render-entrypoint.sh infra/docker/render-start.sh

ENV NODE_ENV=production
WORKDIR /repo/apps/api
EXPOSE 4000
ENTRYPOINT ["/repo/infra/docker/render-entrypoint.sh"]
CMD ["/repo/infra/docker/render-start.sh"]
