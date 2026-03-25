FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY package*.json ./
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
RUN npm ci

COPY . .
RUN npm run build
RUN npx prisma generate

FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY package*.json ./
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY database/prisma ./database/prisma

EXPOSE 3000
ENV NODE_ENV=production
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "backend/dist/index.js"]
