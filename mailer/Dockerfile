FROM node:22-alpine

# Zero npm dependencies, so there is no install step and nothing to audit.
ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
COPY server.js ./

USER node
EXPOSE 8080
CMD ["node", "server.js"]
