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

const WELCOME: ChatMsg = {
  id: "welcome",
  mask: "FUNAAB BetSim",
  text: "Welcome to chat section. Share tips and booking codes — keep it respectful.",
  createdAt: 0,
};

export default function MatchTalkPanel({
  matchId,
  homeName,
  awayName,
  open,
  onClose,
  preMatch,
}: {
  matchId: string;
  homeName: string;
  awayName: string;
  open: boolean;
  onClose: () => void;
  /** true when kickoff not reached and not live/finished */
  preMatch: boolean;
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [chatErr, setChatErr] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);

  const [showGuidelines, setShowGuidelines] = useState(false);
  const [guidelinesReady, setGuidelinesReady] = useState(false);

  const [stats, setStats] = useState<PredictStats>({ home: 0, draw: 0, away: 0 });
  const [myPick, setMyPick] = useState<PickSide | null>(null);
  const [voteLocked, setVoteLocked] = useState(false);
  const [predErr, setPredErr] = useState<string | null>(null);
  const [predBusy, setPredBusy] = useState(false);

  const visibleRef = useRef(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    try {
      const ok = localStorage.getItem(GUIDELINES_KEY) === "1";
      setShowGuidelines(!ok);
      setGuidelinesReady(true);
    } catch {
      setShowGuidelines(true);
      setGuidelinesReady(true);
    }
  }, [open]);

  const loadChat = useCallback(async () => {
    if (!user || !open) return;
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
  }, [user, matchId, open]);

  const loadPredict = useCallback(async () => {
    if (!user || !open || !preMatch) return;
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
        setVoteLocked(Boolean(body.locked));
      }
    } catch {
      /* ignore */
    }
  }, [user, matchId, open, preMatch]);

  useEffect(() => {
    if (!open || !user) return;
    void loadChat();
    void loadPredict();

    function onVis() {
      visibleRef.current = document.visibilityState === "visible";
    }
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(() => {
      if (visibleRef.current && open) void loadChat();
    }, POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(id);
    };
  }, [open, user, loadChat, loadPredict]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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
    if (!user || voteLocked || myPick || predBusy || !preMatch) return;
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
    setShowGuidelines(false);
  }

  const displayMessages =
    messages.length === 0 ? [WELCOME] : [WELCOME, ...messages];

  const total = stats.home + stats.draw + stats.away;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  if (!open) return null;

  const shellLive = !preMatch;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col">
      {/* Dim backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close chat"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={
          "relative z-[81] mt-auto flex max-h-[92vh] min-h-[70vh] w-full flex-col rounded-t-2xl shadow-2xl " +
          (shellLive ? "bg-[#1a1d23] text-white" : "bg-bg text-ink")
        }
      >
        {/* Header */}
        <div
          className={
            "flex items-center gap-2 border-b px-3 py-3 " +
            (shellLive ? "border-white/10" : "border-ink-muted/10")
          }
        >
          <button
            type="button"
            onClick={onClose}
            className={
              "flex h-9 w-9 items-center justify-center rounded-full " +
              (shellLive ? "active:bg-white/10" : "active:bg-ink-muted/10")
            }
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {homeName} vs {awayName}
            </p>
            <p
              className={
                "text-[11px] " + (shellLive ? "text-white/50" : "text-ink-muted")
              }
            >
              {preMatch ? "Pre-match chat" : "Live chat"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowGuidelines(true)}
            className={
              "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold " +
              (shellLive ? "text-white/70 active:bg-white/10" : "text-ink-muted active:bg-ink-muted/10")
            }
            aria-label="Chat guidelines"
          >
            i
          </button>
        </div>

        {!user ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
            <p className="text-center text-sm opacity-80">
              Sign in to join the conversation.
            </p>
            <Link
              href="/login"
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <>
            {/* Pre-match prediction — Sporty-style circles */}
            {preMatch && !myPick && (
              <div
                className={
                  "border-b px-4 py-4 " +
                  (shellLive ? "border-white/10" : "border-ink-muted/10")
                }
              >
                <p
                  className={
                    "mb-4 text-center text-sm font-medium " +
                    (shellLive ? "text-white/70" : "text-ink-muted")
                  }
                >
                  User result prediction
                </p>
                <div className="relative mx-auto flex max-w-sm items-center justify-between px-2">
                  {/* connector line */}
                  <div
                    className={
                      "absolute left-8 right-8 top-1/2 h-px -translate-y-1/2 " +
                      (shellLive ? "bg-white/20" : "bg-ink-muted/25")
                    }
                  />
                  {(
                    [
                      { key: "home" as const, label: "Home", sub: homeName },
                      { key: "draw" as const, label: "Draw", sub: "Draw" },
                      { key: "away" as const, label: "Away", sub: awayName },
                    ] as const
                  ).map((opt) => {
                    const selected = myPick === opt.key;
                    const canTap = !voteLocked && !myPick && !predBusy;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        disabled={!canTap && !selected}
                        onClick={() => void vote(opt.key)}
                        className="relative z-[1] flex w-[4.5rem] flex-col items-center gap-1.5"
                      >
                        <span
                          className={
                            "flex h-14 w-14 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors " +
                            (selected
                              ? "border-brand bg-brand text-white"
                              : shellLive
                                ? "border-white/30 bg-[#1a1d23] text-white"
                                : "border-ink-muted/30 bg-bg text-ink")
                          }
                        >
                          {selected ? "✓" : opt.label}
                        </span>
                        <span
                          className={
                            "line-clamp-1 max-w-full text-[10px] " +
                            (selected
                              ? "font-semibold text-brand"
                              : shellLive
                                ? "text-white/50"
                                : "text-ink-muted")
                          }
                        >
                          {opt.key === "draw" ? "Draw" : opt.sub}
                        </span>
                        {total > 0 && (
                          <span
                            className={
                              "text-[10px] tabular-nums " +
                              (shellLive ? "text-white/40" : "text-ink-muted")
                            }
                          >
                            {pct(stats[opt.key])}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {myPick && (
                  <p
                    className={
                      "mt-3 text-center text-[11px] " +
                      (shellLive ? "text-white/50" : "text-ink-muted")
                    }
                  >
                    Your pick is locked
                    {total > 0 ? ` · ${total} vote${total === 1 ? "" : "s"}` : ""}
                  </p>
                )}
                {predErr && (
                  <p className="mt-2 text-center text-xs text-loss">{predErr}</p>
                )}
              </div>
            )}

            {/* Messages */}
            <div
              ref={listRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
            >
              {chatLoading && messages.length === 0 && (
                <p
                  className={
                    "text-center text-xs " +
                    (shellLive ? "text-white/40" : "text-ink-muted")
                  }
                >
                  Loading…
                </p>
              )}
              {displayMessages.map((m) => (
                <div key={m.id} className="flex gap-2">
                  <div
                    className={
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
                      (m.id === "welcome"
                        ? "bg-brand text-white"
                        : shellLive
                          ? "bg-white/10 text-white/80"
                          : "bg-ink-muted/15 text-ink-muted")
                    }
                  >
                    {m.id === "welcome" ? "F" : m.mask.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        "text-[11px] font-semibold " +
                        (m.id === "welcome"
                          ? "text-brand"
                          : shellLive
                            ? "text-white/55"
                            : "text-ink-muted")
                      }
                    >
                      {m.mask}
                    </p>
                    <div
                      className={
                        "mt-0.5 inline-block max-w-[95%] rounded-2xl rounded-tl-md px-3 py-2 text-sm leading-snug " +
                        (shellLive
                          ? "bg-white/10 text-white"
                          : "bg-ink-muted/10 text-ink")
                      }
                    >
                      {m.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Composer */}
            <div
              className={
                "border-t px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] " +
                (shellLive ? "border-white/10" : "border-ink-muted/10")
              }
            >
              {chatErr && (
                <p className="mb-1 text-xs text-loss">{chatErr}</p>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={160}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void send();
                  }}
                  placeholder="Write a comment…"
                  className={
                    "min-w-0 flex-1 rounded-full border px-4 py-2.5 text-sm outline-none " +
                    (shellLive
                      ? "border-white/15 bg-white/10 text-white placeholder:text-white/40"
                      : "border-ink-muted/15 bg-surface text-ink placeholder:text-ink-muted")
                  }
                />
                <button
                  type="button"
                  disabled={chatBusy || !text.trim()}
                  onClick={() => void send()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40"
                  aria-label="Send"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Guidelines modal */}
      {guidelinesReady && showGuidelines && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/55 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center text-ink shadow-xl">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl">
              ⚠️
            </div>
            <p className="text-lg font-bold">Chat guidelines</p>
            <ul className="mt-3 space-y-2 text-left text-sm text-ink-muted">
              <li>• Share tips and support others</li>
              <li>• Keep messages relevant — no spam</li>
              <li>• No insults or hate speech</li>
              <li>• Never share passwords or bank details</li>
            </ul>
            <button
              type="button"
              onClick={acceptGuidelines}
              className="mt-5 w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
    }

              
