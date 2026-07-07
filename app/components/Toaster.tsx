/**
 * Thin, app-facing toast API backed by `sonner` (shadcn). Pages keep using the
 * same `useToast().push(message, tone)` call they always have; under the hood
 * it delegates to sonner's global `toast()`. The actual `<Toaster />` surface
 * is mounted once in the app shell — sonner is global, so no context provider
 * is required.
 */
import { toast as sonnerToast } from "sonner";

export type ToastTone = "success" | "error" | "info";

function push(message: string, tone: ToastTone = "info"): void {
  if (tone === "success") sonnerToast.success(message);
  else if (tone === "error") sonnerToast.error(message);
  else sonnerToast(message);
}

function dismiss(id?: string | number): void {
  sonnerToast.dismiss(id);
}

const api = { push, dismiss } as const;

/** Access the toast API. No provider needed — sonner is global. */
export function useToast() {
  return api;
}
