/**
 * Instant Virtual team pools by league, with 3-letter codes and crest colours.
 * Names only — outcomes are pure server RNG.
 * Client-safe module (no server-only).
 *
 * Crests are generated badges (colours + code), not real club logos.
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

/** name → [code, primary colour, secondary colour] */
const T: Record<string, [string, string, string]> = {
  // England
  Arsenal: ["ARS", "#d9232d", "#ffffff"],
  "Aston Villa": ["AST", "#7b1e3a", "#8fc1e8"],
  Bournemouth: ["BOU", "#d71920", "#111111"],
  Brentford: ["BRE", "#e30613", "#ffd200"],
  Brighton: ["BHA", "#0057b8", "#ffffff"],
  Chelsea: ["CHE", "#034694", "#ffffff"],
  Coventry: ["COV", "#59b2e0", "#ffffff"],
  "Crystal Palace": ["CRY", "#1b458f", "#c4122e"],
  Everton: ["EVE", "#003399", "#ffffff"],
  Fulham: ["FUL", "#ffffff", "#111111"],
  Hull: ["HUL", "#f5a21b", "#111111"],
  Ipswich: ["IPS", "#3a64a3", "#ffffff"],
  Leeds: ["LEE", "#ffffff", "#f5c800"],
  Liverpool: ["LIV", "#c8102e", "#ffffff"],
  "Man City": ["MCI", "#6cabdd", "#ffffff"],
  "Man United": ["MUN", "#da291c", "#fbe122"],
  Newcastle: ["NEW", "#111111", "#ffffff"],
  "Nott'm Forest": ["NFO", "#dd0000", "#ffffff"],
  Sunderland: ["SUN", "#eb172b", "#ffffff"],
  Tottenham: ["TOT", "#132257", "#ffffff"],
  // Spain
  "Real Madrid": ["RMA", "#ffffff", "#febe10"],
  Barcelona: ["BAR", "#a50044", "#004d98"],
  Atletico: ["ATM", "#cb3524", "#272e61"],
  Sevilla: ["SEV", "#ffffff", "#d4021d"],
  "Real Sociedad": ["RSO", "#0067b1", "#ffffff"],
  Villarreal: ["VIL", "#fbe106", "#005187"],
  Athletic: ["ATH", "#ee2523", "#ffffff"],
  "Real Betis": ["BET", "#0bb363", "#ffffff"],
  Osasuna: ["OSA", "#d91a21", "#0a346f"],
  Valencia: ["VAL", "#ffffff", "#ee3524"],
  Girona: ["GIR", "#ce1126", "#ffffff"],
  Celta: ["CEL", "#8ac3ee", "#ffffff"],
  Getafe: ["GET", "#005999", "#ffffff"],
  Mallorca: ["MLL", "#e20613", "#111111"],
  Rayo: ["RAY", "#ffffff", "#e53027"],
  Alaves: ["ALA", "#0761af", "#ffffff"],
  Espanyol: ["ESP", "#007fc8", "#ffffff"],
  "Las Palmas": ["LPA", "#ffe400", "#0a4aa0"],
  Levante: ["LEV", "#b4053f", "#004d98"],
  Elche: ["ELC", "#ffffff", "#00843d"],
  // Germany
  Bayern: ["BAY", "#dc052d", "#ffffff"],
  Dortmund: ["BVB", "#fde100", "#111111"],
  "RB Leipzig": ["RBL", "#ffffff", "#dd0741"],
  Leverkusen: ["B04", "#e32221", "#111111"],
  Frankfurt: ["SGE", "#e1000f", "#111111"],
  Wolfsburg: ["WOB", "#65b32e", "#ffffff"],
  Gladbach: ["BMG", "#ffffff", "#00a651"],
  Stuttgart: ["VFB", "#ffffff", "#e32219"],
  Freiburg: ["SCF", "#e2001a", "#111111"],
  Hoffenheim: ["TSG", "#1961b5", "#ffffff"],
  Mainz: ["M05", "#c3141e", "#ffffff"],
  Augsburg: ["FCA", "#ba3733", "#006a38"],
  "Union Berlin": ["FCU", "#eb1923", "#f5c800"],
  Bremen: ["SVW", "#1d9053", "#ffffff"],
  Bochum: ["BOC", "#005ca9", "#ffffff"],
  Heidenheim: ["HDH", "#e2001a", "#003a7d"],
  "St Pauli": ["STP", "#5b3a1e", "#ffffff"],
  Kiel: ["KIE", "#0d4a9b", "#ffffff"],
  // Italy
  Inter: ["INT", "#0068a8", "#111111"],
  "AC Milan": ["MIL", "#fb090b", "#111111"],
  Juventus: ["JUV", "#ffffff", "#111111"],
  Napoli: ["NAP", "#12a0d7", "#ffffff"],
  Roma: ["ROM", "#8e1f2f", "#f0bc42"],
  Lazio: ["LAZ", "#87d8f7", "#ffffff"],
  Atalanta: ["ATA", "#1e71b8", "#111111"],
  Fiorentina: ["FIO", "#5a2d81", "#ffffff"],
  Bologna: ["BOL", "#1a2f48", "#a21c26"],
  Torino: ["TOR", "#8a1e1e", "#ffffff"],
  Genoa: ["GEN", "#a2121f", "#0a2a5e"],
  Udinese: ["UDI", "#111111", "#ffffff"],
  Sassuolo: ["SAS", "#00a550", "#111111"],
  Cagliari: ["CAG", "#a41034", "#0a2a5e"],
  Verona: ["VER", "#f5c800", "#0a2a5e"],
  Lecce: ["LEC", "#f5c800", "#d4021d"],
  Parma: ["PAR", "#ffffff", "#f5c800"],
  Como: ["COM", "#1a5fb4", "#ffffff"],
  Cremonese: ["CRE", "#c1272d", "#9a9a9a"],
  Pisa: ["PIS", "#111111", "#1a5fb4"],
  // Champions extras
  PSG: ["PSG", "#004170", "#da291c"],
  Benfica: ["BEN", "#e30613", "#ffffff"],
  Porto: ["POR", "#003c8f", "#ffffff"],
  Ajax: ["AJA", "#ffffff", "#d2122e"],
  Sporting: ["SCP", "#00804a", "#ffffff"],
  Celtic: ["CLT", "#138a3e", "#ffffff"],
};

export const TEAMS_BY_LEAGUE: Record<VirtualLeagueId, string[]> = {
  england: [
    "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton",
    "Chelsea", "Coventry", "Crystal Palace", "Everton", "Fulham",
    "Hull", "Ipswich", "Leeds", "Liverpool", "Man City",
    "Man United", "Newcastle", "Nott'm Forest", "Sunderland", "Tottenham",
  ],
  spain: [
    "Real Madrid", "Barcelona", "Atletico", "Sevilla", "Real Sociedad",
    "Villarreal", "Athletic", "Real Betis", "Osasuna", "Valencia",
    "Girona", "Celta", "Getafe", "Mallorca", "Rayo",
    "Alaves", "Espanyol", "Las Palmas", "Levante", "Elche",
  ],
  germany: [
    "Bayern", "Dortmund", "RB Leipzig", "Leverkusen", "Frankfurt",
    "Wolfsburg", "Gladbach", "Stuttgart", "Freiburg", "Hoffenheim",
    "Mainz", "Augsburg", "Union Berlin", "Bremen", "Bochum",
    "Heidenheim", "St Pauli", "Kiel",
  ],
  italy: [
    "Inter", "AC Milan", "Juventus", "Napoli", "Roma",
    "Lazio", "Atalanta", "Fiorentina", "Bologna", "Torino",
    "Genoa", "Udinese", "Sassuolo", "Cagliari", "Verona",
    "Lecce", "Parma", "Como", "Cremonese", "Pisa",
  ],
  champions: [
    "Real Madrid", "Man City", "Bayern", "PSG", "Inter",
    "Arsenal", "Barcelona", "Dortmund", "Atletico", "Liverpool",
    "Juventus", "Benfica", "Porto", "Ajax", "Sporting",
    "Leverkusen", "Napoli", "AC Milan", "Chelsea", "Celtic",
  ],
};

export function teamCode(name: string): string {
  return T[name]?.[0] ?? name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
}

export function teamColors(name: string): { primary: string; secondary: string } {
  const t = T[name];
  return { primary: t?.[1] ?? "#4b5563", secondary: t?.[2] ?? "#ffffff" };
}
