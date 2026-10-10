/** Client-only ticket handoff between /virtual pages. No Firestore. */

export type StoredLeg = {
  matchId: string;
  home: string;
  away: string;
  market: "1x2" | "ou25" | "btts";
  pick: string;
  odds: number;
  label: string;
};

export type StoredTicket = {
  roundId: string;
  stake: number;
  potential: number;
  legs: StoredLeg[];
  placedAt: number;
};

const KEY = "funaab_virtual_ticket";
const RESULT_KEY = "funaab_virtual_result";

export function saveTicket(t: StoredTicket) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* private mode */
  }
}

export function loadTicket(): StoredTicket | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredTicket;
  } catch {
    return null;
  }
}

export function clearTicket() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

export type StoredResult = {
  roundId: string;
  results: Array<{
    matchId: string;
    homeGoals: number;
    awayGoals: number;
    goals?: Array<{ minute: number; side: "home" | "away" }>;
  }>;
  matches: Array<{ id: string; home: string; away: string; league: string }>;
  settled: Array<{ betId: string; status: "won" | "lost"; payout: number; profit: number }>;
  summary: string;
  balance?: number;
};

export function saveResult(r: StoredResult) {
  try {
    sessionStorage.setItem(RESULT_KEY, JSON.stringify(r));
  } catch {
    /* */
  }
}

export function loadResult(): StoredResult | null {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredResult;
  } catch {
    return null;
  }
}

export function clearResult() {
  try {
    sessionStorage.removeItem(RESULT_KEY);
  } catch {
    /* */
  }
}
