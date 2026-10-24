# 天赋实验室 H5 前端镜像：Node 构建 → nginx 托管 + API 反代
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# 容器内 H5 走同源相对路径（nginx 统一反代 /api → backend），避免跨域
RUN sed -i 's#http://127.0.0.1:8000##g' src/api/client.ts \
    && npm run build:h5

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/build/h5 /usr/share/nginx/html
EXPOSE 80
