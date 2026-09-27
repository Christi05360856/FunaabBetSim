import Link from "next/link";

export default function AboutPage() {
  return (
    <LegalShell title="About FUNAAB BetSim">
      <p>
        <strong>FUNAAB BetSim</strong> is a virtual sports-betting simulation
        built around FUNAAB student football. Every balance, stake, and payout
        is <strong>play money only</strong>. Nothing here is real currency, and
        nothing can be withdrawn.
      </p>
      <p>
        The project exists for learning, entertainment, and campus sports
        engagement — not for gambling with real funds.
      </p>
      <h2>What you can do</h2>
      <ul>
        <li>Browse fixtures and place virtual singles or accumulators</li>
        <li>Follow live scores and settle tickets as matches finish</li>
        <li>Share booking codes with friends inside the sim</li>
      </ul>
      <h2>Responsible use</h2>
      <p>
        You must be 18 or older to create an account. Treat this as a game.
        If real-money gambling is a concern for you, seek help from appropriate
        local resources.
      </p>
      <p className="text-ink-muted text-sm">Version 1.0 · FUNAAB BetSim</p>
    </LegalShell>
  );
}

function LegalShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-md pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-brand px-4 py-3 text-white">
        <Link href="/dashboard" className="text-lg" aria-label="Back">
          ←
        </Link>
        <h1 className="flex-1 font-display text-base font-bold">{title}</h1>
      </header>
      <article className="prose prose-sm max-w-none space-y-3 px-4 py-5 text-sm leading-relaxed text-ink">
        {children}
      </article>
    </main>
  );
}
