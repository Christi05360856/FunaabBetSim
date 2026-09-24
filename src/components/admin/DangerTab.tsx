"use client";

import { useState } from "react";
import { Card, CardHeader, Button, ConfirmModal } from "./ui";

type PostResult = { ok: boolean; message: string };

export default function DangerTab({ onReset }: { onReset: () => Promise<PostResult> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleReset() {
    setBusy(true); await onReset(); setBusy(false); setOpen(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div><h2 className="text-xl font-bold text-red-400">Danger Zone</h2></div>
      <Card className="border-red-900/30">
        <CardHeader title="Reset Platform" subtitle="Delete all matches, teams, bets, and history" />
        <div className="rounded-lg bg-red-500/10 p-3 mb-4 text-sm text-red-300">This cannot be undone. All test data will be wiped.</div>
        <Button variant="danger" onClick={() => setOpen(true)}>Reset All Data</Button>
      </Card>
      <ConfirmModal open={open} onClose={() => setOpen(false)} onConfirm={handleReset} title="Confirm Reset" message="Type RESET to confirm" confirmLabel="Delete Everything" danger loading={busy} />
    </div>
  );
}

