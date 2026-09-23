# K3s dev environment

Environment kedua, terpisah dari Docker Hermes.

- `nlpdev01`: application/control-plane
- `nlpdev02`: NLP/model data (`role=nlp-data`)
- `nlpdev03`: PostgreSQL (`role=database`); K3s agent
- Registry: `gitea.mediaciptainformasi.co.id/arlansyah`
- Domain: `dev.abvc-surveillance.org`

PostgreSQL menggunakan PVC `pg-migration-data` (local-path) pada `nlpdev03`; NLP tetap di `nlpdev02`. PVC lama `data-postgresql-0` di `nlpdev02` dan PV-nya dipertahankan sebagai rollback—jangan hapus sebelum backup dan migrasi dinyatakan aman. Pastikan label node `role=database` tersedia agar StatefulSet PostgreSQL terjadwal di node yang benar.

Secret runtime di namespace dibuat di luar Git. Model NLP sekitar 7,6 GB disalin satu arah dari Hermes menggunakan `rsync` setelah PVC siap; jangan gunakan `rsync --delete` terhadap source Hermes.

Migration SQL 108 file/sekitar 11 MB belum dimasukkan sebagai ConfigMap; database dev akan diisi melalui restore SQL dan migration job terpisah.
