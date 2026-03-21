# Local Development

Guide for developing and testing the `verdaccio-google-cloud` plugin locally.

## Prerequisites

- Node.js >= 24 (see `.nvmrc`)
- [pnpm](https://pnpm.io/) >= 9
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose (for running Verdaccio + GCS/Datastore emulators)

## Setup

```bash
# Install dependencies
pnpm install

# Type-check
pnpm type-check

# Lint
pnpm lint

# Build (ESM via Vite 8)
pnpm build

# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Format code
pnpm format
```

## Project structure

```
src/
  index.ts              # barrel export
  data-storage.ts       # registry database (Cloud Datastore)
  storage.ts            # package storage (Google Cloud Storage)
  storage-helper.ts     # GCS/Datastore helper utilities
types/
  index.ts              # GoogleCloudConfig interface
tests/                  # unit tests (vitest 4)
conf/                   # verdaccio config (baked into Docker image)
```

## Running locally with Docker

The included `docker-compose.yaml` provides a full local setup with:

- **fake-gcs-server** — local Google Cloud Storage emulator
- **datastore-emulator** — official Google Cloud Datastore emulator
- **init-resources** — one-shot container that creates the GCS bucket
- **Verdaccio** (`7.x-next`) — runs with the plugin built and installed

### First run

```bash
# Build the plugin image and start everything
docker compose up -d --build

# Verdaccio will be available at http://localhost:4873
```

### What happens on startup

1. `fake-gcs-server` starts and exposes a GCS-compatible API on port `5050`
2. `datastore-emulator` starts and exposes the Datastore API on port `8081`
3. `init-resources` waits for `fake-gcs-server` to be healthy, then creates:
   - GCS bucket: `verdaccio-storage`
4. The `Dockerfile` builds the plugin in a multi-stage build:
   - **Stage 1** (`node:24-alpine`): installs deps with pnpm, runs `vite build`, prunes dev deps
   - **Stage 2** (`verdaccio/verdaccio:7.x-next`): copies `lib/`, `package.json`, and prod `node_modules/` into `/verdaccio/plugins/verdaccio-google-cloud/`
5. Verdaccio starts with the plugin configured to use the emulator endpoints

### Check it's working

```bash
# Check logs — look for "verdaccio-google-cloud successfully loaded"
docker compose logs verdaccio

# Ping the registry
curl http://localhost:4873/-/ping
```

### Testing the local setup

```bash
# Add a user
npm adduser --registry http://localhost:4873

# Publish a package
npm publish --registry http://localhost:4873

# Install a package
npm install your-package --registry http://localhost:4873
```

### Inspecting emulator data

#### Google Cloud Storage (via fake-gcs-server)

```bash
# List all objects in the bucket
curl -s http://localhost:5050/storage/v1/b/verdaccio-storage/o | jq '.items[].name'

# Download a package.json to inspect it
curl -s http://localhost:5050/storage/v1/b/verdaccio-storage/o/my-pkg%2Fpackage.json?alt=media

# List all buckets
curl -s http://localhost:5050/storage/v1/b | jq '.items[].name'
```

#### Cloud Datastore (via emulator)

The Datastore emulator does not persist data to disk by default (started with `--no-store-on-disk`). All data is reset when the container restarts.

To interact with the Datastore emulator from your host, set the emulator host environment variable:

```bash
export DATASTORE_EMULATOR_HOST=localhost:8081
```

Then use the Google Cloud SDK or any Datastore client library — they will automatically connect to the emulator instead of production.

```bash
# Install gcloud CLI if you don't have it
# macOS
brew install --cask google-cloud-sdk

# Verify
gcloud --version
```

#### Using the gcloud CLI with the emulator

```bash
# Set the emulator host
export DATASTORE_EMULATOR_HOST=localhost:8081

# Use any gcloud datastore commands — they'll target the emulator
# Note: the emulator has limited CLI support; use client libraries for full access
```

### Rebuilding after code changes

After modifying source code in `src/` or `types/`, rebuild the verdaccio image and restart:

```bash
# Rebuild only the verdaccio service (uses Docker cache for unchanged layers)
docker compose build verdaccio

# Restart with the new image
docker compose up -d

# Or do both in one command
docker compose up -d --build
```

To force a clean rebuild (no cache):

```bash
docker compose build --no-cache verdaccio
docker compose up -d
```

### Stopping and cleaning up

```bash
# Stop all containers
docker compose down

# Stop and remove volumes (wipes emulator data)
docker compose down -v
```

## Debug logging

The plugin uses the [`debug`](https://www.npmjs.com/package/debug) package. Enable it with the `DEBUG` environment variable:

```bash
# All plugin namespaces
DEBUG=verdaccio:plugin* docker compose up -d

# Specific namespace only
DEBUG=verdaccio:plugin:google-cloud docker compose up -d
```

Available namespaces:

| Namespace                               | What it logs                                                   |
| --------------------------------------- | -------------------------------------------------------------- |
| `verdaccio:plugin:google-cloud`         | Datastore operations (add, remove, get, tokens, secret)        |
| `verdaccio:plugin:google-cloud:storage` | GCS package operations (read, write, create, delete, tarballs) |

The plugin also uses Verdaccio's built-in `logger.trace` at key points. Enable it by setting `level: trace` in the verdaccio config (already set in `conf/config.yaml`).

## Helm + Emulators (Kubernetes)

See [`examples/helm/`](examples/helm/) for a complete example deploying Verdaccio with the plugin on a local Kubernetes cluster (minikube, kind, Docker Desktop) backed by GCS and Datastore emulators.
