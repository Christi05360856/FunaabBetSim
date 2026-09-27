import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-md pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-brand px-4 py-3 text-white">
        <Link href="/dashboard" className="text-lg">
          ←
        </Link>
        <h1 className="flex-1 font-display text-base font-bold">
          Privacy Policy
        </h1>
      </header>
      <article className="space-y-4 px-4 py-5 text-sm leading-relaxed">
        <p className="text-xs text-ink-muted">Last updated: September 2026</p>

        <section>
          <h2 className="font-bold">1. What we collect</h2>
          <p className="mt-1 text-ink-muted">
            Account email, display name, authentication identifiers, and
            activity needed to run the sim (bets, wallet movements, device
            basics for security).
          </p>
        </section>

        <section>
          <h2 className="font-bold">2. How we use it</h2>
          <p className="mt-1 text-ink-muted">
            To operate accounts, place and settle virtual bets, prevent abuse,
            and improve the product. We do not sell your personal data.
          </p>
        </section>

        <section>
          <h2 className="font-bold">3. Storage</h2>
          <p className="mt-1 text-ink-muted">
            Data is stored with our hosting and database providers (e.g.
            Firebase / Vercel) under their security practices.
          </p>
        </section>

        <section>
          <h2 className="font-bold">4. Sharing</h2>
          <p className="mt-1 text-ink-muted">
            We only share data with service providers who help run the app, or
            when required by law.
          </p>
        </section>

        <section>
          <h2 className="font-bold">5. Your choices</h2>
          <p className="mt-1 text-ink-muted">
            You may request account deletion or data export by contacting the
            project maintainers through the channels published on campus /
            project docs.
          </p>
        </section>

        <section>
          <h2 className="font-bold">6. Children</h2>
          <p className="mt-1 text-ink-muted">
            The service is not directed at anyone under 18. We do not knowingly
            collect data from minors.
          </p>
        </section>
      </article>
    </main>
  );
}
