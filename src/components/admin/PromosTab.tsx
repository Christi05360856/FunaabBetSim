"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase/client";
import { Button, Card, EmptyState, Input } from "./ui";

type Promo = {
  id: string;
  code: string;
  bonusPoints: number;
  minDepositNgn: number;
  maxRedemptions: number;
  redemptionCount: number;
  active: boolean;
  betRules?: {
    requiredLegs: number | null;
    minLegOdds: number | null;
    require1x2: boolean;
    terms: string | null;
  } | null;
};

export default function PromosTab() {
  const [items, setItems] = useState<Promo[]>([]);
  const [code, setCode] = useState("");
  const [bonus, setBonus] = useState("100");
  const [maxR, setMaxR] = useState("100");
  const [minDep, setMinDep] = useState("200");
  const [ruleMode, setRuleMode] = useState<"open" | "welcome" | "custom">(
    "open"
  );
  const [reqLegs, setReqLegs] = useState("");
  const [minOdds, setMinOdds] = useState("");
  const [require1x2, setRequire1x2] = useState(false);
  const [terms, setTerms] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/promotions", {
      headers: { Authorization: "Bearer " + token },
    });
    const body = await res.json();
    if (res.ok) setItems(body.items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const user = auth.currentUser;
    if (!user) return;
    setBusy(true);
    setMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          bonusPoints: Number(bonus),
          maxRedemptions: Number(maxR),
          minDepositNgn: Number(minDep),
          ruleMode,
          requiredLegs: reqLegs,
          minLegOdds: minOdds,
          require1x2,
          terms,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setCode("");
      setMsg("Promo created — enter code on Buy points");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p: Promo) {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/admin/promotions", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: p.code, active: !p.active }),
    });
    await load();
  }

  function rulesLabel(p: Promo): string {
    const r = p.betRules;
    if (!r) return p.code === "WELCOME100" ? "5×1X2 ≥2.00" : "Open";
    if (r.requiredLegs == null && r.minLegOdds == null && !r.require1x2)
      return "Open (any bet)";
    const bits: string[] = [];
    if (r.requiredLegs != null) bits.push(`${r.requiredLegs} legs`);
    if (r.minLegOdds != null) bits.push(`odds ≥${r.minLegOdds}`);
    if (r.require1x2) bits.push("1X2 only");
    return bits.join(" · ") || "Custom";
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">Promo codes</h2>
        <p className="text-sm text-adm-muted">
          Bonus credits go to promo balance. Set betting rules per code.
        </p>
      </div>

      {msg && <p className="rounded-lg bg-adm-card px-3 py-2 text-sm">{msg}</p>}

      <Card>
        <p className="mb-3 text-sm font-semibold">Create code</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="CODE e.g. LAUNCH50"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Input
            placeholder="Bonus points"
            value={bonus}
            onChange={(e) => setBonus(e.target.value.replace(/\D/g, ""))}
          />
          <Input
            placeholder="Max redemptions"
            value={maxR}
            onChange={(e) => setMaxR(e.target.value.replace(/\D/g, ""))}
          />
          <Input
            placeholder="Min deposit ₦"
            value={minDep}
            onChange={(e) => setMinDep(e.target.value.replace(/\D/g, ""))}
          />
        </div>

        <p className="mb-1 mt-3 text-xs font-semibold text-adm-muted">
          Betting rules for this promo
        </p>
        <select
          value={ruleMode}
          onChange={(e) =>
            setRuleMode(e.target.value as "open" | "welcome" | "custom")
          }
          className="mb-2 w-full rounded-lg border border-adm-border bg-adm-card px-3 py-2 text-sm"
        >
          <option value="open">Open — any bet (no constraints)</option>
          <option value="welcome">Strict — 5 × 1X2, each odds ≥ 2.00</option>
          <option value="custom">Custom</option>
        </select>

        {ruleMode === "custom" && (
          <div className="mb-2 grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Required legs (blank = any)"
              value={reqLegs}
              onChange={(e) => setReqLegs(e.target.value.replace(/\D/g, ""))}
            />
            <Input
              placeholder="Min odds per leg (blank = none)"
              value={minOdds}
              onChange={(e) => setMinOdds(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={require1x2}
                onChange={(e) => setRequire1x2(e.target.checked)}
              />
              1X2 markets only
            </label>
            <Input
              placeholder="Terms (shown to user)"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </div>
        )}

        <Button className="mt-2" disabled={busy} onClick={() => void create()}>
          {busy ? "…" : "Create promo"}
        </Button>
      </Card>

      {items.length === 0 ? (
        <EmptyState title="No promos" hint="Create a code to get started." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-adm-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-adm-card text-xs uppercase text-adm-muted">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Bonus</th>
                <th className="px-3 py-2">Used</th>
                <th className="px-3 py-2">Rules</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-adm-border">
                  <td className="px-3 py-2 font-mono font-bold">{p.code}</td>
                  <td className="px-3 py-2">₦{p.bonusPoints}</td>
                  <td className="px-3 py-2">
                    {p.redemptionCount}/{p.maxRedemptions}
                  </td>
                  <td className="px-3 py-2 text-xs">{rulesLabel(p)}</td>
                  <td className="px-3 py-2">{p.active ? "Active" : "Off"}</td>
                  <td className="px-3 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void toggle(p)}
                    >
                      {p.active ? "Disable" : "Enable"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
      }
