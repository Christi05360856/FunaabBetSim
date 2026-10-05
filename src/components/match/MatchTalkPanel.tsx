"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";

type ChatMsg = {
  id: string;
  mask: string;
  text: string;
  createdAt: number;
};

type PredictStats = { home: number; draw: number; away: number };
type PickSide = "home" | "draw" | "away";

const GUIDELINES_KEY = "funaab_chat_guidelines_ok";
const POLL_MS = 40_000;

export default function MatchTalkPanel({
  matchId,
  homeName,
  awayName,
}: {
  matchId: string;
  homeName: string;
  awayName: string;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [chatErr, setChatErr] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [guidelinesOk, setGuidelinesOk] = useState(true);

  const [stats, setStats] = useState<PredictStats>({ home: 0, draw: 0, away: 0 });
  const [myPick, setMyPick] = useState<PickSide | null>(null);
  const [locked, setLocked] = useState(false);
  const [predErr, setPredErr] = useState<string | null>(null);
  const [predBusy, setPredBusy] = useState(false);

  const visibleRef = useRef(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setGuidelinesOk(localStorage.getItem(GUIDELINES_KEY) === "1");
    } catch {
      setGuidelinesOk(false);
    }
  }, []);

  const loadChat = useCallback(async () => {
    if (!user) return;
    setChatLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/chat`, {
        headers: { Authorization: "Bearer " + token },
      });
      const body = await res.json();
      if (res.ok) setMessages(body.messages ?? []);
    } catch {
      /* ignore */
    } finally {
      setChatLoading(false);
    }
  }, [user, matchId]);

  const loadPredict = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/matches/${encodeURIComponent(matchId)}/predict`,
        { headers: { Authorization: "Bearer " + token } }
      );
      const body = await res.json();
      if (res.ok) {
        setStats(body.stats ?? { home: 0, draw: 0, away: 0 });
        setMyPick(body.myPick ?? null);
        setLocked(Boolean(body.locked));
      }
    } catch {
      /* ignore */
    }
  }, [user, matchId]);

  // Initial load + poll only while tab visible
  useEffect(() => {
    if (!user) return;
    void loadChat();
    void loadPredict();

    function onVis() {
      visibleRef.current = document.visibilityState === "visible";
    }
    document.addEventListener("visibilitychange", onVis);

    const id = setInterval(() => {
      if (visibleRef.current) void loadChat();
    }, POLL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(id);
    };
  }, [user, loadChat, loadPredict]);

  async function send() {
    if (!user || !text.trim()) return;
    setChatErr(null);
    setChatBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/chat`, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: text.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not send");
      setText("");
      setMessages((prev) => [...prev, body.message as ChatMsg].slice(-45));
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      });
    } catch (e) {
      setChatErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setChatBusy(false);
    }
  }

  async function vote(pick: PickSide) {
    if (!user || locked || myPick || predBusy) return;
    setPredErr(null);
    setPredBusy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/matches/${encodeURIComponent(matchId)}/predict`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pick }),
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not vote");
      setStats(body.stats);
      setMyPick(body.myPick);
    } catch (e) {
      setPredErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setPredBusy(false);
    }
  }

  function acceptGuidelines() {
    try {
      localStorage.setItem(GUIDELINES_KEY, "1");
    } catch {
      /* ignore */
    }
    setGuidelinesOk(true);
  }

  const total = stats.home + stats.draw + stats.away;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  if (!user) {
    return (
      <section
        id="match-chat-panel"
        className="mx-4 mt-3 rounded-2xl border border-ink-muted/10 bg-surface p-4 shadow-card"
      >
        <p className="text-sm font-semibold text-ink">Match talk</p>
        <p className="mt-1 text-xs text-ink-muted">
          Sign in to chat and vote on the result.
        </p>
        <Link
          href="/login"
          className="mt-3 inline-block text-sm font-semibold text-brand"
        >
          Sign in →
        </Link>
      </section>
    );
  }

  return (
    <section id="match-chat-panel" className="mx-4 mt-3 space-y-3">
      {/* —— Community 1X2 —— */}
      <div className="rounded-2xl border border-ink-muted/10 bg-surface p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Who wins?</p>
          <p className="text-[11px] text-ink-muted">
            {locked ? "Voting closed" : "One vote · pre-match"}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { key: "home" as const, label: homeName || "Home" },
              { key: "draw" as const, label: "Draw" },
              { key: "away" as const, label: awayName || "Away" },
            ] as const
          ).map((opt) => {
            const selected = myPick === opt.key;
            const disabled = locked || Boolean(myPick) || predBusy;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={disabled && !selected}
                onClick={() => void vote(opt.key)}
                className={
                  "rounded-xl px-2 py-2.5 text-center transition-colors " +
                  (selected
                    ? "bg-brand text-white"
                    : disabled
                      ? "bg-ink-muted/10 text-ink-muted"
                      : "bg-brand/10 text-ink active:bg-brand/20")
                }
              >
                <span className="line-clamp-1 text-[11px] font-medium opacity-80">
                  {opt.label}
                </span>
                <span className="mt-0.5 block font-display text-sm font-bold tabular-nums">
                  {pct(stats[opt.key])}%
                </span>
              </button>
            );
          })}
        </div>
        {total > 0 && (
          <p className="mt-2 text-center text-[10px] text-ink-muted">
            {total.toLocaleString("en-NG")} vote{total === 1 ? "" : "s"}
          </p>
        )}
        {predErr && (
          <p className="mt-2 text-xs text-loss" role="alert">
            {predErr}
          </p>
        )}
      </div>

      {/* —— Chat —— */}
      <div className="overflow-hidden rounded-2xl border border-ink-muted/10 bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-ink-muted/10 px-4 py-2.5">
          <p className="text-sm font-semibold text-ink">Match chat</p>
          <button
            type="button"
            onClick={() => void loadChat()}
            className="text-[11px] font-semibold text-brand"
          >
            Refresh
          </button>
        </div>

        {!guidelinesOk && (
          <div className="border-b border-ink-muted/10 bg-ink-muted/5 px-4 py-3 text-xs text-ink">
            <p className="font-semibold">Chat rules</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-ink-muted">
              <li>Tips and booking codes welcome — no spam</li>
              <li>No insults, scams, or personal data</li>
              <li>Do not share any of your personal information</li>
            </ul>
            <button
              type="button"
              onClick={acceptGuidelines}
              className="mt-3 w-full rounded-xl bg-brand py-2 text-sm font-semibold text-white"
            >
              Got it
            </button>
          </div>
        )}

        {guidelinesOk && (
          <>
            <div
              ref={listRef}
              className="max-h-56 space-y-2.5 overflow-y-auto px-4 py-3"
            >
              {chatLoading && messages.length === 0 && (
                <p className="text-center text-xs text-ink-muted">Loading…</p>
              )}
              {!chatLoading && messages.length === 0 && (
                <p className="text-center text-xs text-ink-muted">
                  No messages yet — start the talk.
                </p>
              )}
              {messages.map((m) => (
                <div key={m.id} className="text-sm">
                  <p className="text-[11px] font-semibold text-brand">{m.mask}</p>
                  <p className="text-ink">{m.text}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-ink-muted/10 p-3">
              {chatErr && (
                <p className="mb-2 text-xs text-loss" role="alert">
                  {chatErr}
                </p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={160}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void send();
                  }}
                  placeholder="Tip, code, or score prediction…"
                  className="min-w-0 flex-1 rounded-xl border border-ink-muted/15 bg-bg px-3 py-2.5 text-sm"
                />
                <button
                  type="button"
                  disabled={chatBusy || !text.trim()}
                  onClick={() => void send()}
                  className="rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-45"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
