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
};

export default function PromosTab() {
  const [items, setItems] = useState<Promo[]>([]);
  const [code, setCode] = useState("");
  const [bonus, setBonus] = useState("100");
  const [maxR, setMaxR] = useState("100");
  const [minDep, setMinDep] = useState("200");
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
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setCode("");
      setMsg("Promo created — users enter this code on Buy points");
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">Promo codes</h2>
        <p className="text-sm text-adm-muted">
          Users enter the code when buying points. Bonus is promo points (wager
          only).
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
        <Button className="mt-3" disabled={busy} onClick={() => void create()}>
          {busy ? "…" : "Create promo"}
        </Button>
      </Card>

      {items.length === 0 ? (
        <EmptyState title="No promos" hint="Create WELCOME100 or a custom code." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-adm-border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-adm-card text-xs uppercase text-adm-muted">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Bonus</th>
                <th className="px-3 py-2">Used</th>
                <th className="px-3 py-2">Min dep</th>
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
                  <td className="px-3 py-2">₦{p.minDepositNgn}</td>
                  <td className="px-3 py-2">
                    {p.active ? "Active" : "Off"}
                  </td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="ghost" onClick={() => void toggle(p)}>
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
