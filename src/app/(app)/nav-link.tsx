"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, label, stage, badge }: { href: string; label: string; stage: string; badge?: number }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" || path.startsWith("/drafts") || (path.startsWith("/meetings/") && path !== "/meetings/new") : path.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition ${
        active ? "bg-accent-bg text-fg" : "text-soft hover:bg-panel-2"
      }`}
    >
      <span className="flex items-center gap-3">
        <span className="hidden w-8 font-mono text-[10px] text-muted md:inline">{stage}</span>
        {label}
      </span>
      {!!badge && <span className="rounded-full bg-guard px-1.5 font-mono text-[10px] text-bg">{badge}</span>}
    </Link>
  );
}
