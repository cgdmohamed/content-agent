FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @content-agent/types --filter @content-agent/shared --filter @content-agent/config build
RUN pnpm --filter @content-agent/worker build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/worker/node_modules /app/apps/worker/node_modules
COPY --from=build /app/apps/worker/dist /app/apps/worker/dist
COPY --from=build /app/apps/worker/package.json /app/apps/worker/package.json
COPY --from=build /app/packages/config/package.json /app/packages/config/package.json
COPY --from=build /app/packages/config/dist /app/packages/config/dist
COPY --from=build /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=build /app/packages/shared/dist /app/packages/shared/dist
COPY --from=build /app/packages/types/package.json /app/packages/types/package.json
COPY --from=build /app/packages/types/dist /app/packages/types/dist
COPY docker/node-entrypoint.mjs /app/docker/node-entrypoint.mjs
WORKDIR /app/apps/worker
USER node
CMD ["node", "/app/docker/node-entrypoint.mjs", "dist/main.js", "worker"]
