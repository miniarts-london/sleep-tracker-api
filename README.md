# Sleep tracker API

A small REST API for logging how many hours people sleep each night.
Built with Node, Express 5, TypeScript and PostgreSQL.

Live: https://sleep-tracker-api.vercel.app

## Endpoints

| Method | URL | What it does |
|---|---|---|
| GET | `/health` | Checks the server is up. Doesn't touch the database. |
| POST | `/api/entries` | Adds an entry. |
| GET | `/api/entries` | Lists each user once, with how many entries they have. |
| GET | `/api/users/:userId/entries` | Lists one user's entries, newest date first. |
| GET | `/api/users/:userId/entries/:date` | Gets one user's entry for one date. |

### Adding an entry

```bash
curl -X POST http://localhost:3001/api/entries \
  -H "Content-Type: application/json" \
  -d '{"user_id":"kaori","first_name":"Kaori","last_name":"Nishimura","sleep_time":7.5,"date":"2026-11-06"}'
```

| Field | Rule |
|---|---|
| `user_id` | Text, 1 to 50 letters, numbers, `-` or `_`. For example `kaori` or `user-42`. |
| `first_name`, `last_name` | Text, 1 to 50 characters. Spaces at either end are trimmed. |
| `sleep_time` | A number (not a string) from 1 to 24, in steps of 0.5. For example `7.5`. |
| `date` | A real date in `YYYY-MM-DD` format. |

Each user can have only one entry per date.

### Responses

| Status | When |
|---|---|
| `200` | Success. An empty list (`[]`) is still a success. |
| `201` | The entry was created. |
| `400` | The input is invalid. `details` lists every problem. |
| `404` | No entry for that user and date, or an unknown URL. |
| `409` | That user already has an entry for that date. |
| `500` | Something failed on the server. The real error is logged on the server, never sent to the client. |

Adding an entry (`201`, `400` or `409`) and any invalid URL (`400`) return this shape:

```json
{ "success": true, "details": null }
```

```json
{
  "success": false,
  "details": [
    { "fieldName": "user_id", "message": "user_id must be 1 to 50 letters, numbers, - or _" },
    { "fieldName": "sleep_time", "message": "sleep_time must be a number from 1 to 24, in steps of 0.5" }
  ]
}
```

`details` has one item for every invalid field. `fieldName` is the JSON key for body fields (such as `user_id`) or the URL part for URL fields (`userId`, `date`). A duplicate entry (`409`) is reported against `date`.

Successful GET requests return the data itself: a list, or a single entry. Other errors (`404`, `500`, or invalid JSON) return `{ "error": "..." }`.

## Running it locally

You need Node 22.18 or later. The project runs TypeScript directly, with no build step. You also need PostgreSQL. On macOS: `brew install postgresql@17`.

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Create a database:**
   ```bash
   createdb Tracker
   ```
   Database names are case-sensitive, so `Tracker` and `tracker` are different databases.
3. **Configure your environment.** Copy `.env.example` to `.env.local` and set the connection string:
   ```
   DATABASE_URL=postgresql://<your-mac-username>@localhost:5432/Tracker
   ```
4. **Create the table:**
   ```bash
   npm run db:setup
   ```
5. **Start the server:**
   ```bash
   npm run dev
   ```
   The API runs at http://localhost:3001, unless you set `PORT`.

## Environment variables

Values go in `.env` or `.env.local`; `.env.local` wins if both set the same name. Both files are git-ignored. Never commit them. `.env.example` lists the names only.

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. |
| `POSTGRES_URL` | Used if `DATABASE_URL` isn't set. This is the name Vercel's Neon integration uses. |
| `PORT` | Port to listen on. Defaults to `3001`. |
| `CORS_ORIGINS` | Extra front-end sites allowed to call the API from a browser, separated by commas. For example `https://my-app.vercel.app`. Any `http://localhost:<port>` and the deployed front-end (`https://sleep-tracker-ruddy.vercel.app`, set in `src/middleware/cors.ts`) are always allowed. |

The server reads these only when it starts. After changing one, stop the server with Ctrl+C and run `npm run dev` again.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Starts the server and restarts it whenever a code file changes. |
| `npm test` | Runs the tests (Vitest and supertest). They use a fake database, so no Postgres is needed. |
| `npm run typecheck` | Checks types with `tsc`. |
| `npm run db:setup` | Creates the `sleeper` table from `src/db/schema.sql`. Safe to run more than once. |

## Project structure

```
src/
  server.ts            starts the server (app.listen)
  app.ts               Express app: middleware, routes, 404, error handler
  routes/              maps URLs to controller functions
  controllers/         validation, SQL queries and responses
  middleware/
    cors.ts            allows browser requests from approved sites
    errorHandler.ts    the one central error handler
  db/
    pool.ts            the shared Postgres connection pool
    schema.sql         the table definition
    setup.ts           runs schema.sql
    migrations/        changes to tables that already exist
tests/                 one test file per area
```

All SQL uses parameters (`$1`, `$2`, ...). User input is never inserted into the SQL text itself.

## Database changes (migrations)

`schema.sql` uses `CREATE TABLE IF NOT EXISTS`, so it does nothing to a table that already exists. When the table's design changes, a migration file in `src/db/migrations/` updates existing databases. Run each migration once on every database, both locally and in production.

```bash
psql -d Tracker -f src/db/migrations/001-user-id-text.sql
```

For the hosted database, paste the file into Neon's SQL Editor and run it.

| Migration | Change |
|---|---|
| `001-user-id-text.sql` | Changes `user_id` from a number to text. Existing ids are kept. |

## Deploying to Vercel

Vercel detects the Express app exported from `src/app.ts` and deploys it whenever you push to GitHub.

1. **Connect a database.** In Vercel, go to Storage, then Create Database, choose Neon (Postgres) and connect it to this project. This sets `POSTGRES_URL`.
2. **Allow your front-end.** `https://sleep-tracker-ruddy.vercel.app` is already allowed in `src/middleware/cors.ts`. For any other site, add `CORS_ORIGINS` under Settings, then Environment Variables, using the site's exact address.
3. **Redeploy.** Changes to environment variables only apply to new deployments.
4. **Create the table.** Paste `src/db/schema.sql` into Neon's SQL Editor and run it, plus any migrations that the database hasn't had yet.

## Troubleshooting

| Problem | Likely cause |
|---|---|
| `Internal server error` | Look in the terminal running `npm run dev`, or in Vercel's Logs; the real error is printed there. |
| `EADDRINUSE` when starting | Another server is already using the port. Find it with `lsof -i :3001`, then `kill <PID>`. |
| A changed `.env` value has no effect | Restart the server. It reads environment files only at startup. |
| CORS error in the browser | The front-end's address isn't allowed: it isn't in `src/middleware/cors.ts` or `CORS_ORIGINS`, or the API hasn't been redeployed since you added it. CORS only applies to requests the browser makes. A fetch from a server, or from `curl`, never hits it. |
| `FUNCTION_INVOCATION_FAILED` on Vercel | The app crashed at startup. This is usually because no database connection string is set. |
| A process won't stop | It may be paused (Ctrl+Z), not stopped. Type `fg` to resume it, then press Ctrl+C. |
