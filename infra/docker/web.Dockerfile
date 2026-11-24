# syntax=docker/dockerfile:1
# Image du web : fichiers statiques de la PWA servis par Caddy, qui relaie /api et /health vers l'API.
FROM node:26-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @jarvis/web...
COPY apps/web apps/web
COPY packages/shared packages/shared
RUN pnpm --filter @jarvis/web build

FROM caddy:2-alpine
# Caddy tourne sans être root : il garde seulement le droit d'écouter sur les ports 80 et 443.
RUN apk add --no-cache libcap \
    && setcap cap_net_bind_service=+ep /usr/bin/caddy \
    && addgroup -S app && adduser -S -G app app \
    && mkdir -p /data /config && chown -R app:app /data /config
COPY infra/docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
USER app
EXPOSE 80 443
