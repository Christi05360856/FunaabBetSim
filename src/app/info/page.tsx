"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Section = "how" | "about" | "terms" | "privacy";

const TABS: { id: Section; label: string }[] = [
  { id: "how", label: "How to play" },
  { id: "about", label: "About" },
  { id: "terms", label: "Terms" },
  { id: "privacy", label: "Privacy" },
];

export default function InfoPage() {
  const [tab, setTab] = useState<Section>("how");

  // Support ?tab= and #hash from old links
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("tab") as Section | null;
      const h = window.location.hash.replace("#", "") as Section;
      const next = q || h;
      if (next && TABS.some((x) => x.id === next)) setTab(next);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-md pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-brand px-4 py-3 text-white">
        <Link href="/dashboard" className="text-lg" aria-label="Back">
          ←
        </Link>
        <h1 className="flex-1 font-display text-base font-bold">
          Help &amp; legal
        </h1>
      </header>

      <div className="sticky top-12 z-10 flex gap-1 overflow-x-auto border-b border-line bg-bg px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === t.id
                ? "bg-brand text-white"
                : "bg-surface text-ink-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <article className="space-y-4 px-4 py-5 text-sm leading-relaxed">
        <p className="text-xs text-ink-muted">Last updated: September 2026</p>
        {tab === "how" && <HowToPlay />}
        {tab === "about" && <About />}
        {tab === "terms" && <Terms />}
        {tab === "privacy" && <Privacy />}
      </article>
    </main>
  );
}

function HowToPlay() {
  return (
    <>
      <h2 className="font-display text-lg font-bold">How to play</h2>
      <section>
        <h3 className="font-bold">1. Buy points</h3>
        <p className="mt-1 text-ink-muted">
          Open Account → Buy points. Pay with Flutterwave (card, bank, USSD).
          1 point = ₦1. Minimum purchase is ₦200. Points appear after payment
          is confirmed.
        </p>
      </section>
      <section>
        <h3 className="font-bold">2. Place a bet</h3>
        <p className="mt-1 text-ink-muted">
          Go to Fixtures, pick markets (1X2, over/under, etc.). Open the bet
          slip, enter stake (minimum 2 points), then place. Singles and
          accumulators are supported.
        </p>
      </section>
      <section>
        <h3 className="font-bold">3. Promo / bonus points</h3>
        <p className="mt-1 text-ink-muted">
          Promo codes (if offered) credit bonus points. Bonus is for betting
          only — it cannot be withdrawn as cash. Rules for each promo are set
          by the platform (e.g. number of legs or minimum odds). Use the
          Promo tab on the bet slip when spending bonus.
        </p>
      </section>
      <section>
        <h3 className="font-bold">4. Live scores &amp; settlement</h3>
        <p className="mt-1 text-ink-muted">
          Open tickets update as matches go live. After full time, winning
          tickets are settled to your cash balance. Check My Bets for status.
        </p>
      </section>
      <section>
        <h3 className="font-bold">5. Withdraw</h3>
        <p className="mt-1 text-ink-muted">
          Withdraw cash balance only (not promo). Minimum ₦1,000 per request.
          Bank name must match your account. Approvals are processed by the
          admin team.
        </p>
      </section>
      <section>
        <h3 className="font-bold">6. Support</h3>
        <p className="mt-1 text-ink-muted">
          Account → Support for contact details and official partners.
        </p>
      </section>
    </>
  );
}

function About() {
  return (
    <>
      <h2 className="font-display text-lg font-bold">About FUNAAB BetSim</h2>
      <p className="text-ink-muted">
        FUNAAB BetSim is a sports betting platform focused on FUNAABSU league
        action plus selected external competitions (e.g. Premier League, La
        Liga, and others).
      </p>
      <p className="text-ink-muted">
        You buy points, place singles or accumulators, and withdraw available
        cash winnings subject to platform rules. Promo points may be offered
        from time to time under stated conditions.
      </p>
      <p className="text-ink-muted">
        Built for students and fans who want a clear, mobile-first experience.
        Gambling involves risk — only stake what you can afford.
      </p>
      <p className="text-ink-muted">
        For help, open Account → Support.
      </p>
    </>
  );
}

function Terms() {
  return (
    <>
      <h2 className="font-display text-lg font-bold">Terms of use</h2>
      <section>
        <h3 className="font-bold">1. Nature of the service</h3>
        <p className="mt-1 text-ink-muted">
          FUNAAB BetSim is a real-money sports betting service. You purchase
          points (1 point = ₦1), stake them on football markets, and may
          withdraw eligible cash balances. Promo/bonus points are not
          withdrawable and may carry usage rules.
        </p>
      </section>
      <section>
        <h3 className="font-bold">2. Eligibility</h3>
        <p className="mt-1 text-ink-muted">
          You must be at least 18 years old. By registering you confirm you
          meet this requirement. We may request verification before
          withdrawals.
        </p>
      </section>
      <section>
        <h3 className="font-bold">3. Accounts</h3>
        <p className="mt-1 text-ink-muted">
          Keep your login secure. One person, one account. We may suspend
          accounts involved in fraud, multi-accounting, result manipulation,
          or abuse.
        </p>
      </section>
      <section>
        <h3 className="font-bold">4. Deposits &amp; points</h3>
        <p className="mt-1 text-ink-muted">
          Deposits are processed via Flutterwave. Credited points are for use
          on the platform. Minimum deposit and stake limits apply as shown in
          the app.
        </p>
      </section>
      <section>
        <h3 className="font-bold">5. Betting &amp; settlement</h3>
        <p className="mt-1 text-ink-muted">
          Odds can change until a bet is accepted. Settlement follows match
          results recorded by the platform. We may void or correct tickets for
          obvious errors, void matches, or technical faults.
        </p>
      </section>
      <section>
        <h3 className="font-bold">6. Withdrawals</h3>
        <p className="mt-1 text-ink-muted">
          Only withdrawable cash (purchased balance and settled cash wins)
          can be withdrawn. Promo points cannot be withdrawn. Limits and
          processing times apply. Bank account name must match the registered
          user where required.
        </p>
      </section>
      <section>
        <h3 className="font-bold">7. Acceptable use</h3>
        <p className="mt-1 text-ink-muted">
          Do not hack, scrape abusively, exploit bugs, or harass others.
          Report issues via Support.
        </p>
      </section>
      <section>
        <h3 className="font-bold">8. Changes</h3>
        <p className="mt-1 text-ink-muted">
          We may update these terms. Continued use after updates means you
          accept the revised terms. Material changes may be highlighted in the
          app.
        </p>
      </section>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h2 className="font-display text-lg font-bold">Privacy policy</h2>
      <section>
        <h3 className="font-bold">1. Data we collect</h3>
        <p className="mt-1 text-ink-muted">
          Account details (email, display name), wallet and transaction
          history, bets, device/app usage data, and payment references from
          our payment provider (Flutterwave). We do not store full card
          numbers on our servers.
        </p>
      </section>
      <section>
        <h3 className="font-bold">2. Why we use it</h3>
        <p className="mt-1 text-ink-muted">
          To run your account, process deposits and withdrawals, place and
          settle bets, prevent fraud, and improve the product. We do not sell
          your personal data.
        </p>
      </section>
      <section>
        <h3 className="font-bold">3. Storage</h3>
        <p className="mt-1 text-ink-muted">
          Data is stored with our hosting and database providers (e.g.
          Firebase / Vercel) under their security practices.
        </p>
      </section>
      <section>
        <h3 className="font-bold">4. Sharing</h3>
        <p className="mt-1 text-ink-muted">
          We share data only with service providers needed to run the app
          (payments, hosting) or when required by law.
        </p>
      </section>
      <section>
        <h3 className="font-bold">5. Your choices</h3>
        <p className="mt-1 text-ink-muted">
          You may request account closure or data questions via Support. Some
          records (e.g. ledgers) may be retained for compliance and dispute
          resolution.
        </p>
      </section>
    </>
  );
}
