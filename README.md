# FUNAAB BetSim — Milestone 1: Running Foundation

Virtual (play-money) sports-betting simulation for FUNAAB football.
**No real money at any point.** This milestone only covers identity + wallet
foundation: registration, login, a protected dashboard, and the domain/type
scaffolding later phases build on.

## What's in this milestone

- Next.js 14 (App Router) + TypeScript (strict) + Tailwind
- Firebase Authentication (email/password) on the client
- Server-authoritative wallet creation: on registration, the client only
  proves identity (ID token); a Next.js API route running the Firebase
  **Admin** SDK creates the `users/{uid}` and `wallets/{uid}` documents in a
  transaction, seeded with the ₦100,000 starting balance. The client never
  writes its own balance — enforced both in code and in `firestore.rules`.
- A protected `/dashboard` that reads the wallet back through a
  server-verified API route (`/api/wallet`).
- Domain types (`MatchStatus`, `MarketStatus`, `BetStatus`, `Wallet`, …) and
  Zod boundary-validation schemas, ready for later phases.
- A light/dark-adaptive color theme grounded in FUNAAB's real brand colors
  (green = agriculture, gold = excellence).
- Vitest unit tests for the pieces of business logic that already exist.

## Setup

1. `npm install`
2. Your `.env.local` should already have the `NEXT_PUBLIC_FIREBASE_*` values
   filled in from earlier. Now add the **Admin SDK** credentials to the same
   file (Firebase console → Project Settings → Service accounts → Generate
   new private key — this downloads a JSON file):
