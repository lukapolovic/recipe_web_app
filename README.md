# ChériChef

A social cookbook for couples and close friends. Two people share a cookbook,
import recipes from a link or pasted text, plan meals and build a shopping list
together, follow friends' cookbooks and leave reviews.

The frontend is plain JavaScript in `public/`. A small Node.js server
(`server.js`) serves it and proxies account and cookbook requests to Supabase
(Postgres, Auth and Storage) using the publishable key, with row-level security
deciding what each person can see.

## Run it locally

Requires Node.js 24.

```bash
npm install
```

```bash
npm run dev
```

Open http://127.0.0.1:3000. Without a `.env` file the app runs as an offline
demo: no accounts, nothing leaves your machine, and no configuration is needed.
To work against a real Supabase project, copy `.env.example` to `.env` and fill
in `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.

## Test

```bash
npm test
```

The tests run the real schema in PostgreSQL compiled to WebAssembly (PGlite), so
no database or network is needed. They also run on every push in GitHub Actions
and as part of `npm run build`, so a failing test blocks a Vercel deploy.

## Project layout

| Path | What it is |
| --- | --- |
| `public/` | The browser app: HTML, CSS, JavaScript, fonts and demo assets |
| `server.js` | HTTP server: static files, recipe import, photos, the `/api` routes and the keepalive cron |
| `api/index.js` | Vercel function entry; wraps `server.js` |
| `social-api.js` | Supabase adapter: auth, cookbooks, recipes, reviews, friends, photos |
| `recipe-import.js`, `public-fetch.js` | Recipe extraction from links and pasted text, with safe fetching |
| `recipe-model.js`, `meal-plan.js`, `images.js`, `recipe-photos.js` | Validation, meal planner, photo normalisation and storage |
| `hosting/social-schema.sql` | The complete database schema, policies and storage bucket |
| `hosting/migrations/` | Upgrades for databases created from an older schema |
| `hosting/RUNBOOK.md` | Hosting, backups, restore and operations |
| `.github/workflows/` | Tests on every push; weekly encrypted backup |
| `scripts/check-hosting.js` | Build-time check of the Vercel configuration |
| `test/` | `node --test` suites |

## Hosting and operations

Everything needed to launch and run the hosted app (Supabase, email, Vercel,
backups, restore, reports, schema changes and the pre-launch checklist) is in
[hosting/RUNBOOK.md](hosting/RUNBOOK.md).
