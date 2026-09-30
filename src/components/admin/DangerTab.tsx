"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { Button, Card, CardHeader, Input, Modal } from "@/components/admin/ui";

const PHRASE = "RESET";

type Scope =
  | "external"
  | "funaab"
  | "manual"
  | "bets_tx"
  | "bets_wallets"
  | "financial_cutover"
  | "all"
  | "platform";

const OPTIONS: {
  scope: Scope;
  title: string;
  description: string;
  phrase: boolean;
}[] = [
  {
    scope: "financial_cutover",
    title: "Phase F — Financial cutover",
    description:
      "ZERO all wallets. Delete bets, transactions, ledger, deposits, withdrawals, promo redemptions. Reset WELCOME100. Keeps fixtures, teams, leagues, users.",
    phrase: true,
  },
  {
    scope: "external",
    title: "Clear external leagues",
    description:
      "Removes EPL, La Liga, Bundesliga, etc. fixtures, teams, markets and those competitions. FUNAABSU is kept.",
    phrase: false,
  },
  {
    scope: "funaab",
    title: "Clear FUNAAB",
    description:
      "Removes competitions whose name/id contains “FUNAAB”, plus their matches and markets. External leagues kept.",
    phrase: false,
  },
  {
    scope: "manual",
    title: "Clear manually created fixtures",
    description:
      "Removes matches with source manual or bulk_import that are not FUNAAB and not external. Competitions kept.",
    phrase: false,
  },
  {
    scope: "bets_tx",
    title: "Clear bets & transactions",
    description:
      "Deletes all user bets and wallet ledger entries. Fixtures and odds are kept. Wallet balances are NOT changed.",
    phrase: false,
  },
  {
    scope: "bets_wallets",
    title: "Clear bets, transactions & reset wallets",
    description:
      "Deletes all bets and transactions, and resets every wallet to ₦100,000 play balance. Prefer Phase F for real-money launch.",
    phrase: true,
  },
  {
    scope: "all",
    title: "Clear ALL data",
    description:
      "Deletes every match, team, competition, market, bet and transaction. Users/wallets kept.",
    phrase: true,
  },
  {
    scope: "platform",
    title: "PLATFORM RESET",
    description:
      "Same as Clear ALL, plus every wallet reset to ₦100,000 play balance. Cannot be undone.",
    phrase: true,
  },
];

export default function DangerTab() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openScope(s: Scope) {
    setScope(s);
    setTyped("");
    setResult(null);
    setError(null);
    setOpen(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setScope(null);
    setTyped("");
    setError(null);
  }

  async function handleReset() {
    if (!user || !scope) return;
    const opt = OPTIONS.find((o) => o.scope === scope);
    if (opt?.phrase && typed.trim() !== PHRASE) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/dev/reset", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Reset failed (" + res.status + ")");
      setResult(body.message ?? "Done");
      setOpen(false);
      setScope(null);
      setTyped("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  const active = OPTIONS.find((o) => o.scope === scope);
  const needsPhrase = Boolean(active?.phrase);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">Danger zone</h2>
      <p className="text-sm text-adm-muted">
        Choose a scoped reset. Prefer Phase F for real-money launch so you do
        not rebuild leagues from scratch.
      </p>

      {result && (
        <div className="rounded-lg bg-adm-ok/15 px-3 py-2 text-sm text-adm-ok">
          {result}
        </div>
      )}
      {error && !open && (
        <div className="rounded-lg bg-adm-bad/15 px-3 py-2 text-sm text-adm-bad">
          {error}
        </div>
      )}

      <div className="grid gap-3">
        {OPTIONS.map((opt) => (
          <Card
            key={opt.scope}
            className={opt.phrase ? "border-adm-bad/40" : "border-adm-line"}
          >
            <CardHeader title={opt.title} subtitle={opt.description} />
            <Button variant="danger" onClick={() => openScope(opt.scope)}>
              {opt.title}
            </Button>
          </Card>
        ))}
      </div>

      <Modal
        open={open}
        onClose={close}
        title={active ? "Confirm: " + active.title : "Confirm reset"}
      >
        <p className="mb-3 text-sm text-adm-muted">{active?.description}</p>
        {needsPhrase ? (
          <>
            <p className="mb-2 text-sm text-adm-muted">
              Type{" "}
              <span className="font-mono font-semibold text-adm-ink">
                {PHRASE}
              </span>{" "}
              to confirm.
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={PHRASE}
              autoCapitalize="characters"
              autoComplete="off"
              className="mb-5"
            />
          </>
        ) : (
          <p className="mb-5 text-sm text-adm-ink">
            This cannot be undone for the selected scope.
          </p>
        )}
        {error && <p className="mb-3 text-sm text-adm-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleReset}
            disabled={busy || (needsPhrase && typed.trim() !== PHRASE)}
          >
            {busy ? "Working…" : "Confirm"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
