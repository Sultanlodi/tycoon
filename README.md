# Game Hub

Multiplayer card games (Tycoon + Poker) in a single web app. Built for friends and family.

## What's Included

- **Game Hub** (`/`) — Pick a game, enter your name, go.
- **Tycoon** (`/tycoon`) — 4-player climbing card game. Play solo vs bots or create/join rooms. 3 rounds, ranked scoring (Tycoon/Rich/Poor/Beggar).
- **Poker** (`/poker`) — No-limit Texas Hold'em, 2–8 players. Bots can fill empty seats. Wallet system with weekly grants.
- **Auth** (`/auth`) — Email + password sign-up/login. No email verification (disabled in Supabase). Guest play still works without an account.

## Tech Stack

- **Backend:** Python / Flask / Flask-SocketIO (threading async mode)
- **Frontend:** Vanilla JS, no framework
- **Database / Auth:** Supabase (Postgres + Auth)
- **Hosting:** DigitalOcean App Platform (Docker)
- **Realtime:** Socket.IO over WebSockets

## Local Setup

```bash
cd web
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Environment Variables

Create a `.env` file in the **project root** (not in `web/`):

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

| Variable | Description |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |

On **DigitalOcean App Platform**, set these in your app's environment variables section (App > Settings > Components > Environment Variables). The Dockerfile reads them at runtime via `os.getenv`.

## Running Locally

```bash
cd web
source venv/bin/activate
python app.py
```

Server starts at `http://localhost:5000`.

## Running Tests

```bash
cd web
source venv/bin/activate
python -m pytest tests/ -v
```

## Deploying (DigitalOcean App Platform)

The app deploys as a Docker container. The Dockerfile lives at `web/Dockerfile`.

- Source directory: `web/`
- Build command: handled by Dockerfile
- Run command: `gunicorn -w 1 -b 0.0.0.0:5000 --threads 100 app:app`
- Port: `5000`
- Worker count must be `1` (Socket.IO requires a single process for in-memory room state)

## Supabase Setup

### Auth Settings

Go to Authentication > Providers > Email and **disable "Confirm email"**. This lets users sign up and play immediately without email verification.

### Database Tables

The active tables used by the app:

**`user_wallets`** — Poker bankroll per user.

| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID (PK) | References `auth.users(id)` |
| `wallet_balance` | INT | Current chip balance |
| `last_grant_week` | TEXT | ISO week key like `2026-W05` |
| `created_at` | TIMESTAMPTZ | Auto |
| `updated_at` | TIMESTAMPTZ | Auto via trigger |

**`tycoon_stats`** — Tycoon win tracking.

| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID (PK) | References `auth.users(id)` |
| `first_place_wins` | INT | Number of Tycoon (1st place) finishes |
| `created_at` | TIMESTAMPTZ | Auto |
| `updated_at` | TIMESTAMPTZ | Auto via trigger |

Both tables have RLS enabled with `auth.uid() = user_id` policies. The `set_updated_at()` trigger handles `updated_at` automatically.

The initial migration in `supabase/migrations/001_initial_schema.sql` has the original schema (game rooms, players, history, etc.) but the app currently only uses `user_wallets` and `tycoon_stats` for persistence. Game state lives in server memory via Socket.IO.

## Game Rules

### Tycoon

- 4 players, 54 cards (standard deck + 2 jokers), 3 rounds
- Play 1–4 cards of the same value; next player must match count with higher value
- Pass if you can't or won't play; turn ends after 3 passes
- Special: **8** clears the pile, **3** counters Joker, **4-of-a-kind** triggers Revolution (reverses card strength)
- Scoring: Tycoon 20pts, Rich 10pts, Poor 5pts, Beggar 0pts
- Between rounds: Tycoon/Beggar and Rich/Poor exchange cards

### Poker

- No-limit Texas Hold'em
- Blinds escalate every 10 hands
- Players buy in for $1,000 from their wallet
- Folded hands stay hidden until post-hand phase (opt-in "Show Hand" button)
- 10-second grace period between hands

## Wallet Model (Poker)

- Each user has one wallet balance stored in `user_wallets`
- **Weekly grant:** +$3,000 every Monday (additive, not a reset)
- **Buy-in:** $1,000 per buy-in, deducted from wallet
- **Winnings persist:** if you leave a table with $2,400, that goes back into your wallet
- Guest users (not logged in) get a wallet via Supabase anonymous auth, tied to their browser session
- Logged-in users keep their wallet across devices

## Folder Structure

```
tycoon/
├── .env                          # Supabase credentials (git-ignored)
├── supabase/
│   └── migrations/               # SQL schema (reference)
└── web/
    ├── app.py                    # Flask app, Tycoon game logic, routes
    ├── game_registry.py          # Game config (Tycoon, Poker)
    ├── Dockerfile
    ├── requirements.txt
    ├── poker/
    │   ├── poker_logic.py        # Poker game engine
    │   └── poker_events.py       # Poker Socket.IO event handlers
    ├── templates/
    │   ├── picker.html           # Game Hub (/)
    │   ├── tycoon.html           # Tycoon game page
    │   ├── poker.html            # Poker game page
    │   └── auth.html             # Login / Sign Up page
    ├── static/
    │   ├── css/style.css         # All styles
    │   └── js/
    │       ├── shared.js         # Shared state, auth bar, socket init
    │       ├── game.js           # Tycoon client logic
    │       ├── poker.js          # Poker client logic
    │       ├── bankroll.js       # Poker wallet service
    │       └── auth.js           # Auth page logic
    └── tests/
        └── test_poker.py         # Poker unit tests (55 tests)
```

## Troubleshooting

**"Service unavailable" on auth page**
Missing or empty `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env`. Make sure the file is in the project root, not inside `web/`.

**Sign-up says "email confirmation required"**
Go to Supabase dashboard > Authentication > Providers > Email and disable "Confirm email".

**Wallet not persisting**
Check that anonymous sign-ins are enabled in Supabase (Authentication > Providers > Anonymous > Enable). Logged-in users use their real session; guests need anonymous auth.

**Socket.IO disconnects on deploy**
The Dockerfile runs gunicorn with `-w 1`. If you change this to more workers, Socket.IO rooms will break because game state is in-memory per process.

**Tests not finding modules**
Run pytest from the `web/` directory: `cd web && python -m pytest tests/ -v`.

## Changelog

- **2026-02-03** — Host can kick/remove players from poker rooms. Works in lobby and mid-hand. Kicked humans get stack returned to wallet.
- **2026-02-03** — Added email+password auth (sign up, log in, log out). Auth bar on all pages. Bankroll now uses shared Supabase client.
- **2026-02-03** — Folded hand reveal system (opt-in "Show Hand" during post-hand). Reveal animations + spotlight banners. 10-second post-hand grace period.
- **2026-02-02** — Poker economy rewrite: single wallet model with Supabase persistence. Weekly $3,000 grant. Anonymous auth for RLS.
- **2026-02-02** — Added "How to Play" modal and hand rankings reference to Poker.
