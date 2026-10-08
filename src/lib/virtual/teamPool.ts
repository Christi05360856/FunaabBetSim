/**
 * Instant Virtual team pools by league.
 * Names only — outcomes are pure server RNG.
 * Client-safe module (no server-only).
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
}[] = [
  { id: "england", label: "England" },
  { id: "spain", label: "Spain" },
  { id: "germany", label: "Germany" },
  { id: "italy", label: "Italy" },
  { id: "champions", label: "Champions" },
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
  ],
};
