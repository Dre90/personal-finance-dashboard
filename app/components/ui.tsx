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
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-[color:#fca5a5]"
        : tone === "warn"
          ? "text-warn"
          : "text-text";
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-muted font-medium">{label}</div>
      <div className={`mt-2 text-3xl font-semibold num ${toneClass}`}>
        {isCurrency ? formatNOK(value) : value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
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
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  idPrefix = "tabs",
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: ReadonlyArray<{ value: T; label: string }>;
  /** Prefix used to build stable tab/panel ids; pass a unique value if the page renders more than one `Tabs`. */
  idPrefix?: string;
}) {
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next =
      e.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    onChange(tabs[next]!.value);
    buttonRefs.current[next]?.focus();
  };

  return (
    <div className="flex gap-1 border-b border-app" role="tablist">
      {tabs.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            id={`${idPrefix}-tab-${t.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            // Panels are only mounted for the active tab (see callers), so only the
            // active tab should point at one via aria-controls — pointing an inactive
            // tab at an unmounted element would be an invalid ARIA relationship.
            aria-controls={active ? `${idPrefix}-panel-${t.value}` : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 whitespace-nowrap transition-colors ${
              active
                ? "border-[color:var(--color-primary)] text-text"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Wraps the content for one `Tabs` tab in a `role="tabpanel"` region whose id/
 * `aria-labelledby` match the `id`/`aria-controls` that `Tabs` generates for the
 * same `value` + `idPrefix`, so assistive tech gets the full tab/panel relationship.
 */
export function TabPanel({
  value,
  idPrefix = "tabs",
  children,
}: {
  value: string;
  idPrefix?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`${idPrefix}-panel-${value}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${value}`}
    >
      {children}
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
      {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingPlaceholder({ message = "Laster…" }: { message?: string }) {
  return <div className="text-muted">{message}</div>;
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-muted hover:text-text text-xl"
            aria-label="Lukk"
          >
            ×
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  color = "#10b981",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="w-full h-2 bg-soft rounded-full overflow-hidden border border-app">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}
