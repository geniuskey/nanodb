import { createContext, useContext, useEffect, useState } from "react";

import { api } from "./client";
import type { SummaryView } from "./types";

export type SummaryState = "loading" | "success" | "failure";

export interface SummaryResult {
  summary: SummaryView | null;
  state: SummaryState;
}

// undefined = no provider in the tree; a consumer should then fetch on its own.
export const SummaryContext = createContext<SummaryResult | undefined>(undefined);

/** Fetch /api/summary once. `enabled` lets a consumer defer to a shared provider. */
export function useSummaryFetch(enabled = true): SummaryResult {
  const [summary, setSummary] = useState<SummaryView | null>(null);
  const [state, setState] = useState<SummaryState>("loading");

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    api
      .getSummary()
      .then((value) => {
        if (active) {
          setSummary(value);
          setState("success");
        }
      })
      .catch(() => active && setState("failure"));
    return () => {
      active = false;
    };
  }, [enabled]);

  return { summary, state };
}

/** Read the shared summary; fall back to an own fetch when no provider exists. */
export function useSummary(): SummaryResult {
  const shared = useContext(SummaryContext);
  const own = useSummaryFetch(shared === undefined);
  return shared ?? own;
}
