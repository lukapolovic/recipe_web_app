#!/usr/bin/env bash
# Forced command for the backup workflow's SSH key (hosting/RUNBOOK.md, 4.2).
# Installed on the server as /usr/local/bin/cherichef-backup and named in
# ~cherichef-backup/.ssh/authorized_keys as
#
#   restrict,command="/usr/local/bin/cherichef-backup <db container>" ssh-ed25519 AAAA… github-backup
#
# The key can run only the fixed actions below against the Supabase database
# container. It cannot open a shell, forward ports or send its own SQL, so a
# leaked key can at most read a dump (which is why the dump is encrypted on the
# GitHub runner) or trigger the same draft cleanup the weekly job does.
set -euo pipefail

container=${1:?usage: cherichef-backup <supabase-db container name>}
psql() { docker exec -i "$container" psql -h 127.0.0.1 -U supabase_admin -d postgres -X -At -v ON_ERROR_STOP=1 "$@"; }

case "${SSH_ORIGINAL_COMMAND:-}" in
  version)
    psql -c 'show server_version' ;;
  dump)
    # Custom format to stdout. pg_dump runs inside the container, so its
    # version always matches the server's.
    docker exec -i "$container" pg_dump -h 127.0.0.1 -U supabase_admin -d postgres \
      --format=custom --compress=9 --schema=public --schema=auth --schema=storage ;;
  count)
    psql -c 'select count(*) from public.social_photos' ;;
  paths)
    psql -c 'select path from public.social_photos' ;;
  cleanup)
    # One statement that re-checks the drafts are still unattached. The recipe
    # and cover foreign keys mean a deleted row can never be attached afterwards.
    psql -c "
      delete from public.social_photos p
      where p.created_at < now() - interval '7 days'
        and not exists (select 1 from public.cookbook_recipes r where r.image_id = p.id)
        and not exists (select 1 from public.cookbooks c where c.cover_image_id = p.id)
      returning p.path" ;;
  *)
    echo "Unknown action. Allowed: version, dump, count, paths, cleanup." >&2
    exit 64 ;;
esac
