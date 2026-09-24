"use client";

import { useState, type FormEvent } from "react";
import { Card, CardHeader, Button, Input } from "./ui";

type PostResult = { ok: boolean; message: string };

export default function ImportTab({ onSubmit }: { onSubmit: (b: unknown) => Promise<PostResult> }) {
  const [comp, setComp] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const parsed = lines.map((line) => {
    const parts = line.split(";").map((p) => p.trim());
    if (parts.length !== 3) return { line, error: "Need 3 parts" };
    const [h, a, d] = parts;
    const t = new Date(d!.replace(" ", "T")).getTime();
    if (!h || !a || isNaN(t)) return { line, error: "Invalid" };
    return { homeTeam: h, awayTeam: a, kickoffAt: t };
  });
  const valid = parsed.filter((p): p is { homeTeam: string; awayTeam: string; kickoffAt: number } => !("error" in p));

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const r = await onSubmit({ competitionName: comp, matches: valid });
    if (r.ok) setText(""); setBusy(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div><h2 className="text-xl font-bold">Bulk Import</h2><p className="mt-1 text-sm text-zinc-500">Format: Home; Away; YYYY-MM-DD HH:mm</p></div>
      <Card>
        <CardHeader title="Import Fixtures" />
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input placeholder="Competition name" value={comp} onChange={(e) => setComp(e.target.value)} />
          <textarea rows={8} className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 font-mono text-xs" placeholder="Team A; Team B; 2026-09-26 15:00" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="text-sm text-zinc-400">{valid.length} valid matches</div>
          <Button type="submit" disabled={busy || !comp || valid.length === 0}>{busy ? "Importing…" : `Import ${valid.length}`}</Button>
        </form>
      </Card>
    </div>
  );
}

