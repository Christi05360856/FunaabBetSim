import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-md pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-brand px-4 py-3 text-white">
        <Link href="/dashboard" className="text-lg">
          ←
        </Link>
        <h1 className="flex-1 font-display text-base font-bold">
          Terms of Use
        </h1>
      </header>
      <article className="space-y-4 px-4 py-5 text-sm leading-relaxed">
        <p className="text-xs text-ink-muted">Last updated: September 2026</p>

        <section>
          <h2 className="font-bold">1. Nature of the service</h2>
          <p className="mt-1 text-ink-muted">
            FUNAAB BetSim is a free educational and entertainment simulation.
            All balances and payouts are virtual. No real money is deposited,
            staked, or withdrawn.
          </p>
        </section>

        <section>
          <h2 className="font-bold">2. Eligibility</h2>
          <p className="mt-1 text-ink-muted">
            You must be at least 18 years old to register and use the service.
            By creating an account you confirm this.
          </p>
        </section>

        <section>
          <h2 className="font-bold">3. Accounts</h2>
          <p className="mt-1 text-ink-muted">
            You are responsible for keeping your login details secure. We may
            suspend accounts that abuse the system, attempt to manipulate
            results, or harass other users.
          </p>
        </section>

        <section>
          <h2 className="font-bold">4. Virtual wallet</h2>
          <p className="mt-1 text-ink-muted">
            Starting balance and resets are controlled by the platform. Virtual
            funds have no cash value and cannot be exchanged for money or
            goods.
          </p>
        </section>

        <section>
          <h2 className="font-bold">5. Betting simulation</h2>
          <p className="mt-1 text-ink-muted">
            Odds, markets, and settlements are generated for gameplay. Match
            data may lag or contain errors. The operators may void or correct
            tickets when a clear technical mistake occurs.
          </p>
        </section>

        <section>
          <h2 className="font-bold">6. Acceptable use</h2>
          <p className="mt-1 text-ink-muted">
            Do not attempt to hack, scrape abusively, or disrupt the service.
            Do not present FUNAAB BetSim as a real-money bookmaker.
          </p>
        </section>

        <section>
          <h2 className="font-bold">7. Limitation of liability</h2>
          <p className="mt-1 text-ink-muted">
            The service is provided “as is”. To the fullest extent permitted by
            law, we are not liable for any loss arising from use of this
            simulation.
          </p>
        </section>

        <section>
          <h2 className="font-bold">8. Changes</h2>
          <p className="mt-1 text-ink-muted">
            We may update these terms. Continued use after changes means you
            accept the updated terms.
          </p>
        </section>
      </article>
    </main>
  );
}
