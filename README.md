# verdaccio-google-cloud

Google Cloud Storage + Datastore storage plugin for [Verdaccio](https://verdaccio.org).

Uses **Google Cloud Storage** for package tarballs and metadata, and **Cloud Datastore** for the registry database (package list, secrets, tokens).

Built with Google Cloud SDK for Node.js (`@google-cloud/storage` v7, `@google-cloud/datastore` v10).

## Requirements

- **Node.js** >= 24
- **Verdaccio** >= latest
- **Google Cloud Storage Bucket** — stores package tarballs and `package.json` metadata
- **Cloud Datastore** — stores the registry state (package list, secret, auth tokens)
- **Google Cloud Credentials** — via service account key file, Workload Identity, Application Default Credentials, or environment variables

### IAM Permissions

The plugin requires the following IAM roles or equivalent permissions:

**Cloud Storage:**

- `storage.objects.get`
- `storage.objects.create`
- `storage.objects.delete`
- `storage.objects.list`

**Cloud Datastore:**

- `datastore.entities.get`
- `datastore.entities.create`
- `datastore.entities.update`
- `datastore.entities.delete`
- `datastore.indexes.list`

Recommended roles: `roles/storage.objectAdmin` (for GCS) and `roles/datastore.user` (for Datastore).

## Installation

```bash
npm install verdaccio-google-cloud
```

## Configuration

Add to your Verdaccio `config.yaml`:

```yaml
store:
  google-cloud:
    bucket: your-gcs-bucket
    projectId: your-gcp-project-id # optional if using Application Default Credentials
    kind: VerdaccioDataStore # optional, Datastore entity kind (default: VerdaccioDataStore)
    keyFilename: /path/to/service-account.json # optional, for local development
    validation: crc32c # optional, file validation method (default: crc32c)
    resumable: true # optional, enable resumable uploads (default: true)

    # Emulator endpoints (optional, for local development)
    apiEndpoint: http://localhost:5050 # custom GCS endpoint (fake-gcs-server)
    datastoreEndpoint: http://localhost:8081 # custom Datastore endpoint (emulator)
```

### Environment variable support

The plugin supports configuration via environment variables. If you omit a config field, the plugin checks for the corresponding environment variable:

| Config field  | Environment variable                | Description                      |
| ------------- | ----------------------------------- | -------------------------------- |
| `projectId`   | `GOOGLE_CLOUD_VERDACCIO_PROJECT_ID` | Google Cloud project ID          |
| `keyFilename` | `GOOGLE_CLOUD_VERDACCIO_KEY`        | Path to service account key file |

### Environment variables reference

The following environment variables are used by the Docker image and the plugin:

#### Google Cloud Storage

| Variable               | Required | Description                                                              |
| ---------------------- | -------- | ------------------------------------------------------------------------ |
| `GCS_BUCKET`           | Yes      | GCS bucket name for storing packages                                     |
| `GCS_API_ENDPOINT`     | No       | Custom GCS endpoint URL. Required for fake-gcs-server. Omit for real GCP |
| `GOOGLE_CLOUD_PROJECT` | No       | Google Cloud project ID. Default: from Application Default Credentials   |

#### Cloud Datastore

| Variable                  | Required | Description                                                                            |
| ------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `DATASTORE_EMULATOR_HOST` | No       | Datastore emulator host:port. When set, the SDK automatically connects to the emulator |
| `DATASTORE_ENDPOINT`      | No       | Custom Datastore endpoint URL. Required for the emulator. Omit for real GCP            |

#### Authentication

| Variable                            | Required | Description                                                                        |
| ----------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `GOOGLE_APPLICATION_CREDENTIALS`    | No       | Path to service account key file. Omit to use Workload Identity or metadata server |
| `GOOGLE_CLOUD_VERDACCIO_PROJECT_ID` | No       | Project ID override for the plugin                                                 |
| `GOOGLE_CLOUD_VERDACCIO_KEY`        | No       | Key file path override for the plugin                                              |

#### Debug

| Variable | Required | Description                                                                                                      |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `DEBUG`  | No       | Enable [debug](https://www.npmjs.com/package/debug) output. Set to `verdaccio:plugin*` for all plugin namespaces |

Available debug namespaces:

- `verdaccio:plugin:google-cloud` — Datastore operations (add, remove, get, tokens, secret)
- `verdaccio:plugin:google-cloud:storage` — GCS package operations (read, write, create, delete, tarballs)

### Custom storage per package scope

```yaml
packages:
  '@scope/*':
    access: $all
    publish: $all
    storage: 'scoped' # stored under scoped/@scope/pkg/
  '**':
    access: $all
    publish: $all
    proxy: npmjs
    storage: 'public'
```

## Architecture

```
                   +-----------+
                   | Verdaccio |
                   +-----+-----+
                         |
            +------------+------------+
            |                         |
   GoogleCloudDatabase      GoogleCloudStorageHandler
   (registry state)         (per-package storage)
            |                         |
       Datastore              Google Cloud Storage
   +-----------------+      +------------------+
   | Secret          |      | pkg/package.json |
   | VerdaccioData.. |      | pkg/tarball.tgz  |
   | Token           |      +------------------+
   +-----------------+
```

**GoogleCloudDatabase** handles registry operations via Cloud Datastore:

- Package list (`add`, `remove`, `get`)
- Secret management (`getSecret`, `setSecret`)
- Auth tokens (`saveToken`, `deleteToken`, `readTokens`)
- Search (`search`)

**GoogleCloudStorageHandler** handles per-package operations via Google Cloud Storage:

- Package metadata (`readPackage`, `savePackage`, `createPackage`, `deletePackage`)
- Tarballs (`readTarball`, `writeTarball`)

### Datastore entity schema

The plugin uses the following Datastore entity kinds:

| Kind                 | Key                 | Properties                                    | Description         |
| -------------------- | ------------------- | --------------------------------------------- | ------------------- |
| `Secret`             | `secret`            | `secret`                                      | Registry secret key |
| `VerdaccioDataStore` | `{packageName}`     | `name`                                        | Package entry       |
| `Token`              | `{user}:{tokenKey}` | `user`, `key`, `token`, `readonly`, `created` | Auth token          |

The entity kind for packages is configurable via the `kind` config option (default: `VerdaccioDataStore`).

### Setting up GCP resources (production)

#### Create a GCS bucket

```bash
gsutil mb -p your-project-id gs://verdaccio-storage
```

#### Enable Cloud Datastore

Cloud Datastore is automatically available in any GCP project with Firestore in Datastore mode enabled:

```bash
gcloud firestore databases create --type=datastore-mode --location=us-east1
```

#### Terraform

```hcl
resource "google_storage_bucket" "verdaccio" {
  name     = "verdaccio-storage"
  location = "US"
}

resource "google_project_service" "datastore" {
  service = "datastore.googleapis.com"
}
```

## Development

See [LOCAL_DEV.md](LOCAL_DEV.md) for the full local development guide, including:

- Setup, build, test, and lint commands
- Running Verdaccio + GCS/Datastore emulators via Docker Compose
- Inspecting GCS and Datastore data in emulators
- Debug logging namespaces
- Helm + emulators example for Kubernetes

## Scaling & Production Deployment

The plugin is fully stateless and supports horizontal scaling. Run multiple Verdaccio instances behind a load balancer — all instances share the same GCS bucket and Datastore database.

- [Helm example](examples/helm/) — deploy on Kubernetes using the official Verdaccio Helm chart with Workload Identity support

## License

MIT
