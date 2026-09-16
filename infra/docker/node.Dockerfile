# syntax=docker/dockerfile:1.7
# api, web, migrate target-ууд нэг build stage-ээс гарна.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@12.4.2
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm build

FROM build AS migrate
WORKDIR /repo/packages/db
CMD ["pnpm", "migrate:deploy"]

FROM build AS api
ENV NODE_ENV=production
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]

FROM build AS web
ENV NODE_ENV=production
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
