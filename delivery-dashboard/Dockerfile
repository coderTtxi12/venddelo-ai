FROM node:22-alpine

RUN corepack enable

WORKDIR /app

ENV CI=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["pnpm", "dev", "--hostname", "0.0.0.0", "--port", "3000"]
