/**
 * Tiny form-state helper to replace the "one `useState` per field plus a
 * `useEffect` to reset when the modal opens" boilerplate that was repeated in
 * every CRUD modal.
 *
 *   const form = useFormState({ name: "", amount: 0 }, { resetWhen: open && fund });
 *   <input value={form.values.name} onChange={form.setField("name")} />
 *   <input value={form.values.amount} onChange={form.setField("amount", Number)} />
 *
 * The `resetWhen` value is compared by reference — when it changes (e.g. when
 * the editing target changes or the modal opens) the form rehydrates from
 * the latest `initial`.
 */
import * as React from "react";

export interface FormStateApi<T extends Record<string, unknown>> {
  values: T;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  setField: <K extends keyof T>(
    key: K,
    coerce?: (raw: string) => T[K],
  ) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  reset: (next?: Partial<T>) => void;
}

export function useFormState<T extends Record<string, unknown>>(
  initial: T,
  options: { resetWhen?: unknown } = {},
): FormStateApi<T> {
  const [values, setValues] = React.useState<T>(initial);
  const initialRef = React.useRef(initial);
  initialRef.current = initial;

  // Re-seed values whenever `resetWhen` reference changes.
  React.useEffect(() => {
    setValues(initialRef.current);
  }, [options.resetWhen]);

  const set = React.useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setField = React.useCallback(
    <K extends keyof T>(key: K, coerce?: (raw: string) => T[K]) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const raw = e.target.value;
        const next = coerce ? coerce(raw) : (raw as unknown as T[K]);
        setValues((prev) => ({ ...prev, [key]: next }));
      },
    [],
  );

  const reset = React.useCallback((next?: Partial<T>) => {
    setValues({ ...initialRef.current, ...next });
  }, []);

  return { values, set, setField, reset };
}
