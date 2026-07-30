# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Serve stage ----
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# nginx's own entrypoint runs envsubst on any *.template file here and writes the
# result (with the .template suffix stripped) into /etc/nginx/conf.d/ before startup —
# this is what substitutes ${PORT}. Only variables that actually exist in the
# container's environment get replaced, so nginx's own $uri/$host stay untouched.
COPY nginx.conf /etc/nginx/templates/default.conf.template
