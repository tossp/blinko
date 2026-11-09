ARG NODE_IMAGE=dp.tossp.com/library/node:26.13.0-alpine
FROM ${NODE_IMAGE} AS dependencies
ARG USE_MIRROR=false
WORKDIR /app
RUN apk add --no-cache ca-certificates openssl libstdc++ python3 make g++ linux-headers unzip
# Official Bun 1.4.4 release checksums, pinned for each supported native target.
RUN case "$(apk --print-arch)" in \
      x86_64) build=x64-musl-baseline; checksum=6e9c37098b293920aed28bfb51ab240e26d23bfdd9bbfecb3ad428ac166549bc ;; \
      aarch64) build=aarch64-musl; checksum=57f01b02ac7113c61c935f28f38c2eab849e3c970dab21f8b640a87b1ef65009 ;; \
      *) echo 'Unsupported architecture' >&2; exit 1 ;; \
    esac && \
    wget -q "https://github.com/oven-sh/bun/releases/download/bun-v1.4.4/bun-linux-$build.zip" -O /tmp/bun.zip && \
    printf '%s  /tmp/bun.zip\n' "$checksum" | sha256sum -c - && \
    unzip -q /tmp/bun.zip -d /tmp/bun && \
    mv "/tmp/bun/bun-linux-$build/bun" /usr/local/bin/bun && \
    bun --version
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
COPY package.json bun.lock prisma.config.ts ./
COPY patches ./patches
COPY app/package.json ./app/package.json
COPY app/tauri-plugin-blinko/package.json ./app/tauri-plugin-blinko/package.json
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
COPY prisma ./prisma

FROM dependencies AS builder
ARG USE_MIRROR=false
RUN if [ "$USE_MIRROR" = "true" ]; then \
      bun install --frozen-lockfile --registry https://registry.npmmirror.com; \
    else \
      bun install --frozen-lockfile --registry https://registry.npmjs.org; \
    fi
COPY . .
RUN bun run build:web && bun run build:seed

FROM dependencies AS production-dependencies
ARG USE_MIRROR=false
# A fresh install uses the same lockfile; no independent npm installs or global CLI.
RUN if [ "$USE_MIRROR" = "true" ]; then \
      bun install --production --frozen-lockfile --filter @blinko/backend --filter @blinko/shared \
        --registry https://registry.npmmirror.com; \
    else \
      bun install --production --frozen-lockfile --filter @blinko/backend --filter @blinko/shared \
        --registry https://registry.npmjs.org; \
    fi
RUN bun run prisma:generate

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DISABLE_SECURE_COOKIE=false
ENV TRUST_PROXY=1
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
RUN apk add --no-cache ca-certificates openssl libstdc++ dumb-init
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/server ./server
COPY --from=builder /app/dist ./server
COPY --from=builder /app/server/lute.min.js ./server/lute.min.js
COPY --from=builder /app/package.json /app/prisma.config.ts ./
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/prisma ./prisma
RUN printf '#!/bin/sh\nset -eu\n./node_modules/.bin/prisma migrate deploy --config prisma.config.ts\nnode server/seed.js\nexec node server/index.js\n' > start.sh && chmod +x start.sh
EXPOSE 1111
CMD ["/usr/bin/dumb-init", "--", "/bin/sh", "./start.sh"]
