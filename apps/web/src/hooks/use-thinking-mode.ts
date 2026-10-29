import { useCallback, useState } from "react";

export type ThinkingMode = "show" | "hide";

const STORAGE_KEY = "portal-thinking-mode";

function readThinkingMode(): ThinkingMode {
  if (typeof window === "undefined") return "hide";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "show"
      ? "show"
      : "hide";
  } catch {
    return "hide";
  }
}

export function nextThinkingMode(current: ThinkingMode): ThinkingMode {
  return current === "show" ? "hide" : "show";
}

export function useThinkingMode() {
  const [mode, setModeState] = useState<ThinkingMode>(readThinkingMode);

  const setMode = useCallback((next: ThinkingMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const toggleThinkingMode = useCallback(() => {
    setModeState((current) => {
      const next = nextThinkingMode(current);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      return next;
    });
  }, []);

  return { thinkingMode: mode, setThinkingMode: setMode, toggleThinkingMode };
}
