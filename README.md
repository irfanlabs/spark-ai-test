# Spark Book — AI Appointment Booking (Assessment Prototype)

End-to-end SaaS-style prototype: **Next.js** frontend, **Express** API, **PostgreSQL**, **JWT auth**, **WebSocket + REST chat**, and **OpenRouter** LLM integration (with deterministic mock fallback).

## Live demo

> Deploy using the steps below (e.g. Railway/Render + Vercel) and add your URL here before submission.

| Environment | URL |
|-------------|-----|
| Frontend    | _TBD_ |
| API         | _TBD_ |

**Demo credentials (auto-seeded on backend startup):** `demo@example.com` / `Password123!`

## Architecture

```mermaid
flowchart LR
  subgraph Client
    UI[Next.js App]
    WS[WebSocket Client]
  end
  subgraph API[Express API]
    Auth[JWT Auth]
    Chat[Chat Routes]
    Appt[Appointments]
    WSS[WS Handler]
    AI[AI Service]
  end
  DB[(PostgreSQL)]
  OpenRouter[OpenRouter API]

  UI -->|REST| Auth
  UI -->|REST| Chat
  UI -->|REST| Appt
  WS --> WSS
  Chat --> AI
  WSS --> AI
  AI --> OpenRouter
  Auth --> DB
  Chat --> DB
  Appt --> DB
  AI --> DB
```

### Service boundaries

| Layer | Responsibility |
|-------|----------------|
| **Frontend** | Auth state, chat UX, form fallback, appointment list |
| **REST API** | Validation, auth, persistence, rate limits |
| **WebSocket** | Low-latency chat transport (mirrors REST chat logic) |
| **AI service** | Prompt + JSON extraction, logging, mock fallback |
| **PostgreSQL** | Users, sessions, messages, appointments, AI logs |

## Repository layout

```
backend/          Express + TypeScript API + WebSocket (+ Dockerfile)
frontend/         Next.js 15 App Router UI (+ Dockerfile)
database/         schema.sql, seed.sql, sample_inserts.sql
docker-compose.yml
.env.example
```

## Run the project

Copy environment variables once:

```bash
cp .env.example .env
# Add OPENROUTER_API_KEY for real LLM chat (optional — mock works without it)
```

Choose **Option A** (everything in Docker) or **Option B** (Postgres in Docker, app on your machine).

---

### Option A — Full stack with Docker (recommended for demos)

**Prerequisites:** Docker Desktop only (no local Node required).

Build and start Postgres, API, and frontend:

```bash
docker compose up --build
```

Or from repo root after `npm install`:

```bash
npm run docker:up
```

| Service   | URL |
|-----------|-----|
| Frontend  | http://localhost:3000 |
| API       | http://localhost:4000 |
| Health    | http://localhost:4000/health |

Stop all containers:

```bash
docker compose down
# or: npm run docker:down
```

Notes:

- Compose reads `.env` for `JWT_SECRET`, `OPENROUTER_*`, etc., and **overrides** `DATABASE_URL` so the backend uses the `postgres` service hostname.
- Frontend is built with `NEXT_PUBLIC_API_URL=http://localhost:4000` (browser → host ports).
- First `postgres` start applies `database/schema.sql` and `database/seed.sql`.

---

### Option B — Postgres in Docker, app locally (recommended for development)

**Prerequisites:** Node.js 20+, Docker Desktop.

**1. Start only PostgreSQL**

```bash
docker compose up -d postgres
# or: npm run db:up
```

Keep `DATABASE_URL` in `.env` pointing at **localhost**:

`postgresql://spark:spark_dev_password@localhost:5432/spark_appointments`

**2. Backend** (terminal 1)

```bash
cd backend
npm install
npm run dev
```

**3. Frontend** (terminal 2)

```bash
cd frontend
npm install
npm run dev
```

**Optional — both app processes from repo root:**

```bash
npm install
npm run dev
```

Stop Postgres when done:

```bash
docker compose stop postgres
# or: npm run db:down
```

## API overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | No | Register |
| POST | `/api/auth/login` | No | Login → JWT |
| GET | `/api/auth/me` | Yes | Current user |
| GET | `/api/appointments` | Yes | List appointments |
| POST | `/api/appointments` | Yes | Create (form/chat) |
| GET | `/api/chat/sessions` | Yes | List chat sessions |
| POST | `/api/chat/sessions` | Yes | New session |
| GET | `/api/chat/sessions/:id/messages` | Yes | History |
| POST | `/api/chat/sessions/:id/messages` | Yes | Send message + AI reply |
| WS | `/ws?token=JWT` | Yes | Real-time chat |

## Database design

See [`database/schema.sql`](database/schema.sql).

**Tables:** `businesses`, `users`, `appointments`, `chat_sessions`, `chat_messages`, `ai_interaction_logs`

**Indexing strategy (summary):**

- `users(email)` — login lookup
- `appointments(user_id, starts_at DESC)` — dashboard list
- `chat_messages(session_id, created_at)` — conversation replay
- `chat_sessions(user_id, updated_at DESC)` — recent sessions
- Partial index on `appointments(business_id, starts_at)` for optional multi-tenant queries

**Multi-tenancy:** Optional `business_id` on tenant-scoped tables; not enforced in API routes for this prototype (documented for SaaS evolution).

**Performance notes:**

- Message history capped in AI context (last 12 turns) to control token cost/latency
- Overlap check on appointment insert prevents double-booking per user
- AI logs stored as JSONB for debugging without blocking chat path

## Design decisions & tradeoffs

1. **JWT vs sessions** — JWT keeps the API stateless and simple for a prototype; refresh tokens and revocation are out of scope.
2. **WebSocket + REST** — Chat works over REST if WebSocket fails; WS is preferred for responsiveness.
3. **Structured AI JSON** — Single completion returns user-facing text + booking fields; business logic validates before persisting appointments.
4. **Explicit confirmation** — Bookings require `confirmBooking` or user confirmation to avoid accidental LLM-created appointments.
5. **Mock AI** — Without `OPENROUTER_API_KEY`, regex-based mock enables full local/demo flow without external dependencies.
6. **Monorepo folders** — Separate `frontend/` and `backend/` for clear boundaries; not a shared package workspace to reduce setup friction.

## Assumptions & limitations

- Single timezone interpretation (browser/local); no calendar provider sync (Google/Outlook)
- No email/SMS reminders, admin panel, or role-based access
- Rate limits are basic (in-memory; per-instance only)
- WebSocket auth via query token (acceptable for prototype; production would use short-lived WS tickets)
- No automated test suite (time-boxed assessment scope)
- Deployment URLs are placeholders until you deploy

## AI integration

Set `OPENROUTER_API_KEY` in `.env` ([OpenRouter](https://openrouter.ai/)). Pick any compatible model via `OPENROUTER_MODEL`. Interactions are logged to `ai_interaction_logs` and stdout.

Without a key, the mock assistant still drives the booking flow for demos.

## Deployment hints

- **DB:** Managed PostgreSQL (Neon, Supabase, RDS)
- **API:** Render/Railway/Fly — set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `OPENROUTER_API_KEY`
- **Frontend:** Vercel — set `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` (use `wss://` for production)

## License

MIT (assessment submission).
