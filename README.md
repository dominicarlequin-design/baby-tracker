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
