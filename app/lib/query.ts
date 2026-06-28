/**
 * Tiny query client — module-level cache keyed by a serialised key array, with
 * subscriptions so multiple components reading the same key share one inflight
 * request and re-render when the cache updates.
 *
 * Designed to replace the previous `useServerData` which always refetched on
 * every component mount and triggered an immediate double-fetch when the
 * dashboard id arrived asynchronously from localStorage.
 *
 * Why not pull in @tanstack/react-query? The app already ships TanStack Start;
 * adding another full-blown query library is more weight than we need for ~10
 * fetches. This stays under 100 LOC and covers the patterns we actually use.
 */
import * as React from "react";

type QueryKey = ReadonlyArray<unknown>;

interface CacheEntry<T = unknown> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  /** In-flight promise so concurrent subscribers dedupe. */
  promise: Promise<T> | null;
  listeners: Set<() => void>;
}

const cache = new Map<string, CacheEntry>();

function serialiseKey(key: QueryKey): string {
  return JSON.stringify(key);
}

function getOrCreate<T>(key: string): CacheEntry<T> {
  let entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    entry = {
      data: undefined,
      error: null,
      loading: false,
      promise: null,
      listeners: new Set(),
    };
    cache.set(key, entry);
  }
  return entry;
}

function notify(entry: CacheEntry): void {
  for (const listener of entry.listeners) listener();
}

async function runFetch<T>(
  serialKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const entry = getOrCreate<T>(serialKey);
  if (entry.promise) return entry.promise;
  entry.loading = true;
  entry.error = null;
  notify(entry);
  const promise = (async () => {
    try {
      const data = await fn();
      entry.data = data;
      entry.error = null;
      return data;
    } catch (err) {
      entry.error = err instanceof Error ? err : new Error(String(err));
      throw entry.error;
    } finally {
      entry.loading = false;
      entry.promise = null;
      notify(entry);
    }
  })();
  entry.promise = promise;
  return promise;
}

export interface UseQueryResult<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  /** True only on the very first load (data undefined and loading). */
  isInitialLoading: boolean;
  refetch: () => Promise<T | undefined>;
}

/**
 * useQuery — subscribes to a cache entry identified by `key`. When `enabled`
 * is false the hook stays idle and returns `undefined` data (useful while the
 * dashboard id is being read from localStorage).
 */
export function useQuery<T>(options: {
  key: QueryKey;
  fn: () => Promise<T>;
  enabled?: boolean;
}): UseQueryResult<T> {
  const { key, fn, enabled = true } = options;
  const serialKey = serialiseKey(key);
  const entry = getOrCreate<T>(serialKey);
  const fnRef = React.useRef(fn);
  fnRef.current = fn;

  const subscribe = React.useCallback(
    (cb: () => void) => {
      entry.listeners.add(cb);
      return () => {
        entry.listeners.delete(cb);
      };
    },
    [entry],
  );

  const getSnapshot = React.useCallback(
    () => entry as CacheEntry<T>,
    [entry],
  );
  React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  React.useEffect(() => {
    if (!enabled) return;
    if (entry.data === undefined && !entry.promise) {
      void runFetch(serialKey, () => fnRef.current());
    }
  }, [enabled, serialKey, entry]);

  const refetch = React.useCallback(async () => {
    if (!enabled) return undefined;
    return runFetch(serialKey, () => fnRef.current());
  }, [enabled, serialKey]);

  return {
    data: entry.data,
    error: entry.error,
    loading: entry.loading,
    isInitialLoading: enabled && entry.data === undefined && entry.error === null,
    refetch,
  };
}

/**
 * Invalidate every cached query whose key serialises with the given prefix.
 * Pass a prefix array, e.g. `invalidateQueries(['budget', dashboardId])` will
 * invalidate any key that begins with that pair.
 */
export function invalidateQueries(prefix: QueryKey): void {
  const prefixStr = JSON.stringify(prefix).slice(0, -1); // drop trailing ]
  for (const [key, entry] of cache.entries()) {
    if (key.startsWith(prefixStr)) {
      entry.data = undefined;
      entry.promise = null;
      notify(entry);
    }
  }
}

/** Drop the entire cache. Used on logout. */
export function clearQueryCache(): void {
  for (const entry of cache.values()) {
    entry.data = undefined;
    entry.error = null;
    entry.promise = null;
    notify(entry);
  }
  cache.clear();
}

// ---------------------------------------------------------------------------
// useMutation
// ---------------------------------------------------------------------------

export interface UseMutationResult<TArgs, TResult> {
  mutate: (args: TArgs) => Promise<TResult>;
  loading: boolean;
  error: Error | null;
  reset: () => void;
}

export function useMutation<TArgs, TResult>(options: {
  fn: (args: TArgs) => Promise<TResult>;
  onSuccess?: (result: TResult, args: TArgs) => void | Promise<void>;
  onError?: (error: Error, args: TArgs) => void;
}): UseMutationResult<TArgs, TResult> {
  const { fn, onSuccess, onError } = options;
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const fnRef = React.useRef(fn);
  const onSuccessRef = React.useRef(onSuccess);
  const onErrorRef = React.useRef(onError);
  fnRef.current = fn;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  const mutate = React.useCallback(async (args: TArgs) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current(args);
      await onSuccessRef.current?.(result, args);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      onErrorRef.current?.(e, args);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = React.useCallback(() => {
    setError(null);
    setLoading(false);
  }, []);

  return { mutate, loading, error, reset };
}
