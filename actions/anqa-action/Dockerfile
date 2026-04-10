FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /build

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.json ./

# Copy package manifests for dependency resolution
COPY packages/core/package.json packages/core/package.json
COPY packages/browser/package.json packages/browser/package.json
COPY packages/rag/package.json packages/rag/package.json
COPY packages/agents/planner/package.json packages/agents/planner/package.json
COPY packages/agents/generator/package.json packages/agents/generator/package.json
COPY packages/agents/healer/package.json packages/agents/healer/package.json
COPY packages/orchestrator/package.json packages/orchestrator/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY actions/anqa-action/package.json actions/anqa-action/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/ packages/
COPY actions/anqa-action/ actions/anqa-action/

RUN pnpm turbo build --filter=@agentic-nqa/anqa-action...

# --- Production image ---
FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Install Playwright test framework + browsers
RUN npm install -g @playwright/test && npx playwright install --with-deps chromium

WORKDIR /app

# Copy built artifacts
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/packages ./packages
COPY --from=builder /build/actions/anqa-action ./actions/anqa-action
COPY --from=builder /build/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /build/package.json ./package.json

ENTRYPOINT ["node", "/app/actions/anqa-action/dist/index.js"]
