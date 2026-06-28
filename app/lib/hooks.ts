import * as React from "react";
import { getStoredDashboardId } from "./auth";

/**
 * Minimal client-side data fetching hook for server functions.
 * Re-runs when `deps` change. Provides loading/error/data + refetch.
 */
export function useServerData<T>(
  fn: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
): {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const [data, setData] = React.useState<T | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const fnRef = React.useRef(fn);
  fnRef.current = fn;

  const run = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fnRef.current();
      setData(res);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  React.useEffect(() => {
    void run();
  }, [run]);

  return { data, loading, error, refetch: run };
}

export function useDashboardId(): string | null {
  const [id, setId] = React.useState<string | null>(null);
  React.useEffect(() => {
    setId(getStoredDashboardId());
  }, []);
  return id;
}
