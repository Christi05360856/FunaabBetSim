import Link from "next/link";

export default function HowToPlayPage() {
  return (
    <main className="mx-auto min-h-screen max-w-md pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-brand px-4 py-3 text-white">
        <Link href="/dashboard" className="text-lg">
          ←
        </Link>
        <h1 className="flex-1 font-display text-base font-bold">How to play</h1>
      </header>
      <article className="space-y-4 px-4 py-5 text-sm leading-relaxed">
        <section>
          <h2 className="font-bold">1. Get virtual funds</h2>
          <p className="mt-1 text-ink-muted">
            New accounts start with play money. If you reach zero, wait for the
            cooldown and reset from Account.
          </p>
        </section>
        <section>
          <h2 className="font-bold">2. Pick odds</h2>
          <p className="mt-1 text-ink-muted">
            Open Fixtures, choose 1X2 / O/U / DC, and tap odds. Each tap adds
            (or removes) a pick on your bet slip.
          </p>
        </section>
        <section>
          <h2 className="font-bold">3. Singles & multiples</h2>
          <p className="mt-1 text-ink-muted">
            One pick = single. Two or more = accumulator (all legs must win).
            Open the green ticket button to stake, book a code, or place.
          </p>
        </section>
        <section>
          <h2 className="font-bold">4. Follow results</h2>
          <p className="mt-1 text-ink-muted">
            Live scores update during matches. Settled tickets appear under My
            Bets with FT scores and market / pick / outcome detail.
          </p>
        </section>
        <section>
          <h2 className="font-bold">5. Booking codes</h2>
          <p className="mt-1 text-ink-muted">
            Book Bet creates a code you can share. Friends can load it into
            their empty slip.
          </p>
        </section>
      </article>
    </main>
  );
}
