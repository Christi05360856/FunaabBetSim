"use client";

import React from "react";
import type { Bet, Match, Team } from "@/types/domain";

type PrintableTicketProps = {
  bet: Bet;
  matchesById: Record<string, Match>;
  teamsById: Record<string, Team>;
};

export default function PrintableTicket({ bet, matchesById, teamsById }: PrintableTicketProps) {
  const match = matchesById[bet.matchId];
  const homeTeam = match ? teamsById[match.homeTeamId]?.name ?? "Home Team" : "Home Team";
  const awayTeam = match ? teamsById[match.awayTeamId]?.name ?? "Away Team" : "Away Team";
  
  const createdDate = new Date(bet.createdAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="printable-ticket hidden print:block bg-white text-black p-6 rounded-lg font-sans text-xs">
      {/* Brand Header */}
      <div className="text-center border-b pb-3 mb-3">
        <h1 className="text-xl font-black tracking-wider text-emerald-700">FUNAAB BetSim</h1>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Official Simulation Ticket</p>
        <p className="text-[11px] font-semibold text-gray-700 mt-2">{createdDate}</p>
        <p className="text-sm font-bold mt-1">Bet slip № {bet.id.slice(0, 12).toUpperCase()}</p>
      </div>

      {/* Ticket Info Summary */}
      <div className="flex justify-between items-center mb-3 text-[11px] font-medium border-b pb-2">
        <span>Type: Single Bet</span>
        <span>Status: <strong className="uppercase">{bet.status}</strong></span>
      </div>

      {/* Selections Table */}
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
              {homeTeam} vs {awayTeam}
            </td>
            <td className="p-2 border-r border-gray-200 capitalize">
              {bet.marketType.replace("_", " ")} — {bet.outcome}
            </td>
            <td className="p-2 text-right font-bold">{bet.odds.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      {/* Total Calculations */}
      <div className="flex flex-col gap-1 items-end border-t pt-3 mb-6 text-xs">
        <div className="flex justify-between w-full max-w-[200px]">
          <span className="text-gray-600">Total Odds:</span>
          <span className="font-bold">{bet.odds.toFixed(2)}</span>
        </div>
        <div className="flex justify-between w-full max-w-[200px]">
          <span className="text-gray-600">Stake:</span>
          <span className="font-bold">₦{bet.stake.toLocaleString()}</span>
        </div>
        <div className="flex justify-between w-full max-w-[200px] text-sm border-t pt-1 mt-1 font-black text-emerald-800">
          <span>Potential Payout:</span>
          <span>₦{(bet.stake * bet.odds).toLocaleString()}</span>
        </div>
      </div>

      {/* Ticket Barcode / Footer */}
      <div className="flex flex-col items-center justify-center pt-4 border-t border-dashed">
        <div className="font-mono text-2xl tracking-[0.2em] font-bold text-gray-800 border-x-4 border-black px-4 py-1 my-1">
          |||| | ||||| ||| |||| ||
        </div>
        <span className="font-mono text-[10px] text-gray-500 tracking-widest">{bet.id.toUpperCase()}</span>
      </div>
    </div>
  );
}
