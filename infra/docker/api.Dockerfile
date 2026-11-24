# syntax=docker/dockerfile:1
# Image de l'API : un bundle unique (dist/server.js) sur Node 22 allégé, utilisateur non root.
FROM node:26-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @jarvis/api...
COPY apps/api apps/api
COPY packages/shared packages/shared
COPY packages/db packages/db
RUN pnpm --filter @jarvis/api build

FROM node:26-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
# L'API est un bundle autonome : npm, npx et corepack ne servent à rien à l'exécution (et portent des failles).
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn*
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/packages/db/migrations ./migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/server.js"]
