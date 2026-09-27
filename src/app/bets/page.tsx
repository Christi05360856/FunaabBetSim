"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/lib/auth/AuthContext";
import { db } from "@/lib/firebase/client";
import type { Bet, Match, Team } from "@/types/domain";

export default function MyBetsPage() {
  const { user, loading } = useAuth();
  const [bets, setBets] = useState<Bet[]>([]);
  const [matches, setMatches] = useState<Record<string, Match>>({});
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [activeTab, setActiveTab] = useState<"open" | "settled">("open");
  const [activeMenuBetId, setActiveMenuBetId] = useState<string | null>(null);
  
  // State for the digital share modal
  const [sharingBet, setSharingBet] = useState<Bet | null>(null);
  // State for controlling the printable ticket render
  const [printingBet, setPrintingBet] = useState<Bet | null>(null);

  useEffect(() => {
    if (!user) return;

    // Fetch user bets
    const q = query(collection(db, "bets"), where("userId", "==", user.uid));
    const unsubscribeBets = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((doc) => doc.data() as Bet);
      setBets(docs);
    });

    // Fetch matches map for names
    const unsubscribeMatches = onSnapshot(collection(db, "matches"), (snapshot) => {
      const matchMap: Record<string, Match> = {};
      snapshot.docs.forEach((doc) => {
        matchMap[doc.id] = doc.data() as Match;
      });
      setMatches(matchMap);
    });

    // Fetch teams map
    const unsubscribeTeams = onSnapshot(collection(db, "teams"), (snapshot) => {
      const teamMap: Record<string, Team> = {};
      snapshot.docs.forEach((doc) => {
        teamMap[doc.id] = doc.data() as Team;
      });
      setTeams(teamMap);
    });

    return () => {
      unsubscribeBets();
      unsubscribeMatches();
      unsubscribeTeams();
    };
  }, [user]);

  async function handleHideBet(betId: string) {
    try {
      if (!user) return;
      const idToken = await user.getIdToken();
      await fetch("/api/bets/hide", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ betId }),
      });
      setActiveMenuBetId(null);
    } catch (err) {
      console.error("Failed to hide bet", err);
    }
  }

  function handleTriggerPrint(bet: Bet) {
    setPrintingBet(bet);
    setActiveMenuBetId(null);
    setTimeout(() => {
      window.print();
    }, 150);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 text-center bg-gray-50 dark:bg-gray-900">
        <p className="text-lg font-bold text-gray-800 dark:text-gray-100">Please sign in to view your bets</p>
        <Link href="/login" className="mt-3 text-sm font-semibold text-emerald-600 hover:underline">
          Go to Login
        </Link>
      </main>
    );
  }

  const visibleBets = bets.filter((b) => !b.hidden);
  const openBets = visibleBets.filter((b) => b.status === "open");
  const settledBets = visibleBets.filter((b) => b.status !== "open");
  const currentList = activeTab === "open" ? openBets : settledBets;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 pb-20">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <h1 className="text-lg font-bold">My Bets</h1>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <button
          onClick={() => setActiveTab("open")}
          className={`flex-1 py-3 text-center text-sm font-semibold border-b-2 transition ${
            activeTab === "open"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
          }`}
        >
          Open ({openBets.length})
        </button>
        <button
          onClick={() => setActiveTab("settled")}
          className={`flex-1 py-3 text-center text-sm font-semibold border-b-2 transition ${
            activeTab === "settled"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"
          }`}
        >
          Settled ({settledBets.length})
        </button>
      </div>

      {/* List */}
      <main className="p-4 max-w-lg mx-auto flex flex-col gap-3">
        {currentList.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
            No {activeTab} bets found.
          </div>
        ) : (
          currentList.map((bet) => {
            const match = matches[bet.matchId];
            const homeName = match ? teams[match.homeTeamId]?.name ?? "Home Team" : "Home Team";
            const awayName = match ? teams[match.awayTeamId]?.name ?? "Away Team" : "Away Team";

            return (
              <div
                key={bet.id}
                className="relative rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm"
              >
                {/* Header row */}
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2 mb-2 text-xs">
                  <span className="font-mono text-gray-500">ID: {bet.id.slice(0, 8)}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                        bet.status === "won"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : bet.status === "lost"
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }`}
                    >
                      {bet.status}
                    </span>
                    <button
                      onClick={() => setActiveMenuBetId(activeMenuBetId === bet.id ? null : bet.id)}
                      className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 text-base"
                    >
                      ⋮
                    </button>
                  </div>
                </div>

                {/* Match details */}
                <div className="mb-3">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {homeName} vs {awayName}
                  </p>
                  <p className="text-xs text-gray-500 capitalize mt-0.5">
                    {bet.marketType.replace("_", " ")}: <strong className="text-gray-800 dark:text-gray-200">{bet.outcome}</strong>
                  </p>
                </div>

                {/* Bottom values */}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-100 dark:border-gray-800">
                  <div>
                    <span className="text-gray-500 block text-[10px]">Odds</span>
                    <span className="font-bold">{bet.odds.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[10px]">Stake</span>
                    <span className="font-semibold">₦{bet.stake.toLocaleString()}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-500 block text-[10px]">Return</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      ₦{(bet.stake * bet.odds).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Dropdown Action Menu */}
                {activeMenuBetId === bet.id && (
                  <div className="absolute right-4 top-10 z-20 w-44 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl py-1 text-xs">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(bet.id);
                        alert("Bet ID copied to clipboard!");
                        setActiveMenuBetId(null);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
                    >
                      📋 Copy number
                    </button>
                    <button
                      onClick={() => handleTriggerPrint(bet)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
                    >
                      🖨️ Print / Save as PDF
                    </button>
                    <button
                      onClick={() => {
                        setSharingBet(bet);
                        setActiveMenuBetId(null);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
                    >
                      🔗 Share
                    </button>
                    <button
                      onClick={() => handleHideBet(bet.id)}
                      className="w-full px-4 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 flex items-center gap-2"
                    >
                      🙈 Hide bet
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </main>

      {/* DIGITAL SHARE MODAL (PariPesa Digital Style) */}
      {sharingBet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-[#0e1e38] text-white shadow-2xl border border-blue-900/40">
            {/* Header Banner */}
            <div className="relative bg-gradient-to-r from-blue-900 to-indigo-950 p-5 text-center border-b border-blue-800/50">
              <button
                onClick={() => setSharingBet(null)}
                className="absolute right-4 top-4 text-gray-300 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
              <h2 className="text-xl font-black tracking-wider text-amber-400 uppercase">FUNAAB BetSim</h2>
              <p className="text-xs text-blue-200 mt-1 font-mono">Bet slip ID: {sharingBet.id.slice(0, 12).toUpperCase()}</p>
              <p className="text-[11px] text-blue-300/80">
                Single Bet • {new Date(sharingBet.createdAt).toLocaleString("en-GB")}
              </p>
            </div>

            {/* Main Summary Card */}
            <div className="p-4">
              <div className="rounded-xl bg-[#172a4a] p-4 text-center border border-blue-800/40 mb-4 shadow-inner">
                <div className="grid grid-cols-2 gap-2 text-xs mb-2 pb-2 border-b border-blue-800/30">
                  <div>
                    <span className="text-blue-300 block text-[10px] uppercase tracking-wider">Status</span>
                    <strong className={`uppercase text-sm ${sharingBet.status === "won" ? "text-emerald-400" : sharingBet.status === "lost" ? "text-rose-400" : "text-amber-300"}`}>
                      {sharingBet.status === "won" ? "Paid Out" : sharingBet.status}
                    </strong>
                  </div>
                  <div>
                    <span className="text-blue-300 block text-[10px] uppercase tracking-wider">Odds</span>
                    <strong className="text-sm text-white">{sharingBet.odds.toFixed(2)}</strong>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-blue-300 block text-[10px] uppercase tracking-wider">Stake</span>
                    <span className="font-semibold text-white">₦{sharingBet.stake.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-blue-300 block text-[10px] uppercase tracking-wider">Potential Return</span>
                    <span className="font-semibold text-emerald-400">₦{(sharingBet.stake * sharingBet.odds).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Match Card */}
              <div className="rounded-xl bg-white text-black p-3 text-xs shadow-md">
                <div className="flex justify-between items-center text-[10px] font-bold text-blue-700 uppercase mb-1">
                  <span>Football</span>
                  <span>{matches[sharingBet.matchId] ? new Date(matches[sharingBet.matchId].kickoffAt).toLocaleDateString("en-GB") : ""}</span>
                </div>
                <p className="font-bold text-sm text-gray-900">
                  {matches[sharingBet.matchId]
                    ? `${teams[matches[sharingBet.matchId].homeTeamId]?.name ?? "Home"} vs ${teams[matches[sharingBet.matchId].awayTeamId]?.name ?? "Away"}`
                    : "Match Event"}
                </p>
                <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between items-center font-semibold">
                  <span className="capitalize text-gray-700">{sharingBet.marketType.replace("_", " ")}: {sharingBet.outcome}</span>
                  <span className="text-emerald-700 font-bold text-sm">{sharingBet.odds.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 pt-0 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(sharingBet.id);
                  alert("Ticket ID copied to clipboard!");
                }}
                className="w-full rounded-xl bg-blue-900/60 py-2.5 text-xs font-bold text-blue-200 hover:bg-blue-800 transition"
              >
                📋 Copy ID
              </button>
              <button
                onClick={() => setSharingBet(null)}
                className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT RECEIPT (Hidden on web UI, active during window.print()) */}
      {printingBet && (
        <PrintableTicket
          bet={printingBet}
          match={matches[printingBet.matchId]}
          homeTeam={matches[printingBet.matchId] ? teams[matches[printingBet.matchId].homeTeamId]?.name : "Home Team"}
          awayTeam={matches[printingBet.matchId] ? teams[matches[printingBet.matchId].awayTeamId]?.name : "Away Team"}
        />
      )}
    </div>
  );
}

{/* PRINT COMPONENT */}
function PrintableTicket({
  bet,
  match,
  homeTeam,
  awayTeam,
}: {
  bet: Bet;
  match?: Match;
  homeTeam?: string;
  awayTeam?: string;
}) {
  const createdDate = new Date(bet.createdAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="printable-ticket hidden print:block bg-white text-black p-6 font-sans text-xs">
      <div className="text-center border-b border-gray-300 pb-3 mb-3">
        <h1 className="text-xl font-black tracking-wider text-emerald-800">FUNAAB BetSim</h1>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Official Simulation Ticket</p>
        <p className="text-[11px] font-semibold text-gray-700 mt-2">{createdDate}</p>
        <p className="text-sm font-bold mt-1">Bet slip № {bet.id.slice(0, 12).toUpperCase()}</p>
      </div>

      <div className="flex justify-between items-center mb-3 text-[11px] font-medium border-b border-gray-200 pb-2">
        <span>Type: Single Bet</span>
        <span>Status: <strong className="uppercase">{bet.status}</strong></span>
      </div>

      <table className="w-full border-collapse border border-gray-300 text-left mb-4 text-[11px]">
        <thead>
          <tr className="bg-gray-100 text-gray-700 border-b border-gray-300">
            <th className="p-2 border-r border-gray-300">Date/Time</th>
            <th className="p-2 border-r border-gray-300">Event</th>
            <th className="p-2 border-r border-gray-300">Selection</th>
            <th className="p-2 text-right">Odds</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-200">
            <td className="p-2 border-r border-gray-200 whitespace-nowrap">
              {match ? new Date(match.kickoffAt).toLocaleDateString("en-GB") : "-"}
            </td>
            <td className="p-2 border-r border-gray-200 font-semibold">
              {homeTeam ?? "Home"} vs {awayTeam ?? "Away"}
            </td>
            <td className="p-2 border-r border-gray-200 capitalize">
              {bet.marketType.replace("_", " ")} — {bet.outcome}
            </td>
            <td className="p-2 text-right font-bold">{bet.odds.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div className="flex flex-col gap-1 items-end border-t border-gray-300 pt-3 mb-6 text-xs">
        <div className="flex justify-between w-full max-w-[200px]">
          <span className="text-gray-600">Total Odds:</span>
          <span className="font-bold">{bet.odds.toFixed(2)}</span>
        </div>
        <div className="flex justify-between w-full max-w-[200px]">
          <span className="text-gray-600">Stake:</span>
          <span className="font-bold">₦{bet.stake.toLocaleString()}</span>
        </div>
        <div className="flex justify-between w-full max-w-[200px] text-sm border-t border-gray-300 pt-1 mt-1 font-black text-emerald-800">
          <span>Potential Return:</span>
          <span>₦{(bet.stake * bet.odds).toLocaleString()}</span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center pt-4 border-t border-dashed border-gray-400">
        <div className="font-mono text-2xl tracking-[0.2em] font-bold text-gray-800 border-x-4 border-black px-4 py-1 my-1">
          |||| | ||||| ||| |||| ||
        </div>
        <span className="font-mono text-[10px] text-gray-500 tracking-widest">{bet.id.toUpperCase()}</span>
      </div>
    </div>
  );
}
