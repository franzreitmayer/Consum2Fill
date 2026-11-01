# Development image, see docker-compose.dev.yml. Source and dependencies live in volumes.
FROM node:24-slim AS dev
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
RUN corepack enable
COPY package.json ./
RUN corepack install

FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY apps apps
COPY packages packages
RUN pnpm build
RUN pnpm --filter @c2r/api deploy --prod --legacy /deploy

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /deploy/package.json ./package.json
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/web/dist ./public
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
