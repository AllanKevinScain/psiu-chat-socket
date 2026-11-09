FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.js index.html styles.css ./
COPY src ./src
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
