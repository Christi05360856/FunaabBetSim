"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Competition, Match, Team } from "@/types/domain";
import { Card, CardHeader, Button, Input, Select, Field } from "./ui";

type PostResult = {
  ok: boolean;
  message: string;
};

type ParsedMatch = {
  homeTeam: string;
  awayTeam: string;
  kickoffAt: number;
};

type ParsedLine = {
  line: number;
  match?: ParsedMatch;
  error?: string;
};

const NEW = "__new__";
const MAX_MATCHES = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

/* -------------------------------------------------------------------------- */
/*                               KICKOFF HELPERS                              */
/* -------------------------------------------------------------------------- */

function parseWatKickoff(dateStr: string): number {
  const parts = dateStr.split(" ");

  const datePart = parts[0] ?? "";
  const timePart = parts[1] ?? "";

  const dateBits = datePart.split("-").map(Number);
  const timeBits = timePart.split(":").map(Number);

  const y = dateBits[0] ?? 0;
  const mo = dateBits[1] ?? 1;
  const d = dateBits[2] ?? 1;
  const h = timeBits[0] ?? 0;
  const mi = timeBits[1] ?? 0;

  /*
   * Input is WAT (UTC+1), so convert WAT -> UTC.
   */
  return Date.UTC(y, mo - 1, d, h - 1, mi, 0, 0);
}

function formatWatPreview(ts: number): string {
  return (
    new Date(ts).toLocaleString("en-NG", {
      timeZone: "Africa/Lagos",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }) + " WAT"
  );
}

/* -------------------------------------------------------------------------- */
/*                              FIXTURE IMPORTER                              */
/* -------------------------------------------------------------------------- */

function parseLine(raw: string, line: number): ParsedLine {
  const parts = raw.split(";").map((p) => p.trim());

  if (parts.length !== 3) {
    return {
      line,
      error: "Use: Home; Away; YYYY-MM-DD HH:mm (24-hour, WAT)",
    };
  }

  const home = parts[0] ?? "";
  const away = parts[1] ?? "";
  const date = parts[2] ?? "";

  if (!home || !away) {
    return {
      line,
      error: "Both team names are required",
    };
  }

  if (home.toLowerCase() === away.toLowerCase()) {
    return {
      line,
      error: "A team can't play itself",
    };
  }

  if (!DATE_RE.test(date)) {
    return {
      line,
      error:
        "Date must look like 2026-09-26 17:00 — 24-hour WAT (5pm = 17:00, not 05:00)",
    };
  }

  const kickoffAt = parseWatKickoff(date);

  if (Number.isNaN(kickoffAt)) {
    return {
      line,
      error: "That date doesn't exist",
    };
  }

  return {
    line,
    match: {
      homeTeam: home,
      awayTeam: away,
      kickoffAt,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                         DYNAMIC TEAM NAME MATCHING                         */
/* -------------------------------------------------------------------------- */

/**
 * Converts a team name into a comparable form.
 *
 * IMPORTANT:
 * No team names are hardcoded here.
 *
 * Examples:
 *   "Fluminense FC"  -> "fluminense"
 *   "Fluminense FBC" -> "fluminense"
 *   "EC Vitória"     -> "vitoria"
 *   "Chapecoense AF" -> "chapecoense"
 *
 * This works from generic football-club markers rather than specific clubs.
 */
function normalizeTeamName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’.-]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generic club markers frequently added by football data providers.
 *
 * These are NOT team names.
 */
const CLUB_MARKERS = new Set([
  "fc",
  "fbc",
  "af",
  "afc",
  "cf",
  "sc",
  "ec",
  "ac",
  "cd",
  "rc",
  "as",
  "es",
  "ogc",
  "aj",
  "sco",
]);

function teamTokens(raw: string): string[] {
  const normalized = normalizeTeamName(raw);

  if (!normalized) {
    return [];
  }

  return normalized
    .split(" ")
    .filter(Boolean)
    .filter((token) => !CLUB_MARKERS.has(token));
}

/**
 * Creates a canonical comparison key.
 */
function teamKey(raw: string): string {
  return teamTokens(raw).join(" ");
}

/**
 * Determines whether two team names represent the same team.
 *
 * Matching order:
 *
 * 1. Exact normalized name.
 * 2. Same name after removing generic club markers.
 * 3. One team's meaningful tokens contain the other's tokens.
 *
 * No specific team is hardcoded.
 */
function teamsMatch(input: string, stored: string): boolean {
  const inputNormalized = normalizeTeamName(input);
  const storedNormalized = normalizeTeamName(stored);

  if (!inputNormalized || !storedNormalized) {
    return false;
  }

  if (inputNormalized === storedNormalized) {
    return true;
  }

  const inputKey = teamKey(input);
  const storedKey = teamKey(stored);

  if (!inputKey || !storedKey) {
    return false;
  }

  if (inputKey === storedKey) {
    return true;
  }

  const inputTokens = inputKey.split(" ");
  const storedTokens = storedKey.split(" ");

  const inputSet = new Set(inputTokens);
  const storedSet = new Set(storedTokens);

  /*
   * Allow:
   *
   * "psv" <-> "psv eindhoven"
   *
   * but only when every meaningful token from the shorter name
   * exists in the longer name.
   */
  const shorter =
    inputTokens.length <= storedTokens.length
      ? inputSet
      : storedSet;

  const longer =
    inputTokens.length <= storedTokens.length
      ? storedSet
      : inputSet;

  if (shorter.size === 0) {
    return false;
  }

  return [...shorter].every((token) => longer.has(token));
}

/* -------------------------------------------------------------------------- */
/*                              BULK ODDS CARD                                */
/* -------------------------------------------------------------------------- */

function BulkOddsCard({
  matches,
  teamsById,
  onSubmit,
}: {
  matches: Match[];
  teamsById: Record<string, Team>;
  onSubmit: (b: unknown) => Promise<PostResult>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const knownTeamNames = useMemo(
    () =>
      Array.from(
        new Set(
          Object.values(teamsById)
            .map((team) => team.name)
            .filter(Boolean)
        )
      ),
    [teamsById]
  );

  /**
   * Find the actual Match object already loaded from Firestore.
   */
  function findMatch(home: string, away: string): Match | null {
    const candidates = matches.filter((match) => {
      if (match.status === "settled" || match.status === "voided") {
        return false;
      }

      const storedHome =
        teamsById[match.homeTeamId]?.name ?? "";

      const storedAway =
        teamsById[match.awayTeamId]?.name ?? "";

      return (
        teamsMatch(home, storedHome) &&
        teamsMatch(away, storedAway)
      );
    });

    if (candidates.length === 0) {
      return null;
    }

    /*
     * If multiple fixtures exist between the same teams,
     * prefer the earliest upcoming fixture.
     */
    return (
      [...candidates].sort(
        (a, b) => a.kickoffAt - b.kickoffAt
      )[0] ?? null
    );
  }

  /**
   * Gives useful dynamic suggestions based only on names already
   * present in the database.
   */
  function closestNames(name: string): string[] {
    const normalizedInput = teamKey(name);

    if (!normalizedInput) {
      return [];
    }

    const inputTokens = new Set(normalizedInput.split(" "));

    return knownTeamNames
      .map((known) => {
        const knownTokens = new Set(teamKey(known).split(" "));

        const commonTokens = [...inputTokens].filter((token) =>
          knownTokens.has(token)
        );

        return {
          name: known,
          score: commonTokens.length,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => item.name);
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = lines.map((line) => {
    const parts = line.split(";").map((part) => part.trim());

    if (parts.length !== 5) {
      return {
        line,
        error:
          "Use: Home; Away; home odds; draw odds; away odds",
      };
    }

    const [home, away, homeOdds, drawOdds, awayOdds] = parts;

    const match = findMatch(home ?? "", away ?? "");

    if (!match) {
      const hints = [
        ...closestNames(home ?? ""),
        ...closestNames(away ?? ""),
      ].filter(
        (value, index, array) =>
          array.indexOf(value) === index
      );

      const hintText =
        hints.length > 0
          ? ` — closest names on file: ${hints.join(", ")}`
          : " — no similar team name on file";

      return {
        line,
        error: `No fixture found for "${home} v ${away}"${hintText}`,
      };
    }

    const homeValue = Number(homeOdds);
    const drawValue = Number(drawOdds);
    const awayValue = Number(awayOdds);

    if (
      !Number.isFinite(homeValue) ||
      !Number.isFinite(drawValue) ||
      !Number.isFinite(awayValue)
    ) {
      return {
        line,
        error: "Odds must be valid numbers",
      };
    }

    if (
      homeValue < 1.01 ||
      drawValue < 1.01 ||
      awayValue < 1.01
    ) {
      return {
        line,
        error: "Each odd must be at least 1.01",
      };
    }

    return {
      line,
      entry: {
        matchId: match.id,
        home: homeValue,
        draw: drawValue,
        away: awayValue,
      },
      label: `${home} v ${away}`,
    };
  });

  const valid = parsed.flatMap((item) =>
    "entry" in item ? [item.entry] : []
  );

  const errors = parsed.filter(
    (item) => "error" in item
  );

  async function submit() {
    if (valid.length === 0 || busy) {
      return;
    }

    setBusy(true);

    try {
      const result = await onSubmit({
        entries: valid,
      });

      if (result.ok) {
        setText("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Bulk odds"
        subtitle="Generates all 6 markets per line, from 1X2 odds."
      />

      <div className="flex flex-col gap-3">
        <p className="text-sm text-adm-muted">
          One per line: Home Team; Away Team; home; draw; away
        </p>

        <textarea
          rows={8}
          className="w-full rounded-lg border border-adm-line-strong bg-adm-raised px-3 py-2 font-mono text-xs text-adm-ink outline-none focus:border-adm-brand"
          placeholder="Home Team; Away Team; 1.55; 3.60; 5.50"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />

        <div className="text-sm">
          <span className="text-adm-ok">
            {valid.length} matched
          </span>

          {errors.length > 0 && (
            <span className="text-adm-bad">
              {" "}
              · {errors.length} with problems
            </span>
          )}
        </div>

        {errors.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg bg-adm-bad/10 p-3 text-xs text-adm-bad">
            {errors.slice(0, 5).map((item, index) => (
              <li key={index}>
                {item.line}:{" "}
                {(item as { error: string }).error}
              </li>
            ))}

            {errors.length > 5 && (
              <li>
                …and {errors.length - 5} more
              </li>
            )}
          </ul>
        )}

        <Button
          onClick={submit}
          disabled={busy || valid.length === 0}
        >
          {busy
            ? "Generating…"
            : `Generate odds for ${valid.length} match${
                valid.length === 1 ? "" : "es"
              }`}
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*                              MAIN IMPORT TAB                               */
/* -------------------------------------------------------------------------- */

export default function ImportTab({
  competitions,
  matches,
  teamsById,
  onSubmit,
  onGenerateOdds,
}: {
  competitions: Competition[];
  matches: Match[];
  teamsById: Record<string, Team>;
  onSubmit: (b: unknown) => Promise<PostResult>;
  onGenerateOdds: (b: unknown) => Promise<PostResult>;
}) {
  const [choice, setChoice] = useState("");
  const [newName, setNewName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const mode =
    competitions.length === 0 ? NEW : choice;

  const competitionName =
    mode === NEW
      ? newName.trim()
      : competitions.find(
          (competition) => competition.id === mode
        )?.name ?? "";

  const { valid, errors } = useMemo(() => {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const parsed = lines.map((line, index) =>
      parseLine(line, index + 1)
    );

    return {
      valid: parsed.flatMap((item) =>
        item.match ? [item.match] : []
      ),
      errors: parsed.filter((item) => item.error),
    };
  }, [text]);

  const tooMany = valid.length > MAX_MATCHES;

  const canSubmit =
    !busy &&
    competitionName.length >= 2 &&
    valid.length > 0 &&
    !tooMany;

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setBusy(true);

    try {
      const result = await onSubmit({
        competitionName,
        matches: valid,
      });

      if (result.ok) {
        setText("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">
          Bulk import
        </h2>

        <p className="mt-1 text-sm text-adm-muted">
          One fixture per line: Home; Away;
          YYYY-MM-DD HH:mm —{" "}
          <strong>24-hour WAT</strong>{" "}
          (5:00pm = 17:00, not 05:00)
        </p>
      </div>

      <Card>
        <CardHeader
          title="Import fixtures"
          subtitle="Teams that don't exist yet are created automatically."
        />

        <form
          onSubmit={submit}
          className="flex flex-col gap-4"
        >
          {competitions.length > 0 && (
            <Field label="Competition">
              <Select
                value={choice}
                onChange={(event) =>
                  setChoice(event.target.value)
                }
              >
                <option value="">
                  Choose a competition…
                </option>

                {competitions.map((competition) => (
                  <option
                    key={competition.id}
                    value={competition.id}
                  >
                    {competition.name}
                  </option>
                ))}

                <option value={NEW}>
                  ＋ New competition…
                </option>
              </Select>
            </Field>
          )}

          {mode === NEW && (
            <Field label="New competition name">
              <Input
                placeholder="e.g. Dean's Cup"
                value={newName}
                onChange={(event) =>
                  setNewName(event.target.value)
                }
              />
            </Field>
          )}

          <Field label="Fixtures">
            <textarea
              rows={8}
              className="w-full rounded-lg border border-adm-line-strong bg-adm-raised px-3 py-2 font-mono text-xs text-adm-ink placeholder:text-adm-faint outline-none focus:border-adm-brand"
              placeholder={
                "Team A; Team B; 2026-09-26 17:00\nTeam C; Team D; 2026-09-26 19:30"
              }
              value={text}
              onChange={(event) =>
                setText(event.target.value)
              }
            />
          </Field>

          <div className="text-sm">
            <span className="text-adm-ok">
              {valid.length} valid
            </span>

            {errors.length > 0 && (
              <span className="text-adm-bad">
                {" "}
                · {errors.length} with problems
              </span>
            )}

            {tooMany && (
              <span className="text-adm-bad">
                {" "}
                · max {MAX_MATCHES} per import
              </span>
            )}
          </div>

          {errors.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-lg bg-adm-bad/10 p-3 text-xs text-adm-bad">
              {errors.slice(0, 5).map((item) => (
                <li key={item.line}>
                  Line {item.line}: {item.error}
                </li>
              ))}

              {errors.length > 5 && (
                <li>
                  …and {errors.length - 5} more
                </li>
              )}
            </ul>
          )}

          {valid.length > 0 && (
            <div className="flex flex-col gap-1 rounded-lg bg-adm-raised p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-adm-muted">
                Double-check these kickoff times (WAT)
                before importing
              </p>

              <ul className="flex flex-col gap-1 text-xs">
                {valid.map((match, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate text-adm-ink">
                      {match.homeTeam} v{" "}
                      {match.awayTeam}
                    </span>

                    <span className="shrink-0 font-medium text-adm-brand">
                      {formatWatPreview(
                        match.kickoffAt
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button
            type="submit"
            disabled={!canSubmit}
          >
            {busy
              ? "Importing…"
              : "Import " +
                valid.length +
                " fixture" +
                (valid.length === 1 ? "" : "s")}
          </Button>
        </form>
      </Card>

      <BulkOddsCard
        matches={matches}
        teamsById={teamsById}
        onSubmit={onGenerateOdds}
      />
    </div>
  );
      }
