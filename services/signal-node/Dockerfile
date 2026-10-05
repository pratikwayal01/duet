FROM node:20-alpine
WORKDIR /app
# Workspace deps via file: links need the whole tree for `npm ci`.
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages ./packages
COPY services/signal-node ./services/signal-node
RUN npm ci --workspace @duet/signal-node --include-workspace-root && \
    npm run build --workspace @duet/signal-node
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-8787}/api/health | grep -q '"ok":true'
CMD ["node", "services/signal-node/dist/index.js"]
