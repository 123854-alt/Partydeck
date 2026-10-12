# PartyDeck

PartyDeck is a Next.js foundation for a shared game-night lobby. The current screen is a responsive Dutch/English front-end preview. Poker hand ranking and side-pot utilities are implemented as reusable TypeScript modules.

## Current status

- Lobby creation/join screens, game catalog, language toggle, invite-code display, and responsive styling are present.
- Poker evaluator covers all standard categories, ace-low straights, tie breakers, best-five selection, and side-pot construction.
- The app is **not live multiplayer yet**. Lobby codes are generated in the browser; they do not create database sessions and cannot be joined from another device. Poker gameplay, dealing, betting, private-card delivery, and session settlement are not wired to a server.
- UNO, Monopoly, and Guess the Impostor are explicitly marked as coming soon.

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` if configuring Supabase.
4. Run `npm run dev` and open http://localhost:3000.

The Supabase variables are optional for this preview. The client variable names follow the current Supabase Next.js setup (`NEXT_PUBLIC_SUPABASE_URL` and a publishable/anon public key); never put a service-role key in a `NEXT_PUBLIC_` variable. See [Supabase's Next.js setup guide](https://supabase.com/docs/guides/auth/quickstarts/nextjs).

## Supabase foundation

The initial schema is in `supabase/migrations/202610120001_partydeck_foundation.sql`. Apply it with the Supabase CLI from this project after linking your Supabase project, or paste its contents into the SQL editor. The schema enables RLS and denies browser-role table access by default. A trusted API/Edge Function layer must be implemented before exposing lobby queries or actions. Reconnect tokens must be random, returned only once, stored as hashes, and checked server-side. Private poker cards belong only in the private schema and must be delivered through an authenticated per-player server response, never public Realtime payloads.

For a production multiplayer release, implement transactional server operations for lobby creation/join, approval revisions, poker actions and pot settlement; authorize every request using reconnect credentials; publish sanitized public snapshots; and send only the requesting player's cards to their device. Configure Supabase Realtime only for those sanitized snapshots.

## Vercel

Import the repository in Vercel, select the Next.js framework preset, set the required environment variables for the server integration, and deploy. Do not call multiplayer operational until the backend endpoints, RLS policies, reconnect checks, and cross-device flows have been configured and verified.

## Checks

`npm run typecheck`, `npm test`, and `npm run build` are the intended checks. Test cases currently target hand categories, wheel straights, kicker comparison, and side-pot eligibility. More poker betting-engine and browser multiplayer tests remain necessary before accepting real games.
