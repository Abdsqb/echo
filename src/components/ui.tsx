import Link from "next/link";

const STATUS_STYLES: Record<string, string> = {
  queued: "border-line text-muted",
  processing: "border-accent/60 text-accent bg-accent-bg",
  drafted: "border-ctx/60 text-ctx bg-ctx-bg",
  draft: "border-accent/60 text-accent bg-accent-bg",
  reviewed: "border-ctx/60 text-ctx bg-ctx-bg",
  sent: "border-ok/50 text-ok",
  failed: "border-danger/60 text-danger bg-danger-bg",
  error: "border-danger/60 text-danger bg-danger-bg",
  skipped: "border-line text-muted",
  ok: "border-ok/50 text-ok",
  pending: "border-guard/60 text-guard-fg bg-guard-bg",
  approved: "border-ok/50 text-ok",
  rejected: "border-line text-muted",
  running: "border-accent/60 text-accent bg-accent-bg",
  done: "border-ok/50 text-ok",
};

export function Status({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] ${STATUS_STYLES[value] ?? "border-line text-muted"}`}>
      {value}
    </span>
  );
}

export function GuardChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-guard bg-guard-bg px-2 py-0.5 font-mono text-[11px] text-guard-fg">
      {children}
    </span>
  );
}

export function PageHeader({ stage, title, sub, actions }: { stage: string; title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="stage mb-1">{stage}</div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children, href, cta }: { title: string; children?: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {href && cta && (
        <Link href={href} className="btn-primary mt-2">
          {cta}
        </Link>
      )}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "guard" | "accent" | "ctx" }) {
  const color = tone === "guard" ? "text-guard-fg" : tone === "accent" ? "text-accent" : tone === "ctx" ? "text-ctx" : "text-fg";
  return (
    <div className="card px-4 py-3">
      <div className="label">{label}</div>
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

export const fmtDate = (d: Date | null | undefined) =>
  d ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

export const fmtUsd = (n: number) => (n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
