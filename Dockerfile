###############################################
# Stage 1 – build the plugin
###############################################
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /plugin
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json vite.config.ts ./
COPY src/ ./src/
COPY types/ ./types/
RUN pnpm build

# Prune dev dependencies for a lean install
RUN pnpm prune --prod

###############################################
# Stage 2 – verdaccio + plugin
###############################################
FROM verdaccio/verdaccio:7.x-next

USER root

# Copy the built plugin into verdaccio's plugin directory
RUN mkdir -p /verdaccio/plugins/verdaccio-google-cloud
COPY --from=builder /plugin/lib/          /verdaccio/plugins/verdaccio-google-cloud/lib/
COPY --from=builder /plugin/package.json  /verdaccio/plugins/verdaccio-google-cloud/

COPY --from=builder /plugin/node_modules/ /verdaccio/plugins/verdaccio-google-cloud/node_modules/

# Bake the default config into the image
COPY conf/config.yaml /verdaccio/conf/config.yaml

RUN chown -R 10001:65533 /verdaccio/plugins /verdaccio/conf

USER 10001
