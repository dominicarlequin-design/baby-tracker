# Baby Tracker

Tap-to-log baby habit tracker (Next.js + Supabase).

## Setup

```bash
npm install
cp .env.local.example .env.local
# fill in .env.local, then:
npm run dev
```

See `.env.local.example` for the required environment variables and where
each one is used.

## Data

Live schema lives in Supabase (`baby_events`, `baby_config`) — see
`lib/logic.js` for how status is derived from it.

## Phone alerts server

Phone alerts are sent by a Supabase Edge Function, `check-overdue`, that a
Supabase cron job calls every 2 minutes. Its code lives in
`supabase/functions/check-overdue/`:

- `index.ts`: decides which alerts to send and sends them.
- `logic.js`: an exact copy of `lib/logic.js`, so the app screen and the
  phone alerts always agree.

After changing `lib/logic.js`:

1. `npm run sync:edge` copies it into the function.
2. `npm test` checks the two copies match (it fails if they drift).
3. Redeploy the function:
   `npx supabase functions deploy check-overdue --no-verify-jwt --project-ref smfcfvzuytbnvqectrtf`
   (the function checks its own cron secret, so JWT verification stays off).
