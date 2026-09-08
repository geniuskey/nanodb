import { useEffect } from "react";

const SUFFIX = "NANoDB";

/**
 * Name the current screen in the browser tab, history and screen readers
 * (UIX-004). A single-page app keeps the document title from index.html
 * otherwise, so every route looks identical from outside the page.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
