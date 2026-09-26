/**
 * Light / dark chrome. The choice lives in localStorage, same place as the
 * engine preference — never in the child's project. The boot script in
 * index.html applies the same rule before CSS paints; keep them in sync.
 */

export type Theme = "light" | "dark";

export const THEME_KEY = "pyplay.theme";

const listeners = new Set<(theme: Theme) => void>();

export function readThemeChoice(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

export function preferredTheme(): Theme {
  const saved = readThemeChoice();
  if (saved) return saved;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme, persist: boolean): void {
  document.documentElement.dataset.theme = theme;
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Privacy mode: the choice still applies until the tab closes.
    }
  }
  for (const listener of listeners) listener(theme);
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next, true);
  return next;
}

export function onTheme(listener: (theme: Theme) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Apply the saved or system theme, and follow the system until the child chooses. */
export function installTheme(): void {
  applyTheme(preferredTheme(), false);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (readThemeChoice()) return;
    applyTheme(preferredTheme(), false);
  });
}
