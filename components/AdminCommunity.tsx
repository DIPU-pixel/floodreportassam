"use client";

import { useCallback, useEffect, useState } from "react";
import { categoryLabel, type AdminCommunityPost } from "@/lib/communityTypes";

/** Admin view: hide or delete community posts (deleting a thread removes its replies). */
export default function AdminCommunity({ secret }: { secret: string }) {
  const [items, setItems] = useState<AdminCommunityPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/community", { headers: { "x-admin-secret": secret }, cache: "no-store" });
      const d = (await r.json()) as { items?: AdminCommunityPost[] };
      setItems(d.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [secret]);
  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, status: "approved" | "hidden") => {
    const r = await fetch(`/api/admin/community/${id}`, {
      method: "PATCH",
      headers: { "x-admin-secret": secret, "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (r.ok) load();
  };
  const del = async (id: string) => {
    if (!confirm("Delete this post (and its replies if it's a thread)?")) return;
    const r = await fetch(`/api/admin/community/${id}`, { method: "DELETE", headers: { "x-admin-secret": secret } });
    if (r.ok) load();
  };

  if (loading) return <p className="py-8 text-center text-sm text-slate-400">Loading…</p>;
  if (items.length === 0) return <p className="py-8 text-center text-sm text-slate-400">No community posts yet.</p>;

  return (
    <ul className="space-y-2">
      {items.map((p) => (
        <li key={p.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-300">
              {categoryLabel(p.category).icon} {categoryLabel(p.category).en}
              {p.parentId && <span className="text-slate-500"> · reply</span>}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${p.status === "hidden" ? "bg-red-800 text-white" : "bg-emerald-700 text-white"}`}>
              {p.status}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-slate-200">{p.message}</p>
          <p className="mt-0.5 text-[10px] text-slate-400">
            — {p.name || "Anonymous"}
            {p.reports > 0 && <span className="text-red-400"> · ⚑ {p.reports} reports</span>}
          </p>
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={() => patch(p.id, p.status === "hidden" ? "approved" : "hidden")}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white"
            >
              {p.status === "hidden" ? "Show" : "Hide"}
            </button>
            <button onClick={() => del(p.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white">🗑 Delete</button>
          </div>
        </li>
      ))}
    </ul>
  );
}
