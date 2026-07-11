import * as React from "react";
import { cn } from "../lib/utils";
import { formatNOK } from "../lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
  Empty as EmptyRoot,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "./ui/empty";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

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
      ? "text-success"
      : tone === "negative"
        ? "text-destructive"
        : tone === "warn"
          ? "text-warning"
          : "text-foreground";
  return (
    <Card>
      <CardHeader>
        <CardDescription className="text-xs font-medium tracking-wider uppercase">
          {label}
        </CardDescription>
        <CardTitle className={cn("text-2xl font-semibold tabular-nums", toneClass)}>
          {isCurrency ? formatNOK(value) : value}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent>
          <p className="text-muted-foreground text-xs">{hint}</p>
        </CardContent>
      )}
    </Card>
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
    <div className="border-border flex gap-1 border-b" role="tablist">
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
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
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
    <EmptyRoot className="border-border rounded-lg border border-dashed">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </EmptyRoot>
  );
}

export function LoadingPlaceholder({ message = "Laster…" }: { message?: string }) {
  return <div className="text-muted-foreground">{message}</div>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  contentClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function ProgressBar({
  value,
  max,
  color = "var(--primary)",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}
