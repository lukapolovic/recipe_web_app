# The ChériChef web server, built and run by Coolify (or any Docker host).
# Setup lives in hosting/RUNBOOK.md.
#
# The test stage runs the whole suite and the hosting check. The runtime stage
# copies a marker out of it, so a failing test fails the image build and the
# previous deployment stays live.

FROM node:24-bookworm-slim AS test
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && touch /tmp/tests-passed

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=test /tmp/tests-passed /tmp/tests-passed
COPY *.js ./
COPY public ./public
# The code stays owned by root, so the server cannot change it, but must be
# readable whatever permissions the files had in the build context.
RUN chmod -R a+rX /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
