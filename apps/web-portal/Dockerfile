# Build context: repo root (see docker-compose.yml)
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
# NEXT_PUBLIC_* are inlined at build time, so they must be build args
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SHOW_STREAM_DEBUG=false
ARG NEXT_PUBLIC_PREDICTION_SOURCE=live
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SHOW_STREAM_DEBUG=$NEXT_PUBLIC_SHOW_STREAM_DEBUG \
    NEXT_PUBLIC_PREDICTION_SOURCE=$NEXT_PUBLIC_PREDICTION_SOURCE \
    NEXT_TELEMETRY_DISABLED=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web-portal/package.json apps/web-portal/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @toolhackchain/web-portal...
COPY packages/shared packages/shared
COPY apps/web-portal apps/web-portal
RUN pnpm --filter @toolhackchain/shared build \
 && pnpm --filter @toolhackchain/web-portal build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
# standalone output keeps the monorepo layout (apps/web-portal/server.js)
COPY --from=build --chown=node:node /repo/apps/web-portal/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web-portal/.next/static ./apps/web-portal/.next/static
# standalone does not bundle public/ (images, logo): copy it next to server.js
COPY --from=build --chown=node:node /repo/apps/web-portal/public ./apps/web-portal/public
USER node
EXPOSE 3001
CMD ["node", "apps/web-portal/server.js"]
