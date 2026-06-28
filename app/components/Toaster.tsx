import * as React from "react";

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toasts: ReadonlyArray<Toast>;
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 3500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be used inside <ToastProvider>");
  return ctx;
}

function Toaster() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {ctx.toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto card flex items-start gap-3 max-w-sm shadow-lg animate-toast-in border ${TONE_BORDER[t.tone]}`}
        >
          <span className={`text-lg ${TONE_TEXT[t.tone]}`}>{TONE_ICON[t.tone]}</span>
          <div className="flex-1 text-sm">{t.message}</div>
          <button
            onClick={() => ctx.dismiss(t.id)}
            className="text-muted hover:text-text text-lg leading-none -mt-1"
            aria-label="Lukk varsel"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

const TONE_BORDER: Record<ToastTone, string> = {
  success: "border-emerald-500/40",
  error: "border-red-500/50",
  info: "border-indigo-500/40",
};
const TONE_TEXT: Record<ToastTone, string> = {
  success: "text-emerald-400",
  error: "text-red-400",
  info: "text-indigo-400",
};
const TONE_ICON: Record<ToastTone, string> = {
  success: "✓",
  error: "⚠",
  info: "ℹ",
};
