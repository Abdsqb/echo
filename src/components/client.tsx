"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

// Re-fetches server data while background work (pipeline, eval run) is going.
export function AutoRefresh({ active, ms = 2500 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [active, ms, router]);
  return null;
}

export function CopyButton({ text, label = "Copy email" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function SubmitButton({ children, className = "btn-primary", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}

export function FileToTextarea({ target }: { target: string }) {
  return (
    <input
      type="file"
      accept=".vtt,.txt,text/vtt,text/plain"
      className="text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-panel-2 file:px-3 file:py-1.5 file:text-sm file:text-fg"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        const el = document.getElementById(target) as HTMLTextAreaElement | null;
        if (file && el) el.value = await file.text();
      }}
    />
  );
}
