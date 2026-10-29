# ChériChef hosting runbook

How to launch, back up, restore and run ChériChef on a single server you rent,
with everything on it open source:

- **[Coolify](https://github.com/coollabsio/coolify)** (Apache-2.0) is the
  self-hosted replacement for Vercel. It builds the app from this repository's
  `Dockerfile` on every push, gives it HTTPS, keeps old builds for rollback and
  shows logs.
- **[Supabase](https://github.com/supabase/supabase)** (Apache-2.0) is the same
  Postgres, Auth and Storage the app used on supabase.com, run from Coolify's
  official Supabase template. The app talks to it exactly as before: nothing in
  `social-api.js` or `hosting/social-schema.sql` changes.

Work through the sections in order the first time. Later sections are reference
for running the app.

Throughout, `<domain>` is your domain, `<app>` is the app's address (for example
`cherichef.example.com`), `<supabase>` is the Supabase address (for example
`supabase.example.com`) and `<server>` is the server's IP address.

```
              ┌────────────────────── your server ───────────────────────┐
browser ──https──▶ Traefik (Coolify proxy)                                │
              │     ├─ <app>      ─▶ ChériChef (Dockerfile, Node 24)      │
              │     │                    │ https, publishable/anon key    │
              │     └─ <supabase> ─▶ Kong ─▶ Auth · REST · Storage ─▶ Postgres
              │                                          └─▶ MinIO (photos)│
              └───────────────────────────────────────────────────────────┘
GitHub Actions ─ssh (forced command)─▶ pg_dump    ─https─▶ Storage S3 endpoint
```

1. [Server and Coolify](#1-server-and-coolify)
2. [Supabase](#2-supabase)
3. [Auth and email](#3-auth-and-email)
4. [The app](#4-the-app)
5. [Backups](#5-backups)
6. [Restore](#6-restore)
7. [Restore drill](#7-restore-drill)
8. [Updates and upkeep](#8-updates-and-upkeep)
9. [Reading reports](#9-reading-reports)
10. [Photo cleanup](#10-photo-cleanup)
11. [Schema changes](#11-schema-changes)
12. [Pre-launch checklist](#12-pre-launch-checklist)
13. [Later (V2)](#13-later-v2)

---

## 1. Server and Coolify

### 1.1 Rent a server

Any VPS provider works, including the free Oracle Cloud server in
[1.5](#15-oracle-cloud-always-free). What the stack needs:

- **At least 4 GB RAM and 2 vCPU** (the Supabase containers alone use about
  2–3 GB), 40 GB or more of disk, x86-64 or ARM64.
- **Ubuntu 24.04 LTS.**
- **Location:** pick it deliberately. It is where every account, recipe and
  photo is stored, and the privacy page must name it and the provider. For users
  in Europe choose an EU data centre (for example Hetzner in Falkenstein,
  Nuremberg or Helsinki).

Add your SSH public key when you create the server, so it never has a root
password login.

### 1.2 Domain and DNS

HTTPS needs a real domain (Let's Encrypt will not issue certificates for a bare
IP). Buy one, then at your DNS provider add three **A** records pointing at
`<server>`:

| Name | Used for |
| --- | --- |
| `app` (or `@`) | ChériChef itself, `<app>` |
| `supabase` | Supabase API and Studio, `<supabase>` |
| `coolify` | The Coolify dashboard |

### 1.3 Harden the server

On Oracle Cloud, follow [1.5](#15-oracle-cloud-always-free) instead of this
section. Otherwise SSH in as root (`ssh root@<server>`), then:

```bash
apt update && apt -y full-upgrade && apt -y install unattended-upgrades ufw
```

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 8000/tcp && ufw --force enable
```

Port 8000 is the Coolify dashboard until it has its own domain (1.4 step 4);
close it afterwards. Docker publishes container ports around `ufw`, so never map
a database or MinIO port to the host in Coolify.

In `/etc/ssh/sshd_config` make sure `PasswordAuthentication no` is set, then
`systemctl reload ssh`.

### 1.4 Install Coolify

1. Read the installer first (https://coolify.io/docs/get-started/installation),
   then run it as root:

   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```

2. **Straight away** open `http://<server>:8000` and create the admin account.
   The first person to open that page becomes the admin, so do not leave it
   unclaimed. Use a long generated password and turn on two-factor
   authentication under your profile.
3. **Settings**: turn **off** registration ("Registration Allowed"), so nobody else can
   create an account.
4. **Settings → Instance's Domain**: `https://coolify.<domain>`.
   Save, open the dashboard there, then on the server close the temporary port:
   `ufw delete allow 8000/tcp`.
5. **Settings → Updates**: turn on auto-update. Coolify had a batch of security
   advisories in 2026 (most need a logged-in user, which is why registration is
   off); staying current matters more than with a hosted service.
6. **Servers → localhost**: Coolify installed Traefik as the proxy. Leave it on.

### 1.5 Oracle Cloud Always Free

Oracle's Always Free tier includes an Arm (Ampere A1) server that is big enough
for this stack and costs nothing. The image builds and runs on Arm. Four things
differ from a normal VPS: the account, Oracle's own firewall, the login user and
idle reclamation.

**Limits.** In 2026 Oracle reduced the free A1 allowance to **2 OCPU and 12 GB
RAM** in total (it used to be 4 and 24), plus 200 GB of block storage. Check
**Governance → Limits, Quotas and Usage** (service *Compute*, `standard-a1`
limits) before creating anything, and never go over: a tenancy over its free
limit can have *all* of its A1 instances disabled.

**Account.**

1. Sign up at https://signup.cloud.oracle.com. A card is needed to verify you.
2. **Home region** cannot be changed later, and free A1 servers can only be
   created there. Pick an EU region for the privacy page. The most popular
   regions (Frankfurt, London, Amsterdam) are often out of A1 capacity, so a
   quieter EU region can be easier.
3. **Upgrade to Pay As You Go** (**Billing & Cost Management → Upgrade and
   Manage Payment**). Always Free resources stay free, but on a free-tier
   account Oracle *reclaims* instances that look idle for 7 days (CPU, network
   and memory below roughly 15%), which a quiet app will do. Paid accounts are
   not reclaimed and usually get A1 capacity more easily. The upgrade can take
   a while to be approved, and the card may see a temporary hold.
4. Right away, **Billing & Cost Management → Budgets → Create Budget**: monthly,
   amount `1` (in your currency), alert rule at 1% of actual spend, sent to your
   email. Any charge at all means something outside the free tier was created.

**Network.**

1. **Networking → Virtual Cloud Networks → Start VCN Wizard → Create VCN with
   Internet Connectivity**. Name it `cherichef`, keep the defaults, create.
2. Open the VCN → **Security Lists → Default Security List for cherichef →
   Add Ingress Rules**: source `0.0.0.0/0`, TCP, destination ports `80`, `443`
   and `8000` (three rules, or one rule with `80,443,8000`). Port 22 is already
   open. Remove the `8000` rule once Coolify has its own domain (1.4 step 4).

**Server.**

1. **Compute → Instances → Create instance**, name `cherichef`.
2. **Image and shape**: image **Canonical Ubuntu 24.04** (the aarch64 build is
   chosen automatically), shape **Ampere → VM.Standard.A1.Flex** with
   **2 OCPU and 12 GB** (or less, if other A1 instances already use some).
3. **Networking**: the `cherichef` VCN's public subnet, **Automatically assign
   public IPv4 address** on.
4. **SSH keys**: upload your public key (for example `~/.ssh/id_ed25519.pub`).
5. **Boot volume**: set the size to `100` GB (within the free 200 GB).
6. **Create**. If it says *Out of capacity for shape VM.Standard.A1.Flex*, try
   another availability domain (if your region has more than one), try again a
   few hours later, or create it with 1 OCPU / 6 GB and resize it later
   (**Edit → Shape**).
7. Note the **Public IP address** and use it as `<server>` in 1.2.

**Prepare it.** The login user is `ubuntu`, not root. Wherever this runbook
says `ssh root@<server>` or "as root on the server", use `ssh ubuntu@<server>`
and then `sudo -i`.

```bash
ssh ubuntu@<server>
```

```bash
sudo apt update && sudo apt -y full-upgrade && sudo apt -y install unattended-upgrades
```

Oracle's Ubuntu image has its own `iptables` rules that block every incoming
port except 22, on top of the security list. Do not install `ufw` (it fights
with these rules); open the web ports in the existing rules instead:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
```

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
```

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8000 -j ACCEPT
```

```bash
sudo netfilter-persistent save
```

Password login is already off on Oracle's images. Then install Coolify as in
1.4, with `sudo`:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

When 1.4 step 4 says to close port 8000, delete the `8000` ingress rule from the
security list (that is enough; the `iptables` rule can stay).

Finally let `ubuntu` run Docker commands, which the restore steps (section 6)
use over SSH:

```bash
sudo usermod -aG docker ubuntu
```

In section 6 use `TARGET_SSH='ubuntu@<server>'`.

**Domain.** A paid domain works best. For a free option, create two
subdomains at https://www.duckdns.org (for example `cherichef` and
`cherichef-db`), point both at `<server>`, and use `cherichef.duckdns.org` as
`<app>` and `cherichef-db.duckdns.org` as `<supabase>`. Let's Encrypt issues
certificates for them. The Coolify dashboard can stay on
`http://<server>:8000` with only your IP allowed in the security list (source
`<your IP>/32` instead of `0.0.0.0/0`) if you do not want a third subdomain.

## 2. Supabase

1. In Coolify: **Projects → + Add** a project called `cherichef`, open its
   `production` environment, **+ New → Service**, search **Supabase** and add it.
2. Before the first deploy, open the service:
   - **Supabase Kong → Domains**: `https://<supabase>:8000` (the `:8000` tells
     the proxy which container port to use; the public address is plain
     `https://<supabase>`).
   - **Environment Variables**: Coolify has already generated every
     `SERVICE_PASSWORD_*`, JWT and key. Set or change these:

     | Variable | Value |
     | --- | --- |
     | `POSTGRES_DB` | `postgres` (Coolify refuses to save the service, with "The Database Name field is required", while this is empty) |
     | `API_EXTERNAL_URL` | `https://<supabase>` (the default is an internal address, and email links would break) |
     | `GOTRUE_SITE_URL` | `https://<app>` |
     | `ADDITIONAL_REDIRECT_URLS` | `https://<app>,https://<app>/**` |
     | `ENABLE_EMAIL_SIGNUP` | `true` |
     | `ENABLE_EMAIL_AUTOCONFIRM` | `false` (new accounts must click the link) |
     | `DISABLE_SIGNUP` | `false` |

     The SMTP variables are set in section 3.
3. **Edit Compose File** and add two lines to the `environment:` lists (keep the
   indentation of the lines around them):
   - under `supabase-auth`:

     ```yaml
     - GOTRUE_RATE_LIMIT_EMAIL_SENT=30
     ```

     (emails per hour; protects the Gmail account in section 3)
   - under `supabase-storage`:

     ```yaml
     - S3_PROTOCOL_ACCESS_KEY_ID=${SERVICE_USER_S3PROTOCOL}
     - S3_PROTOCOL_ACCESS_KEY_SECRET=${SERVICE_PASSWORD_64_S3PROTOCOL}
     ```

     (turns on the S3 endpoint the backups use; Coolify generates both values)

   Save. Do not add a `ports:` mapping to any service.
4. **Deploy** and wait until every container is healthy (a few minutes the
   first time).
5. Open `https://<supabase>`. Studio asks for a username and password: they are
   `SERVICE_USER_ADMIN` and `SERVICE_PASSWORD_ADMIN` in the environment
   variables.
6. **SQL Editor → New query**, paste the whole of `hosting/social-schema.sql`
   and run it. It should finish with "Success. No rows returned". It creates the
   tables, row-level security policies, functions, the private storage bucket
   and its policies. Run it once on an empty database: it is not meant to be run
   twice.
7. **Storage**: confirm the bucket `social-recipe-photos` exists and is marked
   **Private**. Do not make it public.
8. Copy these from the environment variables into your password manager, under
   one entry for the server:
   - `SERVICE_SUPABASEANON_KEY`: the **anon key**, which the app uses;
   - `SERVICE_PASSWORD_POSTGRES`, `SERVICE_PASSWORD_JWT`,
     `SERVICE_USER_ADMIN` / `SERVICE_PASSWORD_ADMIN`;
   - `SERVICE_USER_S3PROTOCOL` / `SERVICE_PASSWORD_64_S3PROTOCOL` (section 5.3).

   Never put `SERVICE_SUPABASESERVICE_KEY` (the service-role key) in the app; the
   server refuses it.

Unlike the Supabase Free plan, a self-hosted project is never paused and has no
size limits beyond your disk, so there is no keepalive. Backups are still your
job: section 5.

## 3. Auth and email

Self-hosted Supabase has no built-in mailer, so it needs SMTP from the start.

### Custom SMTP with a dedicated Gmail account

1. Create a new Gmail account used only for ChériChef mail (for example
   `cherichef.app@gmail.com`). Do not use your personal account.
2. In that account: **Google Account → Security → 2-Step Verification**, turn it
   on (an app password requires it).
3. **Google Account → Security → App passwords** (or
   https://myaccount.google.com/apppasswords): create one named "Supabase". Copy
   the 16-character password; Google shows it once.
4. In Coolify, in the Supabase service's **Environment Variables**:

   | Variable | Value |
   | --- | --- |
   | `SMTP_ADMIN_EMAIL` | the Gmail address (the sender) |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | the Gmail address |
   | `SMTP_PASS` | the app password |
   | `SMTP_SENDER_NAME` | `ChériChef` |

   Save and **Restart** the service.
5. The email rate limit is the `GOTRUE_RATE_LIMIT_EMAIL_SENT=30` line from
   section 2. A consumer Gmail account can send roughly 500 messages a day and
   Google may lock it if it looks like spam.
6. Test once the app is up (section 4): sign up with an address you own, check
   the email arrives (and not in spam), click the link, sign in. The link goes
   to `https://<supabase>/auth/v1/verify…` and then back to `https://<app>`.

There is no CAPTCHA in v1. If signups get abused, the email rate limit caps the
damage; Turnstile is on the V2 list.

## 4. The app

1. In the same Coolify project and environment: **+ New → Public Repository**,
   `https://github.com/lukapolovic/recipe_web_app`, branch `main`, build pack
   **Dockerfile**. (If the repository ever goes private, use **Private
   Repository (with GitHub App)** instead.)
2. **General**:
   - **Domains**: `https://<app>`
   - **Ports Exposes**: `3000`
3. **Environment Variables** (untick **Build Variable** on each: the build does
   not need them, and the tests clear them anyway):

   | Name | Value |
   | --- | --- |
   | `SUPABASE_URL` | `https://<supabase>` |
   | `SUPABASE_ANON_KEY` | the anon key from section 2, step 8 |

   The image already sets `NODE_ENV=production`, `HOST=0.0.0.0` and
   `PORT=3000`. In production the server refuses to start without the two
   variables above rather than falling back to the offline demo.
4. **Deploy.** The build runs `npm test` and `scripts/check-hosting.js` inside
   the Docker build; any failure stops the deploy and the previous one stays
   live. Open `https://<app>`: the page should load with a padlock.
5. **Deploy on push**: open the app's **Webhooks** tab, set a **GitHub Webhook
   Secret** (a random string, `openssl rand -hex 32`; never leave it empty),
   then in GitHub **repository → Settings → Webhooks → Add webhook** paste the
   URL Coolify shows, content type `application/json`, the same secret, "Just the
   push event". Pushes to `main` now deploy.
6. **Rollback:** the **Deployments** tab lists earlier builds; **Redeploy** an
   older one to go back.

The `/api/cron/keepalive` route is not needed on a self-hosted database. Leave
`CRON_SECRET` unset and the route stays closed (it answers 503).

## 5. Backups

`.github/workflows/backup.yml` runs every Sunday at 03:41 UTC and on demand. It:

1. connects to the server over SSH with a key that can only run
   `hosting/backup-ssh.sh` (no shell). That script runs `pg_dump` inside the
   database container and streams the `public`, `auth` and `storage` schemas
   back; the runner pipes them straight into `age`, so no plaintext copy is
   written anywhere;
2. downloads the `social-recipe-photos` bucket through Supabase Storage's S3
   endpoint, tars it and encrypts it with `age`;
3. uploads only the two `.age` files as a workflow artifact kept for 90 days;
4. then deletes unattached photo drafts older than 7 days (section 10).

The repository is public, so **anyone signed in to GitHub can download the
artifacts**. They are useless without your private key, which is why the key is
never committed and the workflow refuses to run with the placeholder recipient.

Coolify has scheduled database backups of its own, but they are not encrypted
with a key only you hold and are kept next to the data unless you add S3
storage. This workflow keeps an encrypted copy off the server; use it.

### 5.1 Create the encryption key

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

### 5.2 Database access over SSH

The database is not reachable from the internet, and it should stay that way.
The workflow instead logs in as a `cherichef-backup` user whose key is pinned to one
script.

1. On your computer, make a key just for this:

   ```bash
   ssh-keygen -t ed25519 -N '' -C github-backup -f cherichef-backup-ssh
   ```

2. Find the database container's name on the server (Coolify names it
   `supabase-db-<id>`; it stays the same across redeploys):

   ```bash
   docker ps --filter name=supabase-db --format '{{.Names}}'
   ```

3. As root on the server, create the user, install the script and allow the key
   only for it. Replace `supabase-db-<id>` and paste the contents of
   `cherichef-backup-ssh.pub` where shown:

   ```bash
   useradd --create-home --shell /bin/bash --groups docker cherichef-backup
   ```

   ```bash
   curl -fsSL https://raw.githubusercontent.com/lukapolovic/recipe_web_app/main/hosting/backup-ssh.sh -o /usr/local/bin/cherichef-backup && chmod 755 /usr/local/bin/cherichef-backup
   ```

   ```bash
   install -d -m 700 -o cherichef-backup -g cherichef-backup ~cherichef-backup/.ssh
   ```

   ```bash
   echo 'restrict,command="/usr/local/bin/cherichef-backup supabase-db-<id>" <contents of cherichef-backup-ssh.pub>' > ~cherichef-backup/.ssh/authorized_keys && chown cherichef-backup:cherichef-backup ~cherichef-backup/.ssh/authorized_keys && chmod 600 ~cherichef-backup/.ssh/authorized_keys
   ```

   (Ubuntu already has a system user called `backup`, hence the longer name.)
   Membership of the `docker` group is as powerful as root, which is why the key
   is restricted to the script. Read `/usr/local/bin/cherichef-backup` once
   after downloading it, and download it again whenever `hosting/backup-ssh.sh`
   changes.
4. Test from your computer. It should print the Postgres version, and any other
   command should be refused:

   ```bash
   ssh -i cherichef-backup-ssh cherichef-backup@<server> version
   ```

5. Record the server's host key for the workflow (it is how the runner knows it
   is talking to your server):

   ```bash
   ssh-keyscan -t ed25519 <server>
   ```

### 5.3 Storage S3 access keys

These are the `SERVICE_USER_S3PROTOCOL` (access key ID) and
`SERVICE_PASSWORD_64_S3PROTOCOL` (secret) values from section 2. The endpoint is
`https://<supabase>/storage/v1/s3` and the region is `us-east-1` (the
`STORAGE_S3_REGION` in the Supabase service).

These keys can read and delete every object in every bucket, ignoring
row-level security. Keep them only in GitHub secrets and your password manager.
If they leak, change both variables in Coolify and restart the Supabase service.

### 5.4 GitHub secrets

In GitHub: **repository → Settings → Secrets and variables → Actions → New
repository secret**. Add:

| Secret | Value |
| --- | --- |
| `BACKUP_SSH_TARGET` | `cherichef-backup@<server>` |
| `BACKUP_SSH_KEY` | the whole private key file `cherichef-backup-ssh` |
| `BACKUP_SSH_KNOWN_HOSTS` | the line printed by `ssh-keyscan` in 5.2 |
| `SUPABASE_S3_ENDPOINT` | `https://<supabase>/storage/v1/s3` |
| `SUPABASE_S3_REGION` | `us-east-1` |
| `SUPABASE_S3_ACCESS_KEY_ID` | `SERVICE_USER_S3PROTOCOL` |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | `SERVICE_PASSWORD_64_S3PROTOCOL` |

Then delete `cherichef-backup-ssh` and `cherichef-backup-ssh.pub` from your
computer (a new key is quick to make if you ever need one). Secrets are not
passed to workflows triggered from forks, and GitHub masks their values in logs.

### 5.5 Run it once

1. **Actions → Backup → Run workflow**. For the first run you can untick the
   cleanup option.
2. It should finish green within a few minutes. The run summary lists the two
   encrypted files with their sizes and the photo counts. A warning that the
   object count differs from the `social_photos` row count is expected only if
   someone uploaded a photo during the run.
3. Download the artifact and check you can decrypt it (section 6, steps 1–2),
   then delete the plaintext.

### 5.6 Keep it running

- GitHub **disables scheduled workflows in public repositories after 60 days
  without repository activity** and emails you a warning first. When that email
  comes, push any commit or re-enable the workflow under **Actions → Backup**.
- Each week, glance at **Actions → Backup** or rely on GitHub's failure emails
  (on by default for workflows you trigger or own).
- Artifacts expire after 90 days, so there are always about 13 weekly backups.
  For a long-term copy, download one now and then and keep it with your files
  (it is already encrypted).
- If you rebuild the Supabase service under a new name, update the container
  name in `~cherichef-backup/.ssh/authorized_keys`.

## 6. Restore

Use this to recover into a new or replacement Supabase service (on the same
server or a new one). You need the private key, the `age`, `pg_restore`
(version 17) and `aws` command line tools, SSH access to the target server as
root, and a scratch directory on an encrypted disk. Plaintext files below
contain every account and recipe: delete them when you are done.

```bash
brew install age awscli libpq
```

```bash
export PATH="$(brew --prefix libpq)/bin:$PATH"
```

### 6.1 Get and decrypt the backup

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

### 6.2 Prepare the target

1. Set up the target Supabase service (sections 1–3 as needed; section 2 in
   full): run the current `hosting/social-schema.sql`, plus any
   `hosting/migrations/` files not yet folded into it. This recreates tables,
   policies, functions, grants and the bucket exactly as the code expects.
2. Note the target's database container name (5.2 step 2), its Supabase address
   and its S3 keys (5.3):

   ```bash
   export TARGET_SSH='root@<target server>' TARGET_DB='supabase-db-<id>' TARGET_SUPABASE='https://<target supabase>'
   ```

### 6.3 Restore the data

Restore the app tables in `public` and the accounts in `auth.users` and
`auth.identities` (so everyone keeps their password). The rest of `auth`
(sessions, tokens, logs) and `storage` are not restored: people sign in again,
and storage metadata is recreated when the photos are uploaded in 6.4.

```bash
pg_restore -l database.dump | grep -E 'TABLE DATA (public [a-z_]+|auth (users|identities)) ' > data.list
```

```bash
pg_restore --data-only --use-list=data.list --file=data.sql database.dump
```

```bash
sed -i.orig -E '/^SET transaction_timeout/d; /^\\(un)?restrict /d' data.sql
```

(The `sed` removes lines newer `pg_restore` versions write that Postgres 15's
`psql` does not know: the `transaction_timeout` setting (17+) and the
`\restrict`/`\unrestrict` guard lines (17.6+ and 18). It is harmless on newer
servers.)

```bash
ssh "$TARGET_SSH" "docker exec -i $TARGET_DB psql -h 127.0.0.1 -U supabase_admin -d postgres -X -v ON_ERROR_STOP=1 --single-transaction -c 'SET session_replication_role = replica' -f -" < data.sql
```

`session_replication_role = replica` turns off triggers and foreign-key checks
while loading, so table order does not matter and the new-user trigger does not
create duplicate profiles. Everything loads in one transaction: on any error,
nothing is changed and you can fix the cause and rerun. If it fails on an
`auth` table because the target's newer Auth version changed a column, compare
`\d auth.users` in both databases and edit the column list of that `COPY` line
in `data.sql`. Every app table points at `auth.users`, so accounts must be
restored with their original ids. Finding problems like this early is what the
restore drill is for.

Check the counts against the backup summary:

```bash
ssh "$TARGET_SSH" "docker exec -i $TARGET_DB psql -h 127.0.0.1 -U supabase_admin -d postgres -X -c 'select (select count(*) from auth.users) users, (select count(*) from public.cookbooks) cookbooks, (select count(*) from public.cookbook_recipes) recipes, (select count(*) from public.social_photos) photos'"
```

### 6.4 Re-upload the photos

```bash
export AWS_ACCESS_KEY_ID='<target SERVICE_USER_S3PROTOCOL>' AWS_SECRET_ACCESS_KEY='<target SERVICE_PASSWORD_64_S3PROTOCOL>' AWS_REGION='us-east-1'
```

```bash
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
```

```bash
aws configure set default.s3.addressing_style path
```

```bash
(cd photos && find . -type f -name '*.webp' | sed 's|^\./||') | while read -r key; do aws s3api put-object --bucket social-recipe-photos --key "$key" --body "photos/$key" --content-type image/webp --endpoint-url "$TARGET_SUPABASE/storage/v1/s3" > /dev/null && echo "uploaded $key"; done
```

Use `aws s3api`, not `aws s3 cp`/`sync`: the high-level commands add conditional
headers that Supabase Storage's signature check rejects behind its proxy
(`SignatureDoesNotMatch`), while the plain object calls work.

Object keys keep their `<owner>/<photo>.webp` paths, which is what
`public.social_photos.path` points to, so no database changes are needed.

### 6.5 Switch the app over (real recovery only)

1. In Coolify, change the app's `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the
   new service and redeploy. (A new service has a new JWT secret, so the old
   anon key no longer works; everyone signs in again.)
2. Redo section 3 (SMTP) on the new service if you did not already.
3. Update the `cherichef-backup` user's container name (5.2) and the GitHub secrets (5.4) to
   the new service, and run the backup once.
4. Delete the plaintext: `rm -rf database.dump data.sql data.sql.orig data.list photos`.

## 7. Restore drill

Do this once **before launch**, and again after any large schema change or
Supabase upgrade. An untested backup is not a backup.

1. Put some real-looking data in production: two accounts, a shared cookbook,
   a few recipes with photos, a review.
2. Run the Backup workflow (with cleanup off).
3. In Coolify, create a second environment in the project (for example
   `drill`) and add a second Supabase service there (section 2, steps 1–8, with
   `https://drill-supabase.<domain>` and a matching DNS record; skip SMTP).
   Expect it to use another 2–3 GB of RAM while it runs.
4. Follow section 6 in full into the drill service (skip 6.5).
5. Point a local copy of the app at it: in `.env` set
   `SUPABASE_URL=https://drill-supabase.<domain>` and `SUPABASE_ANON_KEY` to the
   drill service's anon key, then `npm start`. Before signing in, set the drill
   service's `ADDITIONAL_REDIRECT_URLS` to `http://127.0.0.1:3000` and restart
   it.
6. Sign in with one of the production accounts and its existing password.
   Check the cookbook, recipes, photos, review and partner are all there.
7. Write the date and anything that went wrong at the bottom of this file.
8. Delete the plaintext files, remove the drill values from `.env`, and delete
   the drill service in Coolify (tick the option to delete its volumes) and its
   DNS record.

## 8. Updates and upkeep

Running your own server means these are now your job.

- **Operating system:** `unattended-upgrades` (1.3) installs security updates.
  Once a month, `ssh root@<server>`, run `apt update && apt -y full-upgrade` and
  reboot if it asks (`[ -f /var/run/reboot-required ] && reboot`). The app is
  down for about a minute.
- **Coolify:** auto-update (1.4) keeps it current. Glance at
  https://github.com/coollabsio/coolify/security/advisories now and then.
- **Supabase:** Coolify updates the template, not your running service. Every
  few months, before upgrading: run the Backup workflow, then redeploy the
  service with the latest images (Coolify's pull-latest option on the service, or
  newer image tags in its compose file). Do a restore drill (section 7) after a major Postgres version
  change.
- **Disk:** check with `df -h` on the server. Coolify cleans up old Docker
  images on its own; photos are capped per user by the app.
- **Monitoring:** Coolify can email you when a deploy fails or a container
  stops (**Notifications**). Add a free external uptime check on
  `https://<app>` (for example Uptime Kuma on another machine, or any hosted
  uptime monitor) so you hear about outages the server cannot report itself.

## 9. Reading reports

People can report profiles, cookbooks, recipes, reviews and replies. Reports go
to `public.reports` and are only visible to you in Supabase Studio (reporters
only see their own). Check weekly, or more often after launch.

**Studio → SQL Editor** (`https://<supabase>`), newest first, with the
reporter:

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

## 10. Photo cleanup

Photos are uploaded as drafts before a recipe or cover is saved. A draft that
is never attached (an abandoned edit) is a row in `public.social_photos` that no
`cookbook_recipes.image_id` and no `cookbooks.cover_image_id` refers to. After
each successful backup, the workflow:

1. deletes draft rows older than 7 days in one statement that re-checks they are
   still unattached (the `cleanup` action in `hosting/backup-ssh.sh`). Because
   recipes and covers reference photos with foreign keys, a deleted row can
   never be attached afterwards, and a photo attached while the job runs is not
   deleted;
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

## 11. Schema changes

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
3. Fold the same change into `social-schema.sql` so new databases get it, and
   run `npm test`: the RLS tests run against the folded schema.
4. Before running it on production, run the Backup workflow. Then paste the
   migration into **Studio → SQL Editor** and run it. Deploy the code that needs
   it afterwards.
5. Keep the migration file in the repository: a restore uses
   `social-schema.sql`, but an older database may still need the file.

## 12. Pre-launch checklist

Server and Coolify

- [ ] Server in the chosen location; provider and location named on the privacy
      page
- [ ] SSH keys only, firewall open only for 22/80/443 (`ufw`, or on Oracle the
      security list and `iptables`), `unattended-upgrades` installed
- [ ] Oracle only: account on Pay As You Go, $1 budget alert, A1 usage within the
      free limit
- [ ] Coolify admin claimed with 2FA, registration off, dashboard on
      `https://coolify.<domain>`, port 8000 closed, auto-update on

Supabase

- [ ] Service healthy at `https://<supabase>`; `API_EXTERNAL_URL`,
      `GOTRUE_SITE_URL` and `ADDITIONAL_REDIRECT_URLS` set
- [ ] `hosting/social-schema.sql` run; bucket `social-recipe-photos` is private
- [ ] Email confirmation on; SMTP via the dedicated Gmail account; rate limit 30
      per hour; test email received
- [ ] Postgres, JWT, Studio and S3 secrets and the Gmail app password stored in
      the password manager

App

- [ ] `SUPABASE_URL` and `SUPABASE_ANON_KEY` set; deploy green (tests ran in the
      build); `https://<app>` loads over HTTPS
- [ ] GitHub webhook with a secret; a push to `main` deploys
- [ ] Sign up, confirm, sign in, create a cookbook, invite a partner, import a
      recipe with a photo, review it, delete a test account

Backups

- [ ] Real age public key committed in `hosting/backup-recipient.txt`
- [ ] Private key stored in two places
- [ ] `cherichef-backup` user with the forced command; `ssh … version` works, other
      commands are refused
- [ ] Seven GitHub secrets set
- [ ] Backup workflow run manually and green; artifact decrypts
- [ ] Restore drill (section 7) done and dated below
- [ ] Tests workflow green on `main`

Safety

- [ ] Privacy and terms pages reviewed and reachable from the app
- [ ] You know how to read reports (section 9) and take content down
- [ ] External uptime check and Coolify notifications set up

## 13. Later (V2)

- Report queue, blocking and admin tools instead of SQL in Studio
- Cloudflare Turnstile on signup
- Per-user rate limit for recipe imports
- Measured evaluation of calling Supabase directly with supabase-js instead of
  proxying through the server
- Transactional email through a proper provider (or a self-hosted mail relay)
  instead of Gmail
- Remove the keepalive route and SQL function, which only the Supabase Free plan
  needed

---

## Restore drill log

| Date | Backup used | Result / notes |
| --- | --- | --- |
| 2026-10-29 | `backup-2026-10-29T1934Z` | **Pass.** Restored into a second Supabase service on the same server (Coolify environment `drill`): 1 account, 1 cookbook, 2 recipes, 1 photo. Signed in locally with the production account's existing password; cookbook, recipes and photo all present. Found and fixed on the way: `aws s3 sync`/`cp` fail with SignatureDoesNotMatch behind the proxy (backup and restore now use `s3api`); `pg_restore` 18 writes `\restrict` lines Postgres 15's `psql` rejects (added to the `sed` in 6.3); Coolify refuses to save a Supabase service until `POSTGRES_DB=postgres` is set (added to section 2). |
