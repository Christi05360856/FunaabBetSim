// Shared by the server (payout) and the page (display).
// Do NOT add "server-only" here, because the page imports it too.
// Index 0 = 1 goal in a row, index 4 = 5 goals in a row.
export const PENALTY_LADDER: readonly number[] = [2, 4, 12, 20, 32];
