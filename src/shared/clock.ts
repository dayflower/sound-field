import { getLanguage } from "./i18n";

export function updateClock(element: HTMLElement): void {
  element.textContent = new Date().toLocaleTimeString(
    getLanguage() === "ja" ? "ja-JP" : "en-US",
    { hour12: false },
  );
}

/** Starts a locale-aware clock and returns the matching cleanup function. */
export function startClock(element: HTMLElement): () => void {
  updateClock(element);
  const timer = window.setInterval(() => updateClock(element), 500);
  return () => window.clearInterval(timer);
}
