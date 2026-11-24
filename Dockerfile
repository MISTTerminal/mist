FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY client ./client
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "--max-old-space-size=200", "server/index.js"]
