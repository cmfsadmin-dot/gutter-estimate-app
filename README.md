# Gutter Estimate Builder — standalone app

Real accounts, a shared database, roles (owner vs team member), an
approval workflow, voice entry, branding, and billing for two paid tiers
plus a free trial.

**This has been tested end-to-end against a real Postgres database** —
signup, adding a team member, role permission checks (members blocked from
settings/user management/approving), a member's estimate landing as
pending approval, and the owner approving it — all verified working before
this was handed to you.

## Pieces

- **`server/`** — Express API: auth, database, roles, the approval
  workflow, voice parsing, email sending, Stripe billing. This is where
  ALL your secret keys live — they never reach the browser.
- **`client/`** — the React app contractors and their team actually use.

## 1. Set up the database

Get a free Postgres database — [neon.tech](https://neon.tech) or
[supabase.com](https://supabase.com) both have generous free tiers and
take about 2 minutes to set up. Copy the connection string they give you.

Apply the schema:

```
cd server
psql "$DATABASE_URL" -f schema.sql
```

(If you don't have `psql` installed locally, Neon and Supabase both have
a SQL editor in their web dashboard — paste `schema.sql`'s contents there
instead.)

## 2. Set up the backend

```
cd server
cp .env.example .env
```

Fill in `server/.env`:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | From step 1 |
| `JWT_SECRET` | Any long random string — run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys (voice entry) |
| `POSTMARK_API_TOKEN`, `SEND_FROM_EMAIL`, `SEND_FROM_NAME` | https://postmarkapp.com — verify a sending domain first |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLAN_1999`, `STRIPE_PRICE_PLAN_3999` | https://dashboard.stripe.com — create two recurring Prices ($19.99/mo, $39.99/mo) first, then a webhook endpoint pointed at `<your-backend-url>/api/billing/webhook` listening for `checkout.session.completed` and `customer.subscription.updated`/`.deleted` |

```
npm install
npm run dev
```

You should see `Gutter estimate server running on http://localhost:3001`.

## 3. Set up the frontend (second terminal)

```
cd client
cp .env.example .env
npm install
npm run dev
```

Opens on `http://localhost:5173`. You'll land on a login/signup screen —
"Start free trial" creates the owner account and company; team members are
added afterward from the Team tab.

## How the plans work

| | Free trial | $19.99/mo | $39.99/mo |
|---|---|---|---|
| Users | up to 10 (full access to preview) | up to 3 | up to 10 |
| Custom logo/theme | ✅ | ✅ | ✅ |
| Voice entry | ✅ | ❌ | ✅ |
| Length | 14 days (`TRIAL_DAYS` in `.env`) | — | — |

Plan limits live in one place: `server/plans.js`. Change pricing/seats/
features there and every route (`users.js`, `company.js`, `voice.js`)
picks it up automatically.

## How the approval workflow works

- **Owner creates an estimate** → auto-approved immediately (they're the
  approver, no point routing it to themselves) → they can send right away.
- **Team member creates an estimate** → status `pending_approval` → owner
  reviews it, calls `/approve` (or `/approve-and-send` to do both at once)
  → only then does it actually email the customer.
- A member can only see estimates they created; the owner sees everything
  for the company.
- Only the owner can ever call the send endpoint — enforced server-side,
  not just hidden in the UI.

## What's real vs. what's still a placeholder

**Real, and tested end-to-end against a live Postgres database + a real
production build of the frontend (not just written and hoped for):**
- Signup/login screens, password hashing, JWT sessions, session
  rehydration on page reload
- Role enforcement (verified: a team member gets a 403 trying to write
  settings, list the team, or approve/send anything — not just hidden UI)
- The settings save round-trip, including the nested pricing grids
  (verified values persist and reload correctly)
- Team management screen — add/remove members, seat count shown
- The approval workflow UI in the Estimates tab: a member's pending
  estimate is expandable to review line items before the owner approves
  or approves-and-sends it; owner's own estimates auto-approve
- Seat limits per plan (enforced when adding a team member)
- Trial expiration blocking writes once it runs out
- Voice entry gated behind the plan's `voice` feature flag, with an
  upgrade prompt when it's not included
- The `npm run build` production build compiles cleanly with no errors

**Needs your own setup before it works for real:**
- Actual email sending (needs your Postmark account + verified domain)
- Actual voice parsing (needs your Anthropic key)
- Actual billing (needs your Stripe account + two Price IDs + webhook —
  the checkout redirect button works, but nothing happens after payment
  until you've set up the webhook)

**Deliberately simplified for now:**
- Adding a team member: the owner sets their initial password directly.
  No invite-email flow yet (member should change their password after
  first login if you want that later).
- Estimate totals are computed client-side and trusted as sent — for a
  polished v1 you'd eventually want the server to recompute totals from
  stored pricing rather than trust whatever the browser sends, so a member
  can't tamper with a price before submitting for approval.
- "Approve & send" approves first, then sends. If Postmark isn't
  configured (or the send fails for any reason), the approval still
  sticks — the estimate shows as Approved, not stuck pending, and you can
  retry sending separately. Confirmed this during testing.

## Going live — step by step

### 1. Database
[neon.tech](https://neon.tech) or [supabase.com](https://supabase.com), free
tier. Copy the connection string, run `schema.sql` against it (step 1 above).

### 2. Backend → Render
1. Push this repo to GitHub (or push just this project)
2. [render.com](https://render.com) → New → Web Service → connect the repo
3. Root directory: `server`. Build command: `npm install`. Start command: `npm start`
4. Add every variable from `server/.env` as an environment variable in Render's dashboard — **not** the `.env` file itself
5. Set `APP_URL` to your Netlify URL from step 3 below (you'll circle back and update this once you know it)
6. Deploy. You'll get a URL like `https://your-app.onrender.com` — that's your backend's real address

### 3. Frontend → Netlify
This project already has `client/netlify.toml` set up, so:
1. Push to GitHub if you haven't
2. [netlify.com](https://netlify.com) → Add new site → Import from Git → pick the repo
3. Netlify reads `netlify.toml` automatically (base directory `client`, build `npm run build`, publish `dist`) — you shouldn't need to touch the build settings
4. Before the first deploy, add an environment variable: `VITE_API_BASE_URL` = your Render backend URL from step 2
5. Deploy. You'll get a URL like `https://your-app.netlify.app`

### 4. Connect the two
- Go back to Render, update `APP_URL` to your real Netlify URL, redeploy
- This matters because Stripe checkout's success/cancel redirect uses `APP_URL`

### 5. Stripe (real payments)
1. [dashboard.stripe.com](https://dashboard.stripe.com) → Products → create two
   recurring Prices: $19.99/mo and $39.99/mo → copy their Price IDs
2. Developers → API keys → copy your **secret key**
3. Developers → Webhooks → Add endpoint → URL: `https://your-app.onrender.com/api/billing/webhook`
   → events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   → copy the **signing secret**
4. Put `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLAN_1999`, `STRIPE_PRICE_PLAN_3999` into Render's environment variables, redeploy
5. Start in Stripe **test mode** first — test-mode keys start with `sk_test_`/`whsec_test_` — and run a full signup → upgrade → webhook cycle with Stripe's test card `4242 4242 4242 4242` before flipping to live keys

### 6. Postmark + Anthropic
Same as the local setup (steps 2 in "Set up the backend" above) — just add
those same env vars to Render instead of your local `.env`.

### Mic access
Netlify and Render both give you HTTPS automatically, so voice entry's
microphone requirement is satisfied with no extra work.
