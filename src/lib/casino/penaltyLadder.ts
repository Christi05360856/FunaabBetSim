// Shared by the server (payout) and the page (display).
// Index 0 = 1 goal in a row, index 4 = 5 goals in a row.
// Each shot scores with probability 2/3, so n goals in a row has probability
// (2/3)^n. Value = floor(0.99 / (2/3)^n, 2 dp) → return-to-player ≈ 98–99% at
// every step. (Old ladder 2/4/12/20/32 returned 133%–421%.)
export const PENALTY_LADDER: readonly number[] = [1.48, 2.22, 3.34, 5.01, 7.51];
