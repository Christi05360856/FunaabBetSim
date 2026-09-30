"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase/client";
import { Button, Card, EmptyState, Input } from "./ui";

type Sponsor = {
  id: string;
  name: string;
  logoUrl: string | null;
  linkUrl: string | null;
  active: boolean;
  sortOrder: number;
};

const MAX_BYTES = 400_000; // ~400KB — stays under Firestore 1MB doc limit

export default function SponsorsTab() {
  const [items, setItems] = useState<Sponsor[]>([]);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/sponsors", {
      headers: { Authorization: "Bearer " + token },
    });
    const body = await res.json();
    if (res.ok) setItems(body.items ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsg("Please choose a PNG or JPG image");
      return;
    }
    if (file.size > MAX_BYTES) {
      setMsg("Image too large — use under ~400KB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result ?? "");
      if (data.length > 550_000) {
        setMsg("Encoded image too large — compress the logo");
        return;
      }
      setLogoUrl(data);
      setMsg("Logo ready — click Add sponsor");
    };
    reader.readAsDataURL(file);
  }

  async function create() {
    const user = auth.currentUser;
    if (!user) return;
    setBusy(true);
    setMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/sponsors", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          logoUrl: logoUrl || null,
          linkUrl: linkUrl || null,
          sortOrder: items.length,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setName("");
      setLogoUrl("");
      setLinkUrl("");
      setMsg("Sponsor added");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/admin/sponsors?id=" + encodeURIComponent(id), {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
    await load();
  }

  async function toggle(s: Sponsor) {
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/admin/sponsors", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: s.id, active: !s.active }),
    });
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">Sponsors</h2>
        <p className="text-sm text-adm-muted">
          Upload a PNG/JPG (under ~400KB) or paste an image URL. Shows on
          Support.
        </p>
      </div>

      {msg && <p className="rounded-lg bg-adm-card px-3 py-2 text-sm">{msg}</p>}

      <Card>
        <p className="mb-3 text-sm font-semibold">Add partner</p>
        <div className="grid gap-2">
          <Input
            placeholder="Brand name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="text-xs text-adm-muted">
            Upload logo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-1 block w-full text-sm"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {logoUrl.startsWith("data:") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Preview"
              className="h-16 w-16 rounded object-contain bg-adm-raised"
            />
          )}
          <Input
            placeholder="Or logo image URL"
            value={logoUrl.startsWith("data:") ? "" : logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
          <Input
            placeholder="Website link (optional)"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
        </div>
        <Button className="mt-3" disabled={busy} onClick={() => void create()}>
          {busy ? "…" : "Add sponsor"}
        </Button>
      </Card>

      {items.length === 0 ? (
        <EmptyState title="No sponsors" hint="Add one when you have a partner." />
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <Card key={s.id}>
              <div className="flex items-center gap-3">
                {s.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.logoUrl}
                    alt=""
                    className="h-10 w-10 rounded object-contain bg-adm-raised"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded bg-adm-raised text-xs font-bold">
                    {s.name.slice(0, 2)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-adm-muted">
                    {s.active ? "Visible" : "Hidden"}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void toggle(s)}>
                  {s.active ? "Hide" : "Show"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void remove(s.id)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
  }
