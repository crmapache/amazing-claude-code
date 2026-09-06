# The relay is small on purpose: one process, no database, no volume. What it needs at runtime is Node
# and about a hundred kilobytes of JavaScript.
FROM node:22-alpine AS build
WORKDIR /app
# The image's own npm is too old for this dependency set: npm 10.9 resolves it into
# "Cannot read properties of null (reading 'edgesOut')" and stops, which is a bug in its resolver
# rather than anything about these packages - the same package.json installs cleanly on 12. Pinned to a
# major rather than left at latest, so the build breaks on purpose when it is next moved rather than on
# whatever npm was published that morning.
RUN npm install -g npm@12
COPY package.json ./
RUN npm install --omit=optional
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# The image's own npm is too old for this dependency set: npm 10.9 resolves it into
# "Cannot read properties of null (reading 'edgesOut')" and stops, which is a bug in its resolver
# rather than anything about these packages - the same package.json installs cleanly on 12. Pinned to a
# major rather than left at latest, so the build breaks on purpose when it is next moved rather than on
# whatever npm was published that morning.
RUN npm install -g npm@12
COPY package.json ./
RUN npm install --omit=dev --omit=optional
COPY --from=build /app/dist ./dist
# The phone's own files, when this relay is the one serving them. Built from the plugin's repository
# and dropped in here - see README. Absent is fine: RELAY_STATIC_DIR="" turns serving them off.
COPY public ./public
EXPOSE 8080
CMD ["node", "dist/index.js"]
