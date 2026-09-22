# K3s dev environment

Environment kedua, terpisah dari Docker Hermes.

- `nlpdev01`: application/control-plane
- `nlpdev02`: NLP/data
- Registry: `gitea.mediaciptainformasi.co.id/arlansyah`
- Domain: `dev.abvc-surveillance.org`

Secret runtime di namespace dibuat di luar Git. Model NLP sekitar 7,6 GB disalin satu arah dari Hermes menggunakan `rsync` setelah PVC siap; jangan gunakan `rsync --delete` terhadap source Hermes.

Migration SQL 108 file/sekitar 11 MB belum dimasukkan sebagai ConfigMap; database dev akan diisi melalui restore SQL dan migration job terpisah.
