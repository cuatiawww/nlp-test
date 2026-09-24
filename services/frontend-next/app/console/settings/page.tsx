'use client'

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Save,
  RefreshCw,
  Upload,
  CheckCircle2,
  Trash2,
  Search,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useSettings, SystemSettings } from "@/lib/settings-context";
import { PUBLIC_BASE_PATH } from "@/lib/public-path";
import ResetDataModal from "@/components/ResetDataModal";

interface AuditLogItem {
  id: string;
  user_id: string | null;
  username: string | null;
  action: string;
  resource: string | null;
  details: any;
  ip_address: string | null;
  created_at: string;
}

export default function ConsoleSettingsPage() {
  const { settings: globalSettings, refetch } = useSettings();
  const [form, setForm] = useState<SystemSettings>({ ...globalSettings });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"branding" | "identity" | "audit" | "maintenance">("branding");
  const [resetModalOpen, setResetModalOpen] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");

  const sidebarFileInputRef = useRef<HTMLInputElement>(null);
  const loginFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm({ ...globalSettings });
  }, [globalSettings]);

  useEffect(() => {
    if (tab === "audit") {
      fetchAuditLogs();
    }
  }, [tab]);

  const authHeaders = () => {
    const token = localStorage.getItem("auth_token");
    return {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    };
  };

  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const res = await fetch("/nlp/api/v1/console/audit-logs", {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setAuditLogs(data.data || []);
      }
    } catch {
      toast.error("Failed to load audit logs.");
    } finally {
      setAuditLoading(false);
    }
  };

  const handleFileUpload = (field: keyof SystemSettings, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must not exceed 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      try {
        toast.info("Uploading file to MinIO...");
        const res = await fetch("/nlp/api/v1/console/upload", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            filename: file.name,
            content_base64: base64Data,
            content_type: file.type || "image/png",
          }),
        });
        if (!res.ok) throw new Error("MinIO upload failed");
        const data = await res.json();
        setForm((prev) => ({ ...prev, [field]: data.url }));
        toast.success(`${file.name} successfully uploaded to MinIO! Click "Save Changes" to apply.`);
      } catch {
        setForm((prev) => ({ ...prev, [field]: base64Data }));
        toast.warning(`${file.name} loaded locally (MinIO fallback). Click "Save Changes" to apply.`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/nlp/api/v1/console/settings", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ config_data: form }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Settings saved successfully and applied live!");
        refetch();
      } else {
        toast.error(data.error || "Failed to save settings.");
      }
    } catch {
      toast.error("An error occurred while saving settings.");
    } finally {
      setSaving(false);
    }
  };

  const resetField = (field: keyof SystemSettings, defaultValue: string = "") => {
    setForm((prev) => ({ ...prev, [field]: defaultValue }));
  };

  const filteredLogs = auditLogs.filter((log) => {
    if (!auditSearch) return true;
    const term = auditSearch.toLowerCase();
    return (
      log.username?.toLowerCase().includes(term) ||
      log.action?.toLowerCase().includes(term) ||
      log.resource?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="w-full px-4 md:px-8 py-2 md:py-4">
      {/* Title & Action Buttons (Clean text, NO icon next to title) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold uppercase tracking-[0.04em] text-slate-900">
            System Configuration & Branding
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage sidebar logo, login branding, application identity, footer text, and monitor system audit history.
          </p>
        </div>

        {tab !== "audit" && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setForm({ ...globalSettings })}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition shadow-sm"
            >
              <RefreshCw className="h-4 w-4" /> Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0060A9] px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:bg-[#004b85] disabled:opacity-50 transition shadow-sm"
            >
              <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {/* Tabs Navigation (Clean Flat Pills) */}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setTab("branding")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            tab === "branding"
              ? "bg-[#0060A9] text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Branding & Logos
        </button>
        <button
          onClick={() => setTab("identity")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            tab === "identity"
              ? "bg-[#0060A9] text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          System Identity
        </button>
        <button
          onClick={() => setTab("audit")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            tab === "audit"
              ? "bg-[#0060A9] text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Activity Audit Logs
        </button>
        <button
          onClick={() => setTab("maintenance")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
            tab === "maintenance"
              ? "bg-[#0060A9] text-white shadow-sm"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Data Maintenance
        </button>
      </div>

      {/* TAB 1: BRANDING & LOGOS */}
      {tab === "branding" && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          {/* Card 1: Sidebar Logo (NO icon next to title) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Sidebar & Main Navigation Logo
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    The primary emblem displayed on top of the dashboard sidebar and header.
                  </p>
                </div>
                {form.sidebar_logo_url && (
                  <button
                    type="button"
                    onClick={() => resetField("sidebar_logo_url")}
                    className="text-xs text-red-600 hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>

              {/* Preview Box */}
              <div className="mt-5 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-6 min-h-[140px]">
                {form.sidebar_logo_url ? (
                  <div className="relative flex flex-col items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.sidebar_logo_url}
                      alt="Sidebar Logo Preview"
                      className="max-h-20 w-auto object-contain"
                      onError={(e) => {
                        e.currentTarget.src = `${PUBLIC_BASE_PATH}/abvc-logo.webp`;
                      }}
                    />
                    <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Active in Navigation
                    </span>
                  </div>
                ) : (
                  <div className="text-center text-xs text-slate-400">
                    <p className="font-semibold text-slate-500">No Custom Logo Set</p>
                    <p className="mt-1">Displaying system default ABVC logo</p>
                  </div>
                )}
              </div>

              {/* Upload Dropzone */}
              <div className="mt-5">
                <input
                  ref={sidebarFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => handleFileUpload("sidebar_logo_url", e)}
                />
                <div
                  onClick={() => sidebarFileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-[#f8fafc] p-8 text-center cursor-pointer hover:border-[#0060A9] hover:bg-blue-50/40 transition group"
                >
                  <Upload className="h-10 w-10 text-slate-400 group-hover:text-[#0060A9] transition mb-3" />
                  <p className="text-sm font-bold text-slate-800">
                    Click to Upload Sidebar Logo
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports PNG, JPG, SVG, or WebP (Max. 5MB)
                  </p>
                </div>
              </div>

              {/* Preset Buttons */}
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold">Default presets:</span>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, sidebar_logo_url: `${PUBLIC_BASE_PATH}/abvc-logo.webp` }))}
                  className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-slate-200 font-medium transition"
                >
                  Logo ABVC (Default)
                </button>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, sidebar_logo_url: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Logo_Kementerian_Kesehatan_Republik_Indonesia.png" }))}
                  className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-slate-200 font-medium transition"
                >
                  Logo MoH RI
                </button>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Or Direct Image / MinIO URL:
              </label>
              <input
                type="text"
                value={form.sidebar_logo_url || ""}
                onChange={(e) => setForm((p) => ({ ...p, sidebar_logo_url: e.target.value }))}
                placeholder="https://... or /nlp/api/v1/assets/..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:border-[#0060A9] focus:bg-white transition"
              />
            </div>
          </div>

          {/* Card 2: Login Logo (NO icon next to title) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Login & Authentication Page Logo
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    The logo displayed on the administrative login page and visitor portal.
                  </p>
                </div>
                {form.login_logo_url && (
                  <button
                    type="button"
                    onClick={() => resetField("login_logo_url")}
                    className="text-xs text-red-600 hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>

              {/* Preview Box */}
              <div className="mt-5 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-6 min-h-[140px]">
                {form.login_logo_url ? (
                  <div className="relative flex flex-col items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.login_logo_url}
                      alt="Login Logo Preview"
                      className="max-h-20 w-auto object-contain"
                      onError={(e) => {
                        e.currentTarget.src = `${PUBLIC_BASE_PATH}/abvc-logo.webp`;
                      }}
                    />
                    <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Active on Login Page
                    </span>
                  </div>
                ) : (
                  <div className="text-center text-xs text-slate-400">
                    <p className="font-semibold text-slate-500">Same as Sidebar Logo</p>
                    <p className="mt-1">Will inherit sidebar logo if not specified</p>
                  </div>
                )}
              </div>

              {/* Upload Dropzone */}
              <div className="mt-5">
                <input
                  ref={loginFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => handleFileUpload("login_logo_url", e)}
                />
                <div
                  onClick={() => loginFileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-[#f8fafc] p-8 text-center cursor-pointer hover:border-emerald-600 hover:bg-emerald-50/40 transition group"
                >
                  <Upload className="h-10 w-10 text-slate-400 group-hover:text-emerald-600 transition mb-3" />
                  <p className="text-sm font-bold text-slate-800">
                    Click to Upload Login Logo
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Supports PNG, JPG, SVG, or WebP (Max. 5MB)
                  </p>
                </div>
              </div>

              {/* Preset Buttons */}
              <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold">Default presets:</span>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, login_logo_url: `${PUBLIC_BASE_PATH}/abvc-logo.webp` }))}
                  className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-slate-200 font-medium transition"
                >
                  Logo ABVC
                </button>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, login_logo_url: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Logo_Kementerian_Kesehatan_Republik_Indonesia.png" }))}
                  className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-slate-200 font-medium transition"
                >
                  Logo MoH RI
                </button>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Or Direct Image / MinIO URL:
              </label>
              <input
                type="text"
                value={form.login_logo_url || ""}
                onChange={(e) => setForm((p) => ({ ...p, login_logo_url: e.target.value }))}
                placeholder="https://... or /nlp/api/v1/assets/..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:border-emerald-600 focus:bg-white transition"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SYSTEM IDENTITY (NO icon next to title) */}
      {tab === "identity" && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm max-w-4xl">
          <div className="border-b border-slate-100 pb-4 mb-6">
            <h2 className="text-base font-bold text-slate-900">
              System Identity & Text Configuration
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure system titles, operational taglines, copyright notices, and marquee ticker messages.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Application Title (Header)
              </label>
              <input
                type="text"
                value={form.app_name || ""}
                onChange={(e) => setForm((p) => ({ ...p, app_name: e.target.value }))}
                placeholder="DISEASE SURVEILLANCE AI"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-[#0060A9] focus:bg-white transition"
              />
              <p className="mt-1 text-xs text-slate-400">
                Displayed as the prominent title in the top dashboard banner.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Application Subtitle / Tagline
              </label>
              <textarea
                rows={2}
                value={form.app_tagline || ""}
                onChange={(e) => setForm((p) => ({ ...p, app_tagline: e.target.value }))}
                placeholder="Spatial outbreak analysis and early health warning system in Southeast Asia."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-[#0060A9] focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Footer Copyright Text
              </label>
              <input
                type="text"
                value={form.footer_text || ""}
                onChange={(e) => setForm((p) => ({ ...p, footer_text: e.target.value }))}
                placeholder="&copy; 2026 Ministry of Health RI &bull; ASEAN Biological Threats Surveillance Centre (ABVC)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-[#0060A9] focus:bg-white transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Live Announcement / Running Ticker
              </label>
              <input
                type="text"
                value={form.ticker_text || ""}
                onChange={(e) => setForm((p) => ({ ...p, ticker_text: e.target.value }))}
                placeholder="SYSTEM OPERATIONAL &bull; 24/7 BIO-SURVEILLANCE SURVEILLANCE FEED ACTIVE"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-[#0060A9] focus:bg-white transition"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT LOGS (NO icon next to title) */}
      {tab === "audit" && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm w-full">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4 mb-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                System Activity Audit Log
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Immutable record of administrative operations, branding updates, and system events.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Search logs..."
                  className="rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 py-2 text-xs text-slate-800 outline-none focus:border-[#0060A9] focus:bg-white transition"
                />
              </div>
              <button
                type="button"
                onClick={fetchAuditLogs}
                disabled={auditLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${auditLoading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
          </div>

          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Details</th>
                  <th className="px-4 py-3">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {auditLoading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Loading audit logs...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      No audit log records found.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("en-US")}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {log.username || "System"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 font-bold uppercase text-[10px] text-[#0060A9] border border-blue-100">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600 max-w-md truncate">
                        {typeof log.details === "object"
                          ? JSON.stringify(log.details)
                          : String(log.details || "-")}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {log.ip_address || "127.0.0.1"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* TAB 4: DATA MAINTENANCE */}
      {tab === "maintenance" && (
        <div className="mt-6 space-y-6 max-w-4xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-4 mb-6">
              <h2 className="text-base font-bold text-slate-900">Data Maintenance & Surveillance Reset</h2>
              <p className="text-xs text-slate-500 mt-0.5">Kelola pembersihan data kejadian penyakit, reset hasil inferensi NLP, dan penyiapan analisa ulang artikel mentah.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block mb-1">Reset Data Analisa & Re-Analisis</span>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">Menghapus hasil deteksi kejadian lama dan mengembalikan status artikel mentah ke NEW agar worker memproses ulang dengan model dan aturan klasifikasi terbaru.</p>
                <button type="button" onClick={() => setResetModalOpen(true)} className="flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-xs font-bold text-white transition shadow-sm cursor-pointer"><Trash2 className="h-4 w-4" /><span>Buka Dialog Reset Data</span></button>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block mb-1">Audit Trail & Kepatuhan</span>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">Setiap tindakan pembersihan dicatat secara permanen ke tabel audit_logs dengan rincian pengguna, timestamp, cakupan data, dan jumlah baris terhapus.</p>
                <button type="button" onClick={() => setTab("audit")} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 transition shadow-xs cursor-pointer"><ExternalLink className="h-4 w-4 text-slate-500" /><span>Periksa Log Audit</span></button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ResetDataModal open={resetModalOpen} onClose={() => setResetModalOpen(false)} onSuccess={() => { fetchAuditLogs(); }} />
    </div>
  );
}
