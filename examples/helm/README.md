# Helm + GCS/Datastore Emulators Example

Run a multi-replica Verdaccio registry on Kubernetes with the Google Cloud Storage + Datastore storage plugin, fully backed by local emulators — no GCP account needed.

## Prerequisites

- A local Kubernetes cluster: [minikube](https://minikube.sigs.k8s.io/), [kind](https://kind.sigs.k8s.io/), or Docker Desktop
- [Helm 3](https://helm.sh/docs/intro/install/)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)

## 1. Build the plugin image

From the repo root:

```bash
docker build -t verdaccio-google-cloud:local .
```

Load it into your local cluster:

```bash
# minikube
eval $(minikube docker-env)
docker build -t verdaccio-google-cloud:local .

# kind
kind load docker-image verdaccio-google-cloud:local

# Docker Desktop
# No extra step needed — images are shared
```

## 2. Deploy emulators

```bash
kubectl apply -f emulators.yaml
```

Wait for them to be ready:

```bash
kubectl -n gcp-emulators rollout status deployment/fake-gcs-server
kubectl -n gcp-emulators rollout status deployment/datastore-emulator
```

## 3. Create GCS bucket

```bash
kubectl apply -f init-resources.yaml
```

Wait for the job to complete:

```bash
kubectl -n gcp-emulators wait --for=condition=complete job/init-gcp-resources --timeout=60s
```

## 4. Install Verdaccio

```bash
helm repo add verdaccio https://charts.verdaccio.org
helm repo update
helm install verdaccio verdaccio/verdaccio -f values.yaml
```

## 5. Verify

```bash
# Check pods
kubectl get pods -l app.kubernetes.io/name=verdaccio

# Check plugin loaded
kubectl logs -l app.kubernetes.io/name=verdaccio | grep "google-cloud"

# Port-forward
kubectl port-forward svc/verdaccio 4873:4873
```

In another terminal:

```bash
# Ping
curl http://localhost:4873/-/ping

# Add user
npm adduser --registry http://localhost:4873

# Create and publish a test package
mkdir /tmp/helm-test && cd /tmp/helm-test
echo '{"name":"helm-test-pkg","version":"1.0.0"}' > package.json
npm publish --registry http://localhost:4873

# Verify it's stored
curl -s http://localhost:4873/helm-test-pkg | jq .name
```

## 6. Scale up

Edit `values.yaml` and change `replicaCount`, or:

```bash
kubectl scale deployment verdaccio --replicas=3
```

All replicas share the same GCS bucket and Datastore database via the emulators.

## 7. Inspect emulator data

```bash
# Port-forward fake-gcs-server
kubectl -n gcp-emulators port-forward svc/fake-gcs-server 5050:5050

# List GCS objects
curl -s http://localhost:5050/storage/v1/b/verdaccio-storage/o | jq '.items[].name'

# Port-forward Datastore emulator
kubectl -n gcp-emulators port-forward svc/datastore-emulator 8081:8081

# Set emulator host for Datastore clients
export DATASTORE_EMULATOR_HOST=localhost:8081
```

## 8. Clean up

```bash
helm uninstall verdaccio
kubectl delete -f init-resources.yaml
kubectl delete -f emulators.yaml
```

## File overview

| File                  | Description                                                                            |
| --------------------- | -------------------------------------------------------------------------------------- |
| `values.yaml`         | Helm values for Verdaccio — 2 replicas, emulator endpoints, trace logging              |
| `emulators.yaml`      | Deployment + Service for fake-gcs-server and Datastore emulator in their own namespace |
| `init-resources.yaml` | Job that creates the GCS bucket in fake-gcs-server                                     |
