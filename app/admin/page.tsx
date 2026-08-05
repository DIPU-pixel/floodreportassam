"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminHelpItem } from "@/lib/helpBoard";
import { helpTypeLabel } from "@/lib/helpTypes";
import { mapsUrl } from "@/lib/maps";
import Lightbox from "@/components/Lightbox";

type Filter = "open" | "resolved" | "hidden" | "all";
const STATUS_STYLE: Record<string, string> = {
  open: "bg-emerald-700 text-white",
  resolved: "bg-slate-600 text-white",
  hidden: "bg-red-800 text-white",
};

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [input, setInput] = useState("");
  const [items, setItems] = useState<AdminHelpItem[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; today: number; week: number } | null>(null);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/admin/help", { headers: { "x-admin-secret": key }, cache: "no-store" });
      if (r.status === 401) {
        setError("Wrong password.");
        setAuthed(false);
        localStorage.removeItem("afw.admin");
        return;
      }
      if (r.status === 503) {
        setError("Admin is not configured — set ADMIN_SECRET in Vercel.");
        return;
      }
      const d = (await r.json()) as { items?: AdminHelpItem[] };
      setItems(d.items ?? []);
      setAuthed(true);
      // Visitor stats (best-effort — never blocks the request list).
      fetch("/api/admin/stats", { headers: { "x-admin-secret": key }, cache: "no-store" })
        .then((s) => s.json())
        .then((sd: { stats?: { total: number; today: number; week: number } | null }) => setStats(sd.stats ?? null))
        .catch(() => {});
    } catch {
      setError("Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const s = localStorage.getItem("afw.admin");
    if (s) {
      setSecret(s);
      setAuthed(true);
      load(s);
    }
  }, [load]);

  const login = () => {
    const k = input.trim();
    if (!k) return;
    localStorage.setItem("afw.admin", k);
    setSecret(k);
    load(k);
  };
  const logout = () => {
    localStorage.removeItem("afw.admin");
    setSecret("");
    setAuthed(false);
    setItems([]);
    setInput("");
  };

  const act = async (id: string, method: "PATCH" | "DELETE", body?: object) => {
    const r = await fetch(`/api/admin/help/${id}`, {
      method,
      headers: { "x-admin-secret": secret, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.ok) load(secret);
    else setError("Action failed.");
  };
  const del = (id: string) => {
    if (confirm("Delete this request and its photos permanently? This removes the pin from the map.")) {
      act(id, "DELETE");
    }
  };

  const counts = {
    open: items.filter((i) => i.status === "open").length,
    resolved: items.filter((i) => i.status === "resolved").length,
    hidden: items.filter((i) => i.status === "hidden").length,
    all: items.length,
  };
  const shown = items.filter((i) => (filter === "all" ? true : i.status === filter));

  // ---- Login screen ----
  if (!authed) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 p-4 text-slate-100">
        <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h1 className="text-lg font-bold">🔐 Admin — Assam Flood Watch</h1>
          <p className="mt-1 text-xs text-slate-400">Enter the admin password to manage help requests.</p>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="Admin password"
            className="mt-3 w-full rounded-lg bg-slate-800 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button onClick={login} className="mt-3 w-full rounded-lg bg-sky-600 px-3 py-2.5 text-sm font-bold text-white active:bg-sky-700">
            Sign in
          </button>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  // ---- Dashboard ----
  return (
    <div className="h-dvh overflow-y-auto bg-slate-950 text-slate-100">
      <Lightbox url={lightbox} onClose={() => setLightbox(null)} />
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
        <h1 className="text-base font-bold">🆘 Help requests — admin</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => load(secret)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold">
            {loading ? "…" : "↻ Refresh"}
          </button>
          <button onClick={logout} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300">
            Log out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl p-4">
        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        {/* Visitor stats */}
        {stats && (
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-900 p-2.5">
              <p className="text-lg font-bold text-sky-400">{stats.total.toLocaleString("en-IN")}</p>
              <p className="text-[10px] text-slate-400">Total visits 👁</p>
            </div>
            <div className="rounded-xl bg-slate-900 p-2.5">
              <p className="text-lg font-bold text-emerald-400">{stats.today.toLocaleString("en-IN")}</p>
              <p className="text-[10px] text-slate-400">Today</p>
            </div>
            <div className="rounded-xl bg-slate-900 p-2.5">
              <p className="text-lg font-bold text-amber-400">{stats.week.toLocaleString("en-IN")}</p>
              <p className="text-[10px] text-slate-400">Last 7 days</p>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(["open", "resolved", "hidden", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
                filter === f ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"
              }`}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No {filter !== "all" ? filter : ""} requests.</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((it) => {
              const label = helpTypeLabel(it.helpType);
              return (
                <li key={it.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold">
                      {label.icon} {label.en}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLE[it.status]}`}>
                      {it.status}
                    </span>
                  </div>

                  <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-slate-200">{it.message}</p>

                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    {it.posterName && <span>👤 {it.posterName}</span>}
                    <a href={`tel:${it.phone}`} className="text-emerald-400">📞 {it.phone}</a>
                    <span>📍 {it.district ?? "Assam"}</span>
                    <a href={mapsUrl(it.lat, it.lng)} target="_blank" rel="noopener noreferrer" className="text-sky-400">
                      {it.lat.toFixed(4)}, {it.lng.toFixed(4)} ↗
                    </a>
                    <span>🕑 {ago(it.createdAt)}</span>
                    {it.reports > 0 && <span className="text-red-400">⚑ {it.reports} reports</span>}
                  </div>

                  {it.photoUrls.length > 0 && (
                    <div className="mt-2 flex gap-2 overflow-x-auto">
                      {it.photoUrls.map((u, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={u}
                          alt="Tap to view / download"
                          onClick={() => setLightbox(u)}
                          className="h-20 w-20 shrink-0 cursor-pointer rounded-lg object-cover active:opacity-80"
                        />
                      ))}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {it.status !== "open" && (
                      <button onClick={() => act(it.id, "PATCH", { status: "open" })} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">
                        Reopen
                      </button>
                    )}
                    {it.status !== "resolved" && (
                      <button onClick={() => act(it.id, "PATCH", { status: "resolved" })} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white">
                        ✓ Resolve
                      </button>
                    )}
                    {it.status !== "hidden" && (
                      <button onClick={() => act(it.id, "PATCH", { status: "hidden" })} className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white">
                        Hide
                      </button>
                    )}
                    <button onClick={() => del(it.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white">
                      🗑 Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-[10px] leading-snug text-slate-500">
          Delete removes the request and its photos permanently and clears the pin from the map. Hide keeps
          it in the database but removes it from the public map/list.
        </p>
      </div>
    </div>
  );
}
