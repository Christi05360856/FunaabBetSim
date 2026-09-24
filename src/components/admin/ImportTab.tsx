"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { Competition } from "@/types/domain";
import { Card, CardHeader, Button, Input, Select, Field } from "./ui";

type PostResult = { ok: boolean; message: string };
type ParsedMatch = { homeTeam: string; awayTeam: string; kickoffAt: number };
type ParsedLine = { line: number; match?: ParsedMatch; error?: string };

const NEW = "__new__";
const MAX_MATCHES = 200; // server limit
const DATE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

function parseLine(raw: string, line: number): ParsedLine {
  const parts = raw.split(";").map((p) => p.trim());
  if (parts.length !== 3) return { line, error: "Use: Home; Away; YYYY-MM-DD HH:mm" };
  const [home, away, date] = parts as [string, string, string];
  if (!home || !away) return { line, error: "Both team names are required" };
  if (home.toLowerCase() === away.toLowerCase()) return { line, error: "A team can't play itself" };
  if (!DATE_RE.test(date)) return { line, error: "Date must look like 2026-09-26 15:00" };
  const kickoffAt = new Date(date.replace(" ", "T")).getTime();
  if (Number.isNaN(kickoffAt)) return { line, error: "That date doesn't exist" };
  return { line, match: { homeTeam: home, awayTeam: away, kickoffAt } };
}

export default function ImportTab({ competitions, onSubmit }: { competitions: Competition[]; onSubmit: (b: unknown) => Promise<PostResult> }) {
  const [choice, setChoice] = useState(""); // "" | competition id | NEW
  const [newName, setNewName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  // No competitions yet → go straight to "new".
  const mode = competitions.length === 0 ? NEW : choice;
  const competitionName = mode === NEW ? newName.trim() : competitions.find((c) => c.id === mode)?.name ?? "";

  const { valid, errors } = useMemo(() => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed = lines.map((l, i) => parseLine(l, i + 1));
    return {
      valid: parsed.flatMap((p) => (p.match ? [p.match] : [])),
      errors: parsed.filter((p) => p.error),
    };
  }, [text]);

  const tooMany = valid.length > MAX_MATCHES;
  const canSubmit = !busy && competitionName.length >= 2 && valid.length > 0 && !tooMany;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    const r = await onSubmit({ competitionName, matches: valid });
    if (r.ok) setText("");
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">Bulk import</h2>
        <p className="mt-1 text-sm text-adm-muted">One fixture per line: Home; Away; YYYY-MM-DD HH:mm</p>
      </div>
      <Card>
        <CardHeader title="Import fixtures" subtitle="Teams that don't exist yet are created automatically." />
        <form onSubmit={submit} className="flex flex-col gap-4">
          {competitions.length > 0 && (
            <Field label="Competition">
              <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">Choose a competition…</option>
                {competitions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value={NEW}>＋ New competition…</option>
              </Select>
            </Field>
          )}
          {mode === NEW && (
            <Field label="New competition name">
              <Input placeholder="e.g. Dean's Cup" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
          )}
          <Field label="Fixtures">
            <textarea
              rows={8}
              className="w-full rounded-lg border border-adm-line-strong bg-adm-raised px-3 py-2 font-mono text-xs text-adm-ink placeholder:text-adm-faint outline-none focus:border-adm-brand"
              placeholder="Team A; Team B; 2026-09-26 15:00"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>

          <div className="text-sm">
            <span className="text-adm-ok">{valid.length} valid</span>
            {errors.length > 0 && <span className="text-adm-bad"> · {errors.length} with problems</span>}
            {tooMany && <span className="text-adm-bad"> · max {MAX_MATCHES} per import</span>}
          </div>

          {errors.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-lg bg-adm-bad/10 p-3 text-xs text-adm-bad">
              {errors.slice(0, 5).map((p) => <li key={p.line}>Line {p.line}: {p.error}</li>)}
              {errors.length > 5 && <li>…and {errors.length - 5} more</li>}
            </ul>
          )}

          <Button type="submit" disabled={!canSubmit}>{busy ? "Importing…" : `Import ${valid.length} fixture${valid.length === 1 ? "" : "s"}`}</Button>
        </form>
      </Card>
    </div>
  );
}

