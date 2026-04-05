FROM mcr.microsoft.com/playwright:v1.49.1-noble

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Install dependencies
RUN pnpm install --filter @flowright/api...

# Install Playwright browsers
RUN pnpm --filter @flowright/api exec playwright install chromium

# Build
RUN pnpm --filter @flowright/api build

EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]
