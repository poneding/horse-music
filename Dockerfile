FROM public.ecr.aws/docker/library/node:22-alpine

ENV NODE_ENV=production \
    PORT=4173 \
    TMPDIR=/tmp

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && mkdir -p /app/data/media \
    && chown -R node:node /app \
    && chmod 700 /app/data
COPY --chown=node:node server.js index.html styles.css bojack-mark.jpg favicon.png manifest.webmanifest sw.js icon-192.png icon-512.png icon-512-maskable.png apple-touch-icon.png ./
COPY --chown=node:node server ./server
COPY --chown=node:node src ./src
COPY --chown=node:node fonts ./fonts/

USER node
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
