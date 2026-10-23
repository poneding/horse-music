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
COPY --chown=node:node server.js app.js index.html styles.css bojack.png ./

USER node
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/state').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
