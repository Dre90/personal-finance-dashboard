/**
 * Theme handling for the app.
 *
 * The user picks a *preference* (`auto` | `light` | `dark`) which is persisted
 * per-device in localStorage. From that we derive a *resolved* theme
 * (`light` | `dark`) — `auto` follows the OS via `prefers-color-scheme`.
 *
 * The resolved theme is exposed to CSS as `data-theme` on <html>, and
 * `THEME_INIT_SCRIPT` applies it before first paint to avoid a flash of the
 * wrong theme on load.
 */

export type ThemePreference = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "pfd:theme";

const PREFERENCES: readonly ThemePreference[] = ["auto", "light", "dark"];

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "auto";
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    if (value && PREFERENCES.includes(value as ThemePreference)) {
      return value as ThemePreference;
    }
  } catch {
    /* ignore */
  }
  return "auto";
}

export function setStoredThemePreference(pref: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* ignore */
  }
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === "auto" ? getSystemTheme() : pref;
}

export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolved;
}

/**
 * Self-executing script injected into <head> so `data-theme` is set on <html>
 * before the stylesheet paints. Kept dependency-free and stringified because it
 * must run synchronously during SSR hydration, ahead of React.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});var r=(p==="light"||p==="dark")?p:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=r;}catch(e){document.documentElement.dataset.theme="dark";}})();`;
