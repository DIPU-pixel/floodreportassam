"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DragSheet from "@/components/DragSheet";
import { useToast } from "@/components/Toast";
import {
  COMMUNITY_CATEGORIES,
  categoryLabel,
  type CommunityCategory,
  type CommunityPost,
} from "@/lib/communityTypes";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const REFRESH_MS = 15_000;

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const CAT_CLS: Record<CommunityCategory, string> = {
  info: "bg-sky-900/60 text-sky-300",
  question: "bg-violet-900/60 text-violet-300",
  offer: "bg-emerald-900/60 text-emerald-300",
  update: "bg-amber-900/60 text-amber-300",
};

/**
 * Threaded community discussion. Posts are community-submitted and UNVERIFIED —
 * a permanent banner says so and points to official channels. Report + admin
 * moderation guard it. Kept separate from the map's modelled/official data.
 */
export default function Community({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CommunityCategory | "all">("all");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/community", { cache: "no-store" });
      const d = (await r.json()) as { posts: CommunityPost[] };
      setPosts(d.posts ?? []);
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const report = async (id: string) => {
    await fetch(`/api/community/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "report" }),
    }).catch(() => {});
    toast("Reported — thank you", "success");
    load();
  };

  const submitReply = async (parentId: string, message: string) => {
    const r = await fetch("/api/community", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId, category: "info", message }),
    });
    if (r.ok) {
      setReplyTo(null);
      load();
    } else {
      toast("Could not reply — try again", "error");
    }
  };

  const threads = posts.filter((p) => !p.parentId && (filter === "all" || p.category === filter));
  threads.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const repliesOf = (id: string) =>
    posts.filter((p) => p.parentId === id).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

  return (
    <DragSheet onClose={onClose} snap initial="half" ariaLabel="Community discussion">
      <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900 p-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold leading-tight">💬 Community · আলোচনা</h2>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-sm text-slate-300">
            ✕
          </button>
        </div>
        <p className="mt-2 rounded-lg bg-amber-950/50 p-2 text-[11px] leading-snug text-amber-200">
          Community discussion — <b>unverified</b>. Don’t rely on it for safety decisions; follow ASDMA / CWC
          and call 1079 / 1077 for official help. · অসত্যাপিত তথ্য।
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(["all", ...COMMUNITY_CATEGORIES.map((c) => c.id)] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                filter === f ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"
              }`}
            >
              {f === "all" ? "All" : `${categoryLabel(f).icon} ${categoryLabel(f).en}`}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3">
        <NewThread onPosted={load} />

        {loading ? (
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-16" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No posts yet. Start the conversation. · এতিয়ালৈকে একো নাই।
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {threads.map((p) => {
              const cat = categoryLabel(p.category);
              const replies = repliesOf(p.id);
              return (
                <li key={p.id} className="rounded-xl bg-slate-800/70 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${CAT_CLS[p.category]}`}>
                      {cat.icon} {cat.en}
                    </span>
                    <span className="text-[10px] text-slate-500">{ago(p.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-slate-200">{p.message}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">— {p.name || "Anonymous"}</p>

                  {replies.length > 0 && (
                    <ul className="mt-2 space-y-1.5 border-l-2 border-slate-700 pl-2.5">
                      {replies.map((r) => (
                        <li key={r.id}>
                          <p className="whitespace-pre-wrap break-words text-[12px] text-slate-200">{r.message}</p>
                          <p className="text-[10px] text-slate-500">
                            — {r.name || "Anonymous"} · {ago(r.createdAt)}{" "}
                            <button onClick={() => report(r.id)} className="text-slate-500">⚑</button>
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-1.5 flex gap-3 text-[11px]">
                    <button onClick={() => setReplyTo(replyTo === p.id ? null : p.id)} className="font-semibold text-sky-400">
                      💬 Reply
                    </button>
                    <button onClick={() => report(p.id)} className="font-semibold text-slate-400">⚑ Report</button>
                  </div>

                  {replyTo === p.id && <ReplyBox onSend={(m) => submitReply(p.id, m)} onCancel={() => setReplyTo(null)} />}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[10px] leading-snug text-slate-400">
          Be kind and truthful. Don’t share false rescue info or others’ personal details. Reported posts are
          reviewed and removed.
        </p>
      </div>
    </DragSheet>
  );
}

function ReplyBox({ onSend, onCancel }: { onSend: (m: string) => void; onCancel: () => void }) {
  const [msg, setMsg] = useState("");
  return (
    <div className="mt-2 flex gap-1.5">
      <input
        autoFocus
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && msg.trim() && onSend(msg.trim())}
        placeholder="Write a reply…"
        maxLength={1000}
        className="min-w-0 flex-1 rounded-lg bg-slate-900 px-2.5 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
      <button
        onClick={() => msg.trim() && onSend(msg.trim())}
        className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white"
      >
        Send
      </button>
      <button onClick={onCancel} className="shrink-0 rounded-lg bg-slate-700 px-2.5 py-2 text-xs text-slate-300">
        ✕
      </button>
    </div>
  );
}

function NewThread({ onPosted }: { onPosted: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CommunityCategory>("info");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const cfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !TURNSTILE_SITE_KEY || document.querySelector("script[data-turnstile]")) return;
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.defer = true;
    s.setAttribute("data-turnstile", "1");
    document.head.appendChild(s);
  }, [open]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl bg-sky-600 px-3 py-2.5 text-sm font-bold text-white active:bg-sky-700"
      >
        ✏️ New post · নতুন পোষ্ট
      </button>
    );
  }

  const submit = async () => {
    if (message.trim().length < 1) return toast("Write something", "warning");
    const token = cfRef.current?.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value ?? "";
    if (TURNSTILE_SITE_KEY && !token) return toast("Please complete the anti-spam check", "warning");
    setSubmitting(true);
    try {
      const r = await fetch("/api/community", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, name: name.trim(), message: message.trim(), turnstileToken: token }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !d.ok) throw new Error(d.error);
      toast("Posted", "success");
      setMessage("");
      setName("");
      setOpen(false);
      onPosted();
    } catch (e) {
      toast((e as Error)?.message || "Could not post", "error");
      (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-900 p-2.5">
      <div className="flex flex-wrap gap-1.5">
        {COMMUNITY_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              category === c.id ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300"
            }`}
          >
            {c.icon} {c.en}
          </button>
        ))}
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="Share info, ask a question, or offer help… (don’t post false rescue info or others’ personal details)"
        className="w-full rounded-lg bg-slate-800 p-2.5 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name (optional)"
        className="w-full rounded-lg bg-slate-800 p-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
      {TURNSTILE_SITE_KEY && <div ref={cfRef} className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} data-theme="dark" />}
      <div className="flex gap-1.5">
        <button onClick={submit} disabled={submitting} className="flex-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
          {submitting ? "Posting…" : "Post"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-300">
          Cancel
        </button>
      </div>
    </div>
  );
}
