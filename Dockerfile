# Image của một app giao diện: bản build standalone của Next.js, chạy cạnh core (D-097 của core).
# `APP` chọn app: `admin` (trang quản trị, mặc định) hoặc `storefront` (website bán hàng, W-026).
#   docker build -t autoxide-web .
#   docker build -t autoxide-storefront --build-arg APP=storefront .
#   docker run -p 3000:3000 -e AUTOXIDE_API_URL=http://core:8080 autoxide-web

ARG APP=admin

FROM node:22-alpine AS build
ARG APP
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/admin/package.json apps/admin/
COPY apps/storefront/package.json apps/storefront/
COPY packages/sdk/package.json packages/sdk/
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter "@autoxide/${APP}" build

FROM node:22-alpine
ARG APP
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 APP=${APP}
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
USER node
EXPOSE 3000
CMD ["sh", "-c", "exec node apps/$APP/server.js"]
