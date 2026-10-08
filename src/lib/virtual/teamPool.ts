/**
 * Instant Virtual team pools by league.
 * Names only — outcomes are pure server RNG.
 */

export type VirtualLeagueId =
  | "england"
  | "spain"
  | "germany"
  | "italy"
  | "champions";

export const VIRTUAL_LEAGUES: {
  id: VirtualLeagueId;
  label: string;
  short: string;
}[] = [
  { id: "england", label: "England", short: "ENG" },
  { id: "spain", label: "Spain", short: "ESP" },
  { id: "germany", label: "Germany", short: "GER" },
  { id: "italy", label: "Italy", short: "ITA" },
  { id: "champions", label: "Champions", short: "UCL" },
];

export const TEAMS_BY_LEAGUE: Record<VirtualLeagueId, string[]> = {
  england: [
    "Arsenal",
    "Chelsea",
    "Liverpool",
    "Man City",
    "Man United",
    "Tottenham",
    "Newcastle",
    "Aston Villa",
    "Brighton",
    "West Ham",
    "Fulham",
    "Crystal Palace",
    "Brentford",
    "Wolves",
    "Everton",
    "Nott'm Forest",
    "Bournemouth",
    "Ipswich",
  ],
  spain: [
    "Real Madrid",
    "Barcelona",
    "Atletico",
    "Sevilla",
    "Real Sociedad",
    "Villarreal",
    "Athletic",
    "Real Betis",
    "Osasuna",
    "Valencia",
    "Girona",
    "Celta",
  ],
  germany: [
    "Bayern",
    "Dortmund",
    "RB Leipzig",
    "Leverkusen",
    "Frankfurt",
    "Wolfsburg",
    "Gladbach",
    "Stuttgart",
    "Freiburg",
    "Hoffenheim",
  ],
  italy: [
    "Inter",
    "AC Milan",
    "Juventus",
    "Napoli",
    "Roma",
    "Lazio",
    "Atalanta",
    "Fiorentina",
    "Bologna",
    "Torino",
  ],
  champions: [
    "Real Madrid",
    "Man City",
    "Bayern",
    "PSG",
    "Inter",
    "Arsenal",
    "Barcelona",
    "Dortmund",
    "Atletico",
    "Liverpool",
    "Juventus",
    "Benfica",
    "Chelsea",
    "Al Hilal",
    "Al-Nassr"
    "Vikings",
    "Como",
    "Napoli",
    "Ajax"
  ],
};

/** Flat list for any leftover consumers */
export const VIRTUAL_TEAM_POOL: string[] = Array.from(
  new Set(Object.values(TEAMS_BY_LEAGUE).flat())
);
