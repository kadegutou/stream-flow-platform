# ---------- 构建阶段 ----------
FROM node:20-alpine AS build
WORKDIR /app
# 先拷贝依赖清单，利用 Docker 层缓存
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- 运行阶段 ----------
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# 自定义配置：/api/ 反代到控制面，history 路由 fallback 到 index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
