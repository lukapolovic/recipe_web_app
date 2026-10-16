# ChériChef hosting runbook

How to launch, back up, restore and run ChériChef on Supabase Free and Vercel
Hobby, on the project's `*.vercel.app` address. Work through the sections in
order the first time. Later sections are reference for running the app.

Throughout, `<ref>` is your Supabase project reference (the subdomain of the
project URL) and `<app>` is your Vercel address, for example
`cherichef.vercel.app`.

1. [Supabase project](#1-supabase-project)
2. [Auth and email](#2-auth-and-email)
3. [Vercel](#3-vercel)
4. [Backups](#4-backups)
5. [Restore](#5-restore)
6. [Restore drill](#6-restore-drill)
7. [Reading reports](#7-reading-reports)
8. [Photo cleanup](#8-photo-cleanup)
9. [Schema changes](#9-schema-changes)
10. [Pre-launch checklist](#10-pre-launch-checklist)
11. [Later (V2)](#11-later-v2)

---

## 1. Supabase project

1. Sign in at https://supabase.com/dashboard and create a new project on the
   Free plan.
   - **Region:** pick it deliberately. It is where every account, recipe and
     photo is stored, the privacy page must name it, and it cannot be changed
     later without moving to a new project. For users in Europe choose an EU
     region (for example Frankfurt, `eu-central-1`).
   - **Database password:** generate a long one and save it in your password
     manager. Backups need it.
2. Open **SQL Editor → New query**, paste the whole of `hosting/social-schema.sql`
   and run it. It should finish with "Success. No rows returned". It creates the
   tables, row-level security policies, functions (including `keepalive()`), the
   private storage bucket and its policies. Run it once on an empty project: it is
   not meant to be run twice. (If you ran an older copy before the keepalive was
   added, run only the block after the `Keepalive.` comment at the end of the
   file.)
3. Open **Storage**. Confirm the bucket `social-recipe-photos` exists and is
   marked **Private**. Do not make it public.
4. Open **Project Settings → API Keys** (or **Connect**). Note the **Project URL**
   (`https://<ref>.supabase.co`) and the **publishable key** (`sb_publishable_…`).
   Never use the secret or `service_role` key in the app; the server refuses it.

Free plan facts that shape the rest of this runbook: the project is paused after
7 days without activity (section 3 adds a daily keepalive), and the Free plan has
no backups (section 4 adds a weekly one).

## 2. Auth and email

### URLs

**Authentication → URL Configuration**

- **Site URL:** `https://<app>`
- **Redirect URLs:** add `https://<app>` and `https://<app>/**`

Confirmation links in emails go to the Site URL, so it must be the live address.

### Email confirmation

**Authentication → Sign In / Providers → Email**: keep **Confirm email** turned
on. New accounts cannot sign in until they click the link.

### Custom SMTP with a dedicated Gmail account

Supabase's built-in mailer only sends to your own team's addresses, so real
users need custom SMTP.

1. Create a new Gmail account used only for ChériChef mail (for example
   `cherichef.app@gmail.com`). Do not use your personal account.
2. In that account: **Google Account → Security → 2-Step Verification**, turn it
   on (an app password requires it).
3. **Google Account → Security → App passwords** (or
   https://myaccount.google.com/apppasswords): create one named "Supabase". Copy
   the 16-character password; Google shows it once.
4. In Supabase: **Authentication → Emails → SMTP Settings**, enable custom SMTP:
   - Sender email: the Gmail address
   - Sender name: `ChériChef`
   - Host: `smtp.gmail.com`
   - Port: `587`
   - Username: the Gmail address
   - Password: the app password
   - Minimum interval between emails: leave the default
5. **Authentication → Rate Limits**: set **Rate limit for sending emails** to
   about **30 per hour**. It protects the Gmail account (a consumer account can
   send roughly 500 messages a day and Google may lock it if it looks like spam).
6. Optional: under **Authentication → Emails → Templates**, put "ChériChef" in
   the subjects of "Confirm signup" and "Reset password".
7. Test: sign up on the live app with an address you own, check the email
   arrives (and not in spam), click the link, sign in.

There is no CAPTCHA in v1. If signups get abused, the email rate limit caps the
damage; Turnstile is on the V2 list.

## 3. Vercel

1. Go to https://vercel.com/new, import the GitHub repository
   `lukapolovic/recipe_web_app`. Framework preset: **Other**. Leave the build and
   output settings alone: `vercel.json` sets them (`npm run build`, output
   `public`).
2. Before the first deploy, add **Environment Variables** (Production and
   Preview):

   | Name | Value |
   | --- | --- |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key |
   | `CRON_SECRET` | a random string, for example from `openssl rand -hex 32` |

   Do not set `NODE_ENV=production` as a build variable: the build runs the test
   suite, which needs the dev dependencies.
3. Deploy. The build runs `npm test` and `scripts/check-hosting.js`; any failure
   stops the deploy and the previous one stays live.
4. Check the cron: **Project → Settings → Cron Jobs** should list
   `/api/cron/keepalive` with schedule `17 6 * * *` (daily, 06:17 UTC; Hobby
   runs it some time within that hour). Crons only run on the production
   deployment.
5. Check the keepalive by hand:

   ```bash
   curl -s -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/keepalive
   ```

   Expect `{"ok":true,"at":"…"}`. Without the header it must answer 401. It
   calls the `public.keepalive()` SQL function through the publishable key, so
   each run is a real query in Postgres and the project counts as active. After
   a day, **Logs** in Vercel should show the cron request with status 200.

If the project ever does get paused, restore it from the Supabase dashboard
(**Restore project**); data is kept, and the keepalive resumes the next day.

## 4. Backups

`.github/workflows/backup.yml` runs every Sunday at 03:41 UTC and on demand. It:

1. dumps the `public`, `auth` and `storage` schemas with `pg_dump` 17 (custom
   format), streamed straight into `age` so no plaintext copy is written;
2. downloads the `social-recipe-photos` bucket through Supabase's S3 endpoint,
   tars it and encrypts it with `age`;
3. uploads only the two `.age` files as a workflow artifact kept for 90 days;
4. then deletes unattached photo drafts older than 7 days (section 8).

The repository is public, so **anyone signed in to GitHub can download the
artifacts**. They are useless without your private key, which is why the key is
never committed and the workflow refuses to run with the placeholder recipient.

The other Postgres schemas (extensions, realtime, vault and so on) are created
and managed by Supabase, hold no app data and are partly unreadable to the
`postgres` role, so they are not dumped.

### 4.1 Create the encryption key

On your own computer (`brew install age`, or see https://age-encryption.org):

```bash
age-keygen -o cherichef-backup.key
```

It prints `Public key: age1…`. Then:

1. Put that `age1…` line in `hosting/backup-recipient.txt` in place of the
   `PLACEHOLDER-…` line (keep the comments), commit and push.
2. Store the private key file `cherichef-backup.key` in **two** separate places,
   for example your password manager (as a secure note or attachment) and an
   encrypted USB stick kept at home. **If the private key is lost, every backup
   is unreadable.** Never commit it, email it or put it in GitHub secrets.
3. Delete any other copies, for example from `Downloads`.

### 4.2 Database connection string (Session pooler)

GitHub's runners have no IPv6, and on the Free plan the direct database
connection is IPv6-only, so the workflow must use the **Session pooler**.

1. In Supabase, click **Connect** (top of the project page) → **Connection
   string** → **Session pooler**.
2. Copy the URI. It looks like
   `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
3. Replace `[YOUR-PASSWORD]` with the database password. If the password
   contains characters such as `@ : / ? # %`, percent-encode them (or reset the
   password to letters and digits only under **Project Settings → Database**).
4. Append `?sslmode=require`.

Use port **5432** (session mode), not 6543 (transaction mode): `pg_dump` needs a
session.

### 4.3 Storage S3 access keys

1. **Project Settings → Storage → S3 Connection**: make sure the S3 protocol
   connection is enabled. Note the **Endpoint**
   (`https://<ref>.storage.supabase.co/storage/v1/s3`) and **Region**.
2. Under **S3 Access Keys**, click **New access key**, name it "GitHub backup",
   and copy the **Access key ID** and **Secret access key** (shown once).

These keys can read and delete every object in every bucket, ignoring
row-level security. Keep them only in GitHub secrets. If they leak, delete them
here and create new ones.

### 4.4 GitHub secrets

In GitHub: **repository → Settings → Secrets and variables → Actions → New
repository secret**. Add:

| Secret | Value |
| --- | --- |
| `SUPABASE_DB_URL` | the Session pooler URI from 4.2 |
| `SUPABASE_S3_ENDPOINT` | the S3 endpoint from 4.3 |
| `SUPABASE_S3_REGION` | the S3 region from 4.3 |
| `SUPABASE_S3_ACCESS_KEY_ID` | access key ID from 4.3 |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | secret access key from 4.3 |

Secrets are not passed to workflows triggered from forks, and GitHub masks
their values in logs.

### 4.5 Run it once

1. **Actions → Backup → Run workflow**. For the first run you can untick the
   cleanup option.
2. It should finish green within a few minutes. The run summary lists the two
   encrypted files with their sizes and the photo counts. A warning that the
   object count differs from the `social_photos` row count is expected only if
   someone uploaded a photo during the run.
3. Download the artifact and check you can decrypt it (section 5, steps 1–2),
   then delete the plaintext.

### 4.6 Keep it running

- GitHub **disables scheduled workflows in public repositories after 60 days
  without repository activity** and emails you a warning first. When that email
  comes, push any commit or re-enable the workflow under **Actions → Backup**.
  The Vercel keepalive does not count as repository activity.
- Each week, glance at **Actions → Backup** or rely on GitHub's failure emails
  (on by default for workflows you trigger or own).
- Artifacts expire after 90 days, so there are always about 13 weekly backups.
  For a long-term copy, download one now and then and keep it with your files
  (it is already encrypted).

## 5. Restore

Use this to recover into a new or replacement Supabase project. You need the
private key, the `age`, `psql`/`pg_restore` (version 17) and `aws` command line
tools, and a scratch directory on an encrypted disk. Plaintext files below
contain every account and recipe: delete them when you are done.

```bash
brew install age awscli libpq
```

```bash
export PATH="$(brew --prefix libpq)/bin:$PATH"
```

### 5.1 Get and decrypt the backup

1. In GitHub, open **Actions → Backup**, pick the run, and download the
   `backup-<date>` artifact (a zip). Unzip it into an empty directory, giving
   `database-<date>.dump.age` and `photos-<date>.tar.age`. (Or:
   `gh run download <run-id> --repo lukapolovic/recipe_web_app`.)
2. Decrypt:

   ```bash
   age -d -i ~/path/to/cherichef-backup.key -o database.dump database-*.dump.age
   ```

   ```bash
   mkdir photos && age -d -i ~/path/to/cherichef-backup.key photos-*.tar.age | tar -x -C photos
   ```

   `pg_restore -l database.dump | head` should list the archive contents.

### 5.2 Prepare the target project

1. Create the target Supabase project (section 1, steps 1–3): run the current
   `hosting/social-schema.sql`, plus any `hosting/migrations/` files not yet
   folded into it. This recreates tables, policies, functions, grants and the
   bucket exactly as the code expects.
2. Get the target's Session pooler URI (section 4.2) and S3 keys (section 4.3):

   ```bash
   export TARGET_DB_URL='postgresql://postgres.<target-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require'
   ```

### 5.3 Restore the data

Restore the app tables in `public` and the accounts in `auth.users` and
`auth.identities` (so everyone keeps their password). The rest of `auth`
(sessions, tokens, logs) and `storage` are not restored: people sign in again,
and storage metadata is recreated when the photos are uploaded in 5.4.

```bash
pg_restore -l database.dump | grep -E 'TABLE DATA (public [a-z_]+|auth (users|identities)) ' > data.list
```

```bash
pg_restore --data-only --use-list=data.list --file=data.sql database.dump
```

```bash
sed -i.orig '/^SET transaction_timeout/d' data.sql
```

(The `sed` removes a setting `pg_restore` 17 writes that Postgres 15 does not
know. It is harmless on 17.)

```bash
psql "$TARGET_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -c 'SET session_replication_role = replica' -f data.sql
```

`session_replication_role = replica` turns off triggers and foreign-key checks
while loading, so table order does not matter and the new-user trigger does not
create duplicate profiles. Everything loads in one transaction: on any error,
nothing is changed and you can fix the cause and rerun. If it fails on an
`auth` table because the target's newer Auth version changed a column, compare
`\d auth.users` in both projects and edit the column list of that `COPY` line in
`data.sql`. Every app table points at `auth.users`, so accounts must be restored
with their original ids. Finding problems like this early is what the restore
drill is for.

Check the counts against the source (or the backup summary):

```bash
psql "$TARGET_DB_URL" -X -c 'select (select count(*) from auth.users) users, (select count(*) from public.cookbooks) cookbooks, (select count(*) from public.cookbook_recipes) recipes, (select count(*) from public.social_photos) photos'
```

### 5.4 Re-upload the photos

```bash
export AWS_ACCESS_KEY_ID='<target access key id>' AWS_SECRET_ACCESS_KEY='<target secret>' AWS_REGION='<target region>'
```

```bash
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
```

```bash
aws configure set default.s3.addressing_style path
```

```bash
aws s3 cp photos/ s3://social-recipe-photos/ --recursive --content-type image/webp --endpoint-url 'https://<target-ref>.storage.supabase.co/storage/v1/s3'
```

Object keys keep their `<owner>/<photo>.webp` paths, which is what
`public.social_photos.path` points to, so no database changes are needed.

### 5.5 Switch the app over (real recovery only)

1. In Vercel, change `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the new
   project and redeploy.
2. Redo section 2 (URLs, SMTP, rate limit) on the new project.
3. Update the GitHub secrets (4.2–4.4) to the new project and run the backup
   once.
4. Delete the plaintext: `rm -rf database.dump data.sql data.sql.orig data.list photos`.

## 6. Restore drill

Do this once **before launch**, and again after any large schema change. An
untested backup is not a backup.

1. Put some real-looking data in production: two accounts, a shared cookbook,
   a few recipes with photos, a review.
2. Run the Backup workflow (with cleanup off).
3. Create a scratch Supabase project (the Free plan allows two active projects).
4. Follow section 5 in full into the scratch project (skip 5.5).
5. Point a local copy of the app at it: in `.env` set `SUPABASE_URL` and
   `SUPABASE_PUBLISHABLE_KEY` to the scratch project, then `npm start`.
   Before signing in, in the scratch project add `http://127.0.0.1:3000` to
   **Authentication → URL Configuration → Redirect URLs**.
6. Sign in with one of the production accounts and its existing password.
   Check the cookbook, recipes, photos, review and partner are all there.
7. Write the date and anything that went wrong at the bottom of this file.
8. Delete the plaintext files, remove the scratch values from `.env`, and delete
   the scratch project (**Project Settings → General → Delete project**).

## 7. Reading reports

People can report profiles, cookbooks, recipes, reviews and replies. Reports go
to `public.reports` and are only visible to you in the Supabase dashboard
(reporters only see their own). Check weekly, or more often after launch.

**SQL Editor**, newest first, with the reporter:

```sql
select r.created_at, r.reason, r.target_type, r.target_id, r.note, p.username as reporter
from public.reports r
join public.profiles p on p.id = r.reporter_id
order by r.created_at desc
limit 100;
```

Most-reported items:

```sql
select target_type, target_id, count(*) as reports, array_agg(distinct reason) as reasons, max(created_at) as latest
from public.reports
group by target_type, target_id
order by reports desc, latest desc
limit 50;
```

To see what was reported, look the id up in the matching table:
`public.profiles`, `public.cookbooks`, `public.cookbook_recipes`,
`public.recipe_reviews` or `public.review_replies` (`where id = '<target_id>'`).
To take content down, delete that row in the SQL editor. Photos that become
unattached that way are removed by the weekly cleanup after 7 days. Reports keep
plain ids, so they remain after the content is gone.

## 8. Photo cleanup

Photos are uploaded as drafts before a recipe or cover is saved. A draft that
is never attached (an abandoned edit) is a row in `public.social_photos` that no
`cookbook_recipes.image_id` and no `cookbooks.cover_image_id` refers to. After
each successful backup, the workflow:

1. deletes draft rows older than 7 days in one statement that re-checks they are
   still unattached. Because recipes and covers reference photos with foreign
   keys, a deleted row can never be attached afterwards, and a photo attached
   while the job runs is not deleted;
2. deletes the storage objects of exactly those rows;
3. also deletes objects older than 7 days that have no `social_photos` row at all
   (left by an interrupted cleanup, a failed upload, or an account deletion that
   could not remove its files). If that number is unexpectedly high (more than
   25, or a tenth of the bucket), it deletes none of them and warns instead.
   Check by hand before deleting anything:

   ```sql
   select count(*) from public.social_photos;
   ```

   and compare with the object count in the run summary.

Run the workflow with cleanup unticked to skip all of this.

## 9. Schema changes

`hosting/social-schema.sql` always describes a fresh, complete database. Live
databases are upgraded with numbered migration files.

1. Write `hosting/migrations/00N-short-name.sql` (next free number). It must be
   **idempotent** (safe to run twice) and must apply on top of the current
   `social-schema.sql`:
   - `create table if not exists`, `alter table … add column if not exists`,
     `create index if not exists`;
   - `create or replace function` (keeps existing grants), followed by explicit
     `revoke … from public, anon` / `grant … to authenticated` as needed;
   - `drop policy if exists … ; create policy …`;
   - data fixes written so a second run changes nothing;
   - wrap it in `begin; … commit;` so a failure leaves nothing half-done.
2. Add a PGlite test in `test/` that loads `social-schema.sql`, applies the
   migration **twice**, and asserts the result (see
   `test/photo-cleanup.test.js` for the setup of Supabase's `auth`/`storage`
   stand-ins).
3. Fold the same change into `social-schema.sql` so new projects get it, and
   run `npm test`: the RLS tests run against the folded schema.
4. Before running it on production, run the Backup workflow. Then paste the
   migration into the Supabase **SQL Editor** and run it. Deploy the code that
   needs it afterwards.
5. Keep the migration file in the repository: a restore uses
   `social-schema.sql`, but an older project may still need the file.

## 10. Pre-launch checklist

Supabase

- [ ] Project created in the chosen region; region named on the privacy page
- [ ] `hosting/social-schema.sql` run; bucket `social-recipe-photos` is private
- [ ] Site URL and redirect URLs set to `https://<app>`
- [ ] Confirm email on; custom SMTP via the dedicated Gmail account (app password,
      `smtp.gmail.com:587`, sender name ChériChef); test email received
- [ ] Email rate limit about 30/hour
- [ ] Database password and Gmail app password stored in the password manager

Vercel

- [ ] `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CRON_SECRET` set
- [ ] Production deploy green (tests ran in the build)
- [ ] Cron Jobs lists `/api/cron/keepalive`; manual `curl` returns `ok`; without
      the secret it returns 401
- [ ] Sign up, confirm, sign in, create a cookbook, invite a partner, import a
      recipe with a photo, review it, delete a test account

Backups

- [ ] Real age public key committed in `hosting/backup-recipient.txt`
- [ ] Private key stored in two places
- [ ] Five GitHub secrets set
- [ ] Backup workflow run manually and green; artifact decrypts
- [ ] Restore drill (section 6) done and dated below
- [ ] Tests workflow green on `main`

Safety

- [ ] Privacy and terms pages reviewed and reachable from the app
- [ ] You know how to read reports (section 7) and take content down

## 11. Later (V2)

- Report queue, blocking and admin tools instead of SQL in the dashboard
- Cloudflare Turnstile on signup
- Per-user rate limit for recipe imports
- Measured evaluation of calling Supabase directly with supabase-js instead of
  proxying through the server
- Own domain, and transactional email through Resend instead of Gmail

---

## Restore drill log

| Date | Backup used | Result / notes |
| --- | --- | --- |
| | | |
