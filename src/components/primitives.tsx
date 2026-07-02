import clsx from "clsx";
import type { ReactNode } from "react";
import type { Severity, Verdict } from "@/lib/types";

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={clsx("material-symbols-outlined", className)}>{name}</span>
  );
}

/** Titled TUI module box (label breaks the top border, per reference.html). */
export function Module({
  label,
  labelColor = "text-on-surface-variant",
  right,
  className,
  children,
}: {
  label: string;
  labelColor?: string;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={clsx("tui-module", className)}>
      <span className={clsx("tui-module__label", labelColor)}>[ {label} ]</span>
      {right && <div className="absolute -top-3 right-6 bg-background px-2">{right}</div>}
      {children}
    </section>
  );
}

const severityStyle: Record<Severity, string> = {
  LOW: "border-tertiary text-tertiary",
  MEDIUM: "border-on-surface-variant text-on-surface-variant",
  HIGH: "border-terracotta text-terracotta",
  CRITICAL: "bg-terracotta text-background border-terracotta",
};

export function SeverityTag({ severity }: { severity: Severity }) {
  return (
    <span className={clsx("tui-tag", severityStyle[severity])}>{severity}</span>
  );
}

const verdictStyle: Record<Verdict, string> = {
  BENIGN: "text-tertiary",
  SUSPICIOUS: "text-secondary",
  MALICIOUS: "text-terracotta",
  UNKNOWN: "text-on-surface-variant",
};

export function verdictColor(v: Verdict): string {
  return verdictStyle[v];
}

export function Meter({
  value,
  max = 100,
  color = "bg-on-surface/40",
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-4 border tui-border p-[1px]">
      <div className={clsx("h-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={clsx(
        "inline-block h-2 w-2 rounded-full",
        ok ? "bg-accent-teal animate-pulse" : "bg-terracotta"
      )}
    />
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-accent-teal">
      <Icon name="progress_activity" className="animate-spin text-base" />
      {label && <span className="animate-pulse-soft">{label}</span>}
    </div>
  );
}
