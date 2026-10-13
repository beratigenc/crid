# CRID — bağımlılıksız Node sunucusu. Arayüz dist/index.html içinde derlenmiş hâlde gelir.
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY src/logic ./src/logic
COPY dist/index.html ./dist/index.html
ENV NODE_ENV=production
ENV DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server/server.mjs"]
