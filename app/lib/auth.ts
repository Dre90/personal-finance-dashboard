import * as React from "react";

const STORAGE_KEY = "pfd:dashboardId";

export function getStoredDashboardId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredDashboardId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function clearStoredDashboardId(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function useDashboardId(): string | null {
  const [id, setId] = React.useState<string | null>(null);
  React.useEffect(() => {
    setId(getStoredDashboardId());
  }, []);
  return id;
}
