# CWP Hackathon Prize Spinner

A responsive CodeWithPurpose spinner with eleven equal choices, A through K. Built with Next.js 16 App Router, React 19 and TypeScript. Colours, logo and Koda koala illustrations reference the main CWP website. The open woodland interface uses locally bundled Chewy and Atkinson Hyperlegible fonts, native HTML buttons and Motion animations. Koda watches spins from a branch and celebrates results with a heart. Fonts are bundled locally.

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

Enter a name and email, then verify the six-digit code delivered by Resend. Codes expire after 15 minutes; request a new code if it expires. A verified email can spin once during its 24-hour access window. The server chooses uniformly from A–K, the wheel animates the result under the fixed pointer, and Resend emails the selected choice to the verified address. Access sessions and email/name records expire after 24 hours. Code requests are rate limited by email and the trusted proxy IP.

## Email verification setup

Copy `.env.example` to `.env.local` and configure a Resend API key, a sender address on a verified Resend domain, the Supabase project URL, a server-only Supabase secret key, and a random `AUTH_SECRET` of at least 32 characters. Older Supabase projects can use the legacy `SUPABASE_SERVICE_ROLE_KEY` in place of `SUPABASE_SECRET_KEY`. Run `supabase/migrations/20261003000000_cwp_spinner_state.sql` once in the Supabase SQL Editor, then add the same environment values to the production host. The migration creates an RLS-protected table in the private schema and RPC functions callable only with the server key. The app keeps OTP challenges for 15 minutes, allows five code attempts, enforces a 60-second resend cooldown, limits code requests to three per email per 15 minutes and ten per proxy IP per hour, and expires session data after 24 hours. One spin is claimed atomically per email across devices for that 24-hour access window.

The email/name are used only to deliver and verify the code, send the chosen result, and enforce the one-spin rule. They are stored temporarily in Supabase Postgres and are not retained as an event roster or written to application logs. Email and IP rate-limit identities are HMAC'd before storage. IP-based request limits use client address headers set by the trusted hosting proxy; email-based limits still apply when a proxy address is unavailable.

Edit labels in `src/wheel.ts` for the next round of hackathon setup. The backend handles temporary email verification and the one-spin claim; it does not keep a participant roster or prize inventory.

## Build for Access track

The unboxed illustrated Track trail adapts the [CWP challenge brief](https://docs.google.com/document/d/12snSClJj4a6A9Ql5gx8O9n5KKGzKjAsDLRg9irZUSIg/edit). It explains the optional Dublin Hacx track, gives five project examples, lists the submission requirements and reproduces the four judging categories (30/25/25/20). The brief specifies 8:00 PM but no event date or timezone, so neither is inferred here. Track content lives in `src/track.ts`.

Koda reacts to pointer or keyboard activation, watches spins and celebrates results with confetti. Animations remain enabled for every visitor.

The header has direct Spin and Track navigation. Animations are always enabled. Koda appears in the hub, spin host, trail stages and footer. The possibility pack and boxed track panels are removed.

## Next.js structure

`src/app/layout.tsx` owns metadata and global styles. `src/app/page.tsx` renders the site through `HackathonSite`, a server-prerendered client component. The trusted local markup is deterministic; Native button listeners attach after hydration. Spinner listeners, media-query listeners, observers and animations are disposed on unmount, including React Strict Mode effect replay. Run `npm run check` before shipping.
