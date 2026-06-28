import * as React from "react";
import { formatNOK } from "../lib/utils";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  isCurrency = true,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "positive" | "negative" | "warn";
  isCurrency?: boolean;
}) {
  const toneClass =
    tone === "positive" ? "text-[color:var(--color-accent)]"
    : tone === "negative" ? "text-[color:#fca5a5]"
    : tone === "warn" ? "text-[color:var(--color-warn)]"
    : "text-[color:var(--color-text)]";
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-[color:var(--color-muted)] font-medium">{label}</div>
      <div className={`mt-2 text-3xl font-semibold num ${toneClass}`}>
        {isCurrency ? formatNOK(value) : value}
      </div>
      {hint && <div className="mt-1 text-xs text-[color:var(--color-muted)]">{hint}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[color:var(--color-muted)] mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card text-center py-12">
      <div className="text-lg font-semibold">{title}</div>
      {description && <div className="mt-1 text-sm text-[color:var(--color-muted)]">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="card w-full max-w-md max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-[color:var(--color-muted)] hover:text-[color:var(--color-text)] text-xl">×</button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max, color = "#10b981" }: { value: number; max: number; color?: string }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full h-2 bg-[color:var(--color-bg-soft)] rounded-full overflow-hidden border border-[color:var(--color-border)]">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
