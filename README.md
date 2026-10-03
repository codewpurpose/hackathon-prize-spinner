# CWP Hackathon Prize Spinner

A responsive CodeWithPurpose raffle spinner with three equally likely prizes: Sour Patch, Swedish Fish, or an Arduino kit, keyboard, and headphones. Built with Next.js 16 App Router, React 19 and TypeScript. Colours, logo and Koda koala illustrations reference the main CWP website. The open woodland interface uses locally bundled Chewy and Atkinson Hyperlegible fonts, native HTML buttons and Motion animations. Koda watches spins from a branch and celebrates results with a heart. Fonts are bundled locally.

## Development

Requires Node.js 24+.

```bash
npm install
npm run dev
```

Open http://localhost:5173/. For a phone on the same network, use the Network URL printed by Next.js.

```bash
npm test
npm run build
npm run start
```

The production build is generated in `.next/`. Deploy to a Next.js-compatible host or run `npm run start`.

## Behaviour

Sign in with a verified CWP account to spin once every 24 hours. The server chooses uniformly from the three raffle prizes, saves the result against the account, animates the wheel to the matching prize, and emails the result to the account's verified primary address. The stored result expires after 24 hours.

## Account, result email, and storage setup

Copy `.env.example` to `.env.local` and configure the CWP Clerk keys, a Resend API key, a sender address on a verified Resend domain, the Supabase project URL, a server-only Supabase secret key, and a random `AUTH_SECRET` of at least 32 characters. Older Supabase projects can use the legacy `SUPABASE_SERVICE_ROLE_KEY` in place of `SUPABASE_SECRET_KEY`. Run `supabase/migrations/20261003000000_cwp_spinner_state.sql` once in the Supabase SQL Editor, then add the same environment values to the production host. The migration creates an RLS-protected table in the private schema and RPC functions callable only with the server key. One spin is claimed atomically per CWP account across devices for 24 hours.

The spinner stores a keyed hash of the CWP account ID with the selected prize index, not an attendee roster. The result email is sent to the verified primary email on the CWP account.

Edit prizes in `src/wheel.ts` for the next round of hackathon setup. The backend keeps the selected result for 24 hours to enforce the one-spin rule; it does not keep a participant roster or prize inventory.

## Build for Access track

The unboxed illustrated Track trail adapts the [CWP challenge brief](https://docs.google.com/document/d/12snSClJj4a6A9Ql5gx8O9n5KKGzKjAsDLRg9irZUSIg/edit). It explains the optional Dublin Hacx track, gives five project examples, lists the submission requirements and reproduces the four judging categories (30/25/25/20). The brief specifies 8:00 PM but no event date or timezone, so neither is inferred here. Track content lives in `src/track.ts`.

Koda reacts to pointer or keyboard activation, watches spins and celebrates results with confetti. Animations remain enabled for every visitor.

The header has direct Spin and Track navigation. Animations are always enabled. Koda appears in the hub, spin host, trail stages and footer. The possibility pack and boxed track panels are removed.

## Next.js structure

`src/app/layout.tsx` owns metadata and global styles. `src/app/page.tsx` renders the site through `HackathonSite`, a server-prerendered client component. The trusted local markup is deterministic; Native button listeners attach after hydration. Spinner listeners, media-query listeners, observers and animations are disposed on unmount, including React Strict Mode effect replay. Run `npm run check` before shipping.
