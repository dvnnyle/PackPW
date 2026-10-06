# Render runs the backend from this image. Microsoft's Playwright image already contains Chromium and the
# system libraries it needs; its version must match the "playwright" package in package.json.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Dates and opening hours are Norwegian; the browser has no screen on a server.
ENV NODE_ENV=production TZ=Europe/Oslo HEADLESS=true
EXPOSE 3000
CMD ["npm", "start"]
