# Developer Guide: System Console & Branding Module

Dokumentasi arsitektur, struktur kode, dan panduan teknis untuk modul **System Console (`/nlp/console`)**.

---

## 1. Ringkasan & Konsep Modul

Modul **Console** adalah portal administratif mandiri (*stealth admin system*) untuk mengelola branding, logo, teks identitas sistem, manajemen pengguna, dan riwayat audit.

* **Stealth / Tersembunyi**: Tidak ada tombol atau link menuju Console di halaman publik/dashboard utama.
* **Pintu Masuk**: Hanya dapat diakses melalui portal `/nlp/login` dengan memilih opsi **"System Console"** atau akses langsung via URL yang dilindungi autentikasi (`/nlp/console/settings`, `/nlp/console/users`).

---

## 2. Struktur URL & Routing

| Rute URL | Akses | Fungsi |
| :--- | :--- | :--- |
| `/nlp/console/settings` | Admin Only | Pengaturan logo, identitas teks, dan riwayat audit logs. |
| `/nlp/console/users` | Admin Only | Manajemen akun pengguna, hak akses (*role*), dan status aktif. |
| `/nlp/login` | Publik | Halaman login dengan toggle tujuan: `[Dashboard]` vs `[System Console]`. |

---

## 3. Diagram Alur & Interaksi Service

```
[Browser / Admin]
       │
       ├── (1) Simpan / Ambil Config ────────► [Next.js Rewrite] ──► [Backend Rust: 8088] ──► [PostgreSQL]
       │                                       (/api/v1/console/*)    (system_settings, audit_logs)
       │
       └── (2) Upload / Stream Gambar ───────► [Next.js Rewrite] ──► [Collector Python: 8002] ──► [MinIO: 9000]
                                               (/api/v1/console/upload,    (/upload-asset,            (bucket:
                                                /api/v1/assets/*)          /assets/*)                 disease-documents)
```

---

## 4. File-File Utama Terkait

### A. Frontend (`services/frontend-next`)
* [`app/console/settings/page.tsx`](file:///wsl.localhost/Ubuntu/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/app/console/settings/page.tsx): Halaman utama konfigurasi branding & audit log.
* [`app/console/users/page.tsx`](file:///wsl.localhost/Ubuntu/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/app/console/users/page.tsx): Halaman manajemen akun user di dalam Console.
* [`components/layout/AppShell.tsx`](file:///wsl.localhost/Ubuntu/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/components/layout/AppShell.tsx): Wrapper layout otomatis. Jika pathname diawali `/console`, otomatis mengaktifkan `consoleMode` dan merender `consoleMenu`.
* [`components/layout/DashboardHeader.tsx`](file:///wsl.localhost/Ubuntu/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/components/layout/DashboardHeader.tsx): Menampilkan header admin (`Settings`, `Users`, `Dashboard ↗`) saat di Console, dan menyembunyikan Console total saat di Dashboard umum.
* [`lib/settings-context.tsx`](file:///wsl.localhost/Ubuntu/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/lib/settings-context.tsx): React Context global penyedia state `settings` (`sidebar_logo_url`, `app_name`, dll) secara *live* tanpa reload halaman.
* [`next.config.mjs`](file:///wsl.localhost/Ubuntu/home/aspire_5/app/NLP-PENYAKIT/services/frontend-next/next.config.mjs): Konfigurasi *rewrites* proxy ke Rust (`:8088`) dan Collector (`:8002`).

### B. Core API (`services/backend-rust`)
* [`src/api/console.rs`](file:///wsl.localhost/Ubuntu/home/aspire_5/app/NLP-PENYAKIT/services/backend-rust/src/api/console.rs):
  * `GET /api/v1/console/settings` -> Mengambil konfigurasi aktif dari PostgreSQL.
  * `PUT /api/v1/console/settings` -> Memperbarui konfigurasi & mencatat log ke `audit_logs`.
  * `GET /api/v1/console/audit-logs` -> Menampilkan 100 riwayat aksi administratif terakhir.

### C. Media Storage Service (`services/collector-python`)
* [`app/main.py`](file:///wsl.localhost/Ubuntu/home/aspire_5/app/NLP-PENYAKIT/services/collector-python/app/main.py):
  * `POST /upload-asset`: Menerima file (Base64), menyimpannya ke MinIO di folder `branding/<uuid>_<filename>`, dan mengembalikan path URL `/nlp/api/v1/assets/branding/...`.
  * `GET /assets/{object_path:path}`: Melakukan streaming bytes gambar dari MinIO dengan header cache browser 24 jam (`Cache-Control: public, max-age=86400`).

### D. Auto-Provisioning Server (`docker-compose.yml`)
* [`docker-compose.yml`](file:///wsl.localhost/Ubuntu/home/aspire_5/app/NLP-PENYAKIT/docker-compose.yml):
  * Service `disease-minio-init` menggunakan image resmi `quay.io/minio/mc:latest`.
  * Saat container pertama kali naik di server mana pun, script ini otomatis membuat bucket `disease-documents` dan menyetel hak akses download publik (`mc anonymous set download`). Developer tidak perlu konfigurasi manual di MinIO dashboard.

---

## 5. Schema Konfigurasi (`SystemSettings`)

Field yang tersimpan dalam database PostgreSQL:

```typescript
interface SystemSettings {
  sidebar_logo_url?: string;  // Path gambar MinIO atau URL gambar
  login_logo_url?: string;    // Path gambar logo di halaman login
  app_name?: string;          // Judul sistem di top header (Default: DISEASE SURVEILLANCE AI)
  app_tagline?: string;       // Deskripsi sub-header
  footer_text?: string;       // Teks copyright di footer
  ticker_text?: string;       // Teks berjalan / pengumuman sistem
}
```

---

## 6. Panduan Penggunaan Bagi Developer Lain

### Cara Membaca Pengaturan di Komponen Baru:
Gunakan hook `useSettings()` dari React Context:

```tsx
import { useSettings } from "@/lib/settings-context";

export default function MyComponent() {
  const { settings, refetch } = useSettings();

  return (
    <div>
      <img src={settings.sidebar_logo_url || "/abvc-logo.webp"} alt="Logo" />
      <h1>{settings.app_name || "DISEASE SURVEILLANCE AI"}</h1>
    </div>
  );
}
```

### Cara Menambah Field Pengaturan Baru:
1. Tambahkan nama field di tipe `SystemSettings` di file `lib/settings-context.tsx` dan `app/console/settings/page.tsx`.
2. Tambahkan input field baru di tab **System Identity** pada `app/console/settings/page.tsx`.
3. Backend Rust dan PostgreSQL sudah menggunakan schema dinamis JSONB/TEXT, sehingga **tidak memerlukan migrasi database manual**.
