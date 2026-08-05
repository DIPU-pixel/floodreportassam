"use client";

import { useCallback, useEffect, useState } from "react";
import { HELP_TYPES, helpTypeLabel, type HelpType } from "@/lib/helpTypes";
import type { AdminHelper, HelperKind } from "@/lib/helpers";

/** Admin view: edit a volunteer/NGO's number & causes, hide, or delete. */
export default function AdminHelpers({ secret }: { secret: string }) {
  const [items, setItems] = useState<AdminHelper[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminHelper | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/helpers", { headers: { "x-admin-secret": secret }, cache: "no-store" });
      const d = (await r.json()) as { items?: AdminHelper[] };
      setItems(d.items ?? []);
    } catch {
      setError("Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [secret]);
  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, body: object) => {
    const r = await fetch(`/api/admin/helpers/${id}`, {
      method: "PATCH",
      headers: { "x-admin-secret": secret, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setEditing(null);
      load();
    } else setError("Update failed.");
  };
  const del = async (id: string) => {
    if (!confirm("Delete this helper permanently?")) return;
    const r = await fetch(`/api/admin/helpers/${id}`, { method: "DELETE", headers: { "x-admin-secret": secret } });
    if (r.ok) load();
  };

  if (loading) return <p className="py-8 text-center text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-400">{error}</p>}
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No volunteers/NGOs yet.</p>
      ) : (
        items.map((h) =>
          editing?.id === h.id ? (
            <EditCard key={h.id} helper={editing} onChange={setEditing} onSave={(b) => patch(h.id, b)} onCancel={() => setEditing(null)} />
          ) : (
            <div key={h.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-bold">
                  {h.name}{" "}
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${h.kind === "ngo" ? "bg-violet-700 text-white" : "bg-sky-800 text-sky-200"}`}>
                    {h.kind === "ngo" ? "NGO" : "Volunteer"}
                  </span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${h.status === "hidden" ? "bg-red-800 text-white" : "bg-emerald-700 text-white"}`}>
                  {h.status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {h.causes.map((c) => (
                  <span key={c} className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                    {helpTypeLabel(c).icon} {helpTypeLabel(c).en}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                <a href={`tel:${h.phone}`} className="text-emerald-400">📞 {h.phone}</a>
                {h.area && <span> · 📍 {h.area}</span>}
                {h.reports > 0 && <span className="text-red-400"> · ⚑ {h.reports}</span>}
                {h.description && <span> · {h.description}</span>}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => setEditing(h)} className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white">✏ Edit</button>
                <button
                  onClick={() => patch(h.id, { status: h.status === "hidden" ? "approved" : "hidden" })}
                  className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {h.status === "hidden" ? "Show" : "Hide"}
                </button>
                <button onClick={() => del(h.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white">🗑 Delete</button>
              </div>
            </div>
          )
        )
      )}
    </div>
  );
}

function EditCard({
  helper,
  onChange,
  onSave,
  onCancel,
}: {
  helper: AdminHelper;
  onChange: (h: AdminHelper) => void;
  onSave: (body: object) => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<AdminHelper>) => onChange({ ...helper, ...patch });
  const toggleCause = (c: HelpType) =>
    set({ causes: helper.causes.includes(c) ? helper.causes.filter((x) => x !== c) : [...helper.causes, c] });

  return (
    <div className="rounded-xl border border-sky-800 bg-slate-900 p-3 space-y-2">
      <div className="flex gap-1.5">
        {(["individual", "ngo"] as const).map((k) => (
          <button key={k} onClick={() => set({ kind: k as HelperKind })}
            className={`flex-1 rounded-lg px-2 py-1 text-[11px] font-bold ${helper.kind === k ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"}`}>
            {k === "individual" ? "Individual" : "NGO"}
          </button>
        ))}
      </div>
      <input value={helper.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name"
        className="w-full rounded-lg bg-slate-800 p-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500" />
      <input value={helper.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Contact number"
        className="w-full rounded-lg bg-slate-800 p-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500" />
      <div className="flex flex-wrap gap-1">
        {HELP_TYPES.map((t) => (
          <button key={t.id} onClick={() => toggleCause(t.id)}
            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${helper.causes.includes(t.id) ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}>
            {t.icon} {t.en}
          </button>
        ))}
      </div>
      <input value={helper.area ?? ""} onChange={(e) => set({ area: e.target.value })} placeholder="Area (optional)"
        className="w-full rounded-lg bg-slate-800 p-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500" />
      <textarea value={helper.description ?? ""} onChange={(e) => set({ description: e.target.value })} rows={2} placeholder="Description (optional)"
        className="w-full rounded-lg bg-slate-800 p-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500" />
      <div className="flex gap-1.5">
        <button
          onClick={() => onSave({ kind: helper.kind, name: helper.name, phone: helper.phone, causes: helper.causes, area: helper.area, description: helper.description })}
          className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
        >
          Save
        </button>
        <button onClick={onCancel} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-200">Cancel</button>
      </div>
    </div>
  );
}
