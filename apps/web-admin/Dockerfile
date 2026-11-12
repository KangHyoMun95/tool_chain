# Build context: repo root (see docker-compose.yml)
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
# NEXT_PUBLIC_* are inlined at build time, so they must be build args
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web-admin/package.json apps/web-admin/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @toolhackchain/web-admin...
COPY packages/shared packages/shared
COPY apps/web-admin apps/web-admin
RUN pnpm --filter @toolhackchain/shared build \
 && pnpm --filter @toolhackchain/web-admin build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# standalone output keeps the monorepo layout (apps/web-admin/server.js); web-admin has no public/ directory
COPY --from=build --chown=node:node /repo/apps/web-admin/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web-admin/.next/static ./apps/web-admin/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web-admin/server.js"]
