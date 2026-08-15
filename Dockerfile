# syntax=docker/dockerfile:1

# Official Bun image: https://hub.docker.com/r/oven/bun/tags
# Pin the 1.3 line to match @types/bun while still receiving 1.3.x patches.
FROM oven/bun:1.3 AS base
WORKDIR /usr/src/app

# Dependency layer — cached independently of source changes.
# Vite/vue-tsc live in devDependencies, so the build stage needs the full install.
FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS build
COPY --from=install /usr/src/app/node_modules ./node_modules
COPY . .
# Paint rooftop kWh from the committed GHI grid, then bundle. vue-tsc is omitted
# here: TypeScript 7's export map does not expose `typescript/lib/tsc`.
ENV NODE_ENV=production
RUN bun --bun scripts/solar/build.ts
RUN bun --bun vite build

# Non-root nginx (listens on 8080). Stable Alpine as of NGINX 1.28.x.
FROM nginxinc/nginx-unprivileged:1.28-alpine AS release

COPY --chown=nginx:nginx --from=build /usr/src/app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx docker/nginx.conf /etc/nginx/conf.d/default.conf

# Connection contract for PostgreSQL 18 + PostGIS. Values are injected at runtime
# (Compose or `docker run -e`); never bake credentials into the image.
ENV DATABASE_URL="" \
    POSTGRES_HOST="" \
    POSTGRES_PORT=5432 \
    POSTGRES_DB="" \
    POSTGRES_USER="" \
    POSTGRES_PASSWORD=""

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
