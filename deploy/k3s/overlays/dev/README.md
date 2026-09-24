# K3s dev environment

Environment kedua, terpisah dari Docker Hermes.

- `nlpdev01`: application/control-plane
- `nlpdev02`: NLP/model data (`role=nlp-data`)
- `nlpdev03`: PostgreSQL (`role=database`); K3s agent
- Registry: `registry.abvc-surveillance.org` (OCI, HTTPS, private)
- Domain: `abvc-surveillance.org`
- All workload Pods pull through namespace Secret `registry-pull`; do not add registry credentials to manifests or Git.
- CI builds/pushes immutable `dev-<commit-SHA>` tags and deploys this overlay. The repository runner on `nlpdev01` reads its push credential from `/home/nlpdev/.config/registry/registry-dev-login.txt` (0600); keep that file outside Git and do not print it.

PostgreSQL StatefulSet mounts PVC `pg-migration-data` (local-path, 8Gi) on `nlpdev03`; the previously retained PVC `data-postgresql-0` remains as a rollback copy. Do not delete or overwrite either claim as part of image/CI updates. Ensure label `role=database` stays on the PostgreSQL node.

Secret runtime in the namespace is managed outside Git. Model NLP (about 7.6 GB) is stored on its PVC; deployments must preserve that PVC and must never copy/delete the source model directory as part of CI.

The PVC `collector-social-media` currently remains `Pending` and must not be treated as a usable mount until provisioned separately.
