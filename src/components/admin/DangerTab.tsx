"use client";

import { useState } from "react";
import { Card, CardHeader, Button, Input, Modal } from "./ui";

type PostResult = { ok: boolean; message: string };

const PHRASE = "RESET";

export default function DangerTab({ onReset }: { onReset: () => Promise<PostResult> }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    setOpen(false);
    setTyped("");
  }

  async function handleReset() {
    if (typed.trim() !== PHRASE) return;
    setBusy(true);
    const r = await onReset();
    setBusy(false);
    if (r.ok) { setOpen(false); setTyped(""); }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-bold text-adm-bad">Danger zone</h2>
      <Card className="border-adm-bad/30">
        <CardHeader title="Reset platform" subtitle="Wipes all test data" />
        <div className="mb-4 rounded-lg bg-adm-bad/10 p-3 text-sm text-adm-bad">
          Deletes every match, team, competition, market, bet and transaction. This cannot be undone.
          User accounts and wallet balances are not touched.
        </div>
        <Button variant="danger" onClick={() => setOpen(true)}>Reset all data</Button>
      </Card>

      <Modal open={open} onClose={close} title="Confirm reset">
        <p className="mb-4 text-sm text-adm-muted">Type <span className="font-mono font-semibold text-adm-ink">{PHRASE}</span> to confirm.</p>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={PHRASE} autoCapitalize="characters" autoComplete="off" className="mb-5" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button variant="danger" onClick={handleReset} disabled={busy || typed.trim() !== PHRASE}>{busy ? "Deleting…" : "Delete everything"}</Button>
        </div>
      </Modal>
    </div>
  );
}

