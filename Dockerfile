# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Build-time config: leave VITE_API_BASE as /api so nginx proxies to the backend.
ARG VITE_API_BASE=/api
ARG VITE_USE_MOCK=false
ENV VITE_API_BASE=$VITE_API_BASE VITE_USE_MOCK=$VITE_USE_MOCK
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV BACKEND_URL=http://backend:8000
EXPOSE 80
HEALTHCHECK CMD wget -qO- http://localhost/healthz || exit 1
