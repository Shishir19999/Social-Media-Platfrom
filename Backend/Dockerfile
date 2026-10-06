# Backend image (Node 24 LTS). Build context: this Backend folder.
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV UPLOADS_DIR=/data/uploads
RUN mkdir -p /data/uploads && chown -R node:node /data/uploads /app
USER node
VOLUME /data/uploads
EXPOSE 5000
# HOST defaults to 0.0.0.0 in server.js so the published port works
CMD ["node", "server.js"]
