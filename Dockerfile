FROM node:24-alpine
WORKDIR /app

# Full install (incl. prisma CLI) so the container can run `prisma migrate deploy` on start.
# `postinstall` runs `prisma generate`, which needs the schema present first.
COPY package*.json prisma.config.js ./
COPY prisma ./prisma
RUN npm ci

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start:docker"]
