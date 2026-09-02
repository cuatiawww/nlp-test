FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_BASE_PATH=/nlp
ARG BACKEND_INTERNAL_URL=http://backend-rust:8081
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV BACKEND_INTERNAL_URL=$BACKEND_INTERNAL_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/.next/static ./.next/standalone/.next/static
# The standalone server resolves static public files relative to its own
# directory, not the outer /app working directory.
COPY --from=builder /app/public ./.next/standalone/public
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["node", ".next/standalone/server.js"]
