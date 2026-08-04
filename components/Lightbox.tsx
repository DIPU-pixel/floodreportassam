"use client";

import { useState } from "react";

/**
 * Fullscreen image viewer with a real download button. Tap a photo anywhere in
 * the app (help board or admin) to open it here. Download fetches the image as
 * a blob so it saves properly even though photos are on a different origin
 * (Supabase storage); if that's blocked, it falls back to opening in a new tab.
 */
export default function Lightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  if (!url) return null;

  const download = async () => {
    setSaving(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `flood-help-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <div className="flex items-center justify-between gap-2 p-3" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={download}
          disabled={saving}
          className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold text-white active:bg-white/25 disabled:opacity-60"
        >
          {saving ? "Saving…" : "⬇ Download"}
        </button>
        <button onClick={onClose} className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold text-white active:bg-white/25">
          ✕ Close
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Help request photo"
          className="max-h-full max-w-full rounded-lg object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
