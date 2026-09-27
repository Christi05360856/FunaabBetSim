export type MatchStatus = "scheduled" | "live" | "finished" | "cancelled";

export type MarketType =
  | "1X2"
  | "double_chance"
  | "draw_no_bet"
  | "over_under"
  | "both_teams_score"
  | "correct_score";

export type OptionId =
  | "home"
  | "draw"
  | "away"
  | "1X"
  | "12"
  | "X2"
  | "dnb_home"
  | "dnb_away"
  | "over_0.5"
  | "under_0.5"
  | "over_1.5"
  | "under_1.5"
  | "over_2.5"
  | "under_2.5"
  | "over_3.5"
  | "under_3.5"
  | "over_4.5"
  | "under_4.5"
  | "btts_yes"
  | "btts_no"
  | "cs_1_0"
  | "cs_2_0"
  | "cs_2_1"
  | "cs_3_0"
  | "cs_3_1"
  | "cs_3_2"
  | "cs_0_0"
  | "cs_1_1"
  | "cs_2_2"
  | "cs_3_3"
  | "cs_0_1"
  | "cs_0_2"
  | "cs_1_2"
  | "cs_0_3"
  | "cs_1_3"
  | "cs_2_3"
  | "cs_other";

export interface Team {
  id: string;
  name: string;
  shortName: string;
  logoUrl?: string;
  createdAt: number;
}

export interface Match {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: number;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  createdAt: number;
}

export interface MarketOption {
  id: OptionId;
  label: string;
  odds: number;
  status: "open" | "suspended" | "settled";
  result?: "won" | "lost" | "void";
}

export interface Market {
  id: string;
  matchId: string;
  type: MarketType;
  options: MarketOption[];
  status: "open" | "suspended" | "settled";
  createdAt: number;
}

export type BetStatus = "open" | "won" | "lost" | "void";

export interface BetLeg {
  matchId: string;
  marketId: string;
  selectionId: string;
  selectionLabel: string;
  odds: number;
}

export interface Bet {
  id: string;
  userId?: string;
  uid: string;
  type?: "single" | "accumulator";
  legs?: BetLeg[];
  matchId: string;
  marketId: string;
  selectionId: string;
  selectionLabel?: string;
  stake: number;
  potentialPayout: number;
  status: "open" | "won" | "lost" | "voided";
  placedAt: number;
  settledAt?: number;
  payout?: number;
  hidden?: boolean;
}

export interface BookingCode {
  id: string;
  legs: BetLeg[];
  totalOdds: number;
  createdAt: number;
}

export interface WalletTransaction {
  id: string;
  uid: string;
  type: "deposit" | "withdrawal" | "bet_placed" | "bet_payout" | "admin_adjustment";
  amount: number;
  betId?: string;
  description?: string;
  createdAt: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  walletBalance: number;
  role: "user" | "admin";
  createdAt: number;
}
