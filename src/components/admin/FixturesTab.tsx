// Add this component inside FixturesTab.tsx or as a separate component

function MarketCreator({ matchId, onCreated }: { matchId: string; onCreated: () => void }) {
  const [marketType, setMarketType] = useState<"match_winner" | "over_under" | "double_chance" | "draw_no_bet">("match_winner");
  const [line, setLine] = useState("2.5");
  const [odds, setOdds] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const marketConfigs = {
    match_winner: {
      selections: [
        { id: "home", label: "Home", defaultOdds: "2.00" },
        { id: "draw", label: "Draw", defaultOdds: "3.20" },
        { id: "away", label: "Away", defaultOdds: "3.50" },
      ],
    },
    double_chance: {
      selections: [
        { id: "home_draw", label: "1X", defaultOdds: "1.30" },
        { id: "home_away", label: "12", defaultOdds: "1.25" },
        { id: "draw_away", label: "X2", defaultOdds: "1.40" },
      ],
    },
    draw_no_bet: {
      selections: [
        { id: "home", label: "Home", defaultOdds: "1.80" },
        { id: "away", label: "Away", defaultOdds: "2.10" },
      ],
    },
    over_under: {
      selections: [
        { id: "over", label: "Over", defaultOdds: "1.90" },
        { id: "under", label: "Under", defaultOdds: "1.90" },
      ],
    },
  };

  const config = marketConfigs[marketType];

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const selections = config.selections.map((s) => ({
        id: s.id,
        label: s.label,
        odds: parseFloat(odds[s.id] || s.defaultOdds),
      }));

      const body: any = { matchId, type: marketType, selections };
      if (marketType === "over_under") {
        body.line = parseFloat(line);
      }

      const response = await fetch("/api/admin/markets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create market");
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create market");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-surface-raised p-3">
      <p className="text-sm font-semibold mb-2">Add Market</p>
      
      <div className="flex gap-2 mb-3">
        <select
          value={marketType}
          onChange={(e) => setMarketType(e.target.value as any)}
          className="flex-1 rounded-lg border border-ink-muted/20 bg-surface px-3 py-2 text-sm"
        >
          <option value="match_winner">Match Winner (1X2)</option>
          <option value="over_under">Over/Under</option>
          <option value="double_chance">Double Chance</option>
          <option value="draw_no_bet">Draw No Bet</option>
        </select>
        
        {marketType === "over_under" && (
          <input
            type="number"
            step="0.5"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            placeholder="Line"
            className="w-20 rounded-lg border border-ink-muted/20 bg-surface px-3 py-2 text-sm"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {config.selections.map((s) => (
          <div key={s.id}>
            <label className="text-xs text-ink-muted">{s.label}</label>
            <input
              type="number"
              step="0.01"
              min="1.01"
              value={odds[s.id] || s.defaultOdds}
              onChange={(e) => setOdds((prev) => ({ ...prev, [s.id]: e.target.value }))}
              className="w-full rounded-lg border border-ink-muted/20 bg-surface px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-loss mb-2">{error}</p>}
      
      <button
        onClick={handleCreate}
        disabled={submitting}
        className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create Market"}
      </button>
    </div>
  );
}
