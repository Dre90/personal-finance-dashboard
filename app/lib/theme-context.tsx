import * as React from "react";
import {
  applyTheme,
  getStoredThemePreference,
  resolveTheme,
  setStoredThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme";

interface ThemeContextValue {
  /** What the user picked: auto / light / dark. */
  preference: ThemePreference;
  /** The actual theme in effect (auto resolved against the OS). */
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/**
 * Holds the theme preference, keeps the `data-theme` attribute in sync, and —
 * while the preference is `auto` — tracks OS changes live via matchMedia.
 *
 * The pre-paint script in __root.tsx has already set `data-theme` before React
 * mounts; this provider takes over once hydrated.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>("auto");
  const [resolved, setResolved] = React.useState<ResolvedTheme>("dark");

  // Sync state from localStorage on mount (client only), and re-apply the
  // resolved theme in case the pre-paint script couldn't read localStorage
  // (e.g. some privacy modes) and fell back to dark.
  React.useEffect(() => {
    const stored = getStoredThemePreference();
    const next = resolveTheme(stored);
    setPreferenceState(stored);
    setResolved(next);
    applyTheme(next);
  }, []);

  // Follow the OS while in auto mode.
  React.useEffect(() => {
    if (preference !== "auto" || typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = resolveTheme("auto");
      setResolved(next);
      applyTheme(next);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = React.useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    setStoredThemePreference(pref);
    const next = resolveTheme(pref);
    setResolved(next);
    applyTheme(next);
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the current theme. Must be used inside `<ThemeProvider>`. */
export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme() must be used inside <ThemeProvider>");
  }
  return ctx;
}
