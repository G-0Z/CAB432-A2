# Dockerfile
FROM node:20-alpine
WORKDIR /app

# Install deps first (cache-friendly)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app
COPY src ./src
COPY config ./config
# (optional) public assets:
# COPY public ./public

ENV NODE_ENV=production \
    PORT=3000 \
    AWS_REGION=ap-southeast-2 \
    SNAPNOTES_SECRETS_MODE=sm-read \
    SNAPNOTES_SECRET_NAME=n11543027/jwt

EXPOSE 3000
CMD ["node","src/start.js"]
