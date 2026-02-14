# PCHAT backend - Node.js + Socket.io
FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Server uses PORT from Fly (default 3001)
EXPOSE 3001

CMD ["npm", "start"]
