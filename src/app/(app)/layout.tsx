import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { integrations } from "@/lib/env";
import { logout } from "../actions";
import { NavLink } from "./nav-link";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ pending }] = await db.select({ pending: count() }).from(schema.proposals).where(eq(schema.proposals.status, "pending"));
  const mock = integrations().mockAi;

  const nav = [
    { href: "/", label: "Inbox", stage: "04" },
    { href: "/meetings/new", label: "New meeting", stage: "01" },
    { href: "/voice", label: "Voice profile", stage: "ctx" },
    { href: "/learning", label: "Learning", stage: "loop", badge: pending },
    { href: "/evals", label: "Evals", stage: "gate" },
    { href: "/runs", label: "Run log", stage: "ops" },
    { href: "/settings", label: "Settings", stage: "cfg" },
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-line bg-panel md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-5 py-5 md:block">
          <Link href="/" className="block">
            <div className="text-xl font-semibold">Echo</div>
            <div className="font-mono text-[11px] text-muted">drafts only · never sends</div>
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {nav.map((n) => (
            <NavLink key={n.href} {...n} />
          ))}
        </nav>
        <form action={logout} className="hidden px-5 py-6 md:block">
          <button className="font-mono text-[11px] text-muted hover:text-fg">sign out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1">
        {mock && (
          <div className="border-b border-guard/40 bg-guard-bg px-6 py-2 font-mono text-xs text-guard-fg">
            MOCK AI MODE: no ANTHROPIC_API_KEY set, so drafts are placeholder output. Add a key in .env.local for real drafts.
          </div>
        )}
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</div>
      </main>
    </div>
  );
}
