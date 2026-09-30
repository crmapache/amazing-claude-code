# One process and one SQLite file. The file lives under /data, which the deployment mounts as a volume -
# without one, every new image would start the figures from nothing.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --omit=optional
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV USAGE_DATABASE=/data/usage.sqlite
COPY package.json ./
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
# SQLite from Node itself still carries an "experimental" label and says so once at startup; it is the
# stable part of it this service uses, and the line would be the first thing in every log.
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]
