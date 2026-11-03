# Build context: repo root (see docker-compose.yml)
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @toolhackchain/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @toolhackchain/shared build \
 && pnpm --filter @toolhackchain/api build \
 && pnpm --filter @toolhackchain/api deploy --legacy --prod /out

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/ ./
# pnpm deploy skips gitignored build output
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/main"]
