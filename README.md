# Open Education — Backend

NestJS API for the Open Education platform: auth, courses, AI roadmaps and content generation, assessments, payments (Razorpay), object storage (MinIO), and real-time updates (Socket.IO).

**How the product fits together (architecture, flows, and motivation):** [Open Education — blog](https://aniketdutta.space/blog/open-education)

## Prerequisites

- **Node.js** 20+
- **Docker** (Postgres with pgvector, Redis, MinIO; see `docker-compose.yml`)
- For **video pipeline** features on the machine that runs the API: **FFmpeg** and **Marp CLI** (`@marp-team/marp-cli`) available on `PATH`

## Quick start

1. Copy environment file and fill secrets:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start infrastructure (database, Redis, MinIO, bucket setup, optional Pgweb):

   ```bash
   npm run dev:up
   ```

   On a **first** run with a new Postgres volume, `database/init/complete-schema.sql` is applied automatically.

4. Run the API (default port **8081**):

   ```bash
   npm run start:dev
   ```

5. Smoke check:

   ```bash
   curl http://localhost:8081/health
   ```

## Useful scripts

| Script | Purpose |
|--------|--------|
| `npm run dev:up` | Start `db`, `redis`, `minio`, `minio-setup`, `pgweb` |
| `npm run dev:down` | Stop compose stack |
| `npm run db:reset` | Drop/recreate `public` schema (destructive) |
| `npm run db:recreate` | Remove volumes and bring DB stack up fresh |

## Environment variables

Values are documented in `.env.example`. Summary:

| Variable | Required | Notes |
|----------|----------|--------|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Yes | Access + refresh token signing |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Yes for Google login | Same client as frontend `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| `FRONTEND_URL` | Recommended | Redirects and CORS-related flows (default `http://localhost:3000`) |
| `GOOGLE_CALLBACK_URL` | Optional | Default `http://localhost:8081/auth/google/callback` |
| `DATABASE_URL` **or** `DB_*` | Yes | Postgres; local Docker uses host `localhost`, port **5433** |
| `REDIS_URL` | Yes | BullMQ; local example `redis://localhost:6380` |
| `MINIO_*` | Yes | Align with MinIO root user/password and endpoints |
| `OPENAI_API_KEY` | Yes for AI | Roadmaps, embeddings, generation, buddy |
| `OPENAI_CHAT_MODEL` | No | Overrides default chat model in some services |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Yes | Loaded at startup by the payments module |
| `RESEND_API_KEY` | Only if email is integrated | Not required for basic API boot |
| `OWNER_*` / `OWNER_JWT_TOKEN` | Optional | Owner admin helpers; change defaults in production |

## Ports (local Docker)

| Service | Port |
|---------|------|
| API | 8081 |
| Postgres | 5433 → 5432 |
| Redis | 6380 → 6379 |
| MinIO API / console | 9000 / 9001 |
| Pgweb | 8083 |

## Deploying with a custom frontend URL

Update allowed origins in:

- `src/main.ts` (HTTP CORS)
- `src/modules/websocket/websocket.gateway.ts` (Socket.IO CORS)

Set `FRONTEND_URL` in `.env` to match your frontend.

## Blog

Project vision and end-to-end flows: [https://aniketdutta.space/blog/open-education](https://aniketdutta.space/blog/open-education)
