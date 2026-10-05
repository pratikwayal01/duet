FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_SIGNAL_URL=""
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm ci --workspace @duet/web --include-workspace-root && \
    VITE_SIGNAL_URL=$VITE_SIGNAL_URL npm run build --workspace @duet/web

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
