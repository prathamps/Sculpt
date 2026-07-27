# Backup and restore

Sculpt keeps state in exactly two places:

| What | Where (Docker self-host) | Where (bare metal) |
| --- | --- | --- |
| Database — projects, members, comments, reviews, audit log | `sculpt_pgdata` volume | your PostgreSQL server |
| Media binaries — originals, proxies, thumbnails | `sculpt_uploads` volume | `apps/api/uploads` |

Both must be backed up together. A database restored without its media leaves
every version pointing at a file that no longer exists; media without the
database is an unreferenced pile of bytes.

## Backing up

### Database

```bash
docker compose -f docker-compose.selfhost.yml exec -T postgres \
  pg_dump -U sculpt -Fc sculpt > sculpt-$(date +%F).dump
```

`-Fc` writes PostgreSQL's compressed custom format, which restores faster and
lets you restore selectively. For a plain-SQL dump you can read, use `-Fp`.

### Media

```bash
docker run --rm \
  -v sculpt_uploads:/uploads:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/sculpt-uploads-$(date +%F).tar.gz -C /uploads .
```

On bare metal this is just `tar czf sculpt-uploads.tar.gz apps/api/uploads`.

### Both, on a schedule

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/var/backups/sculpt
STAMP=$(date +%F-%H%M)
mkdir -p "$BACKUP_DIR"

docker compose -f /srv/sculpt/docker-compose.selfhost.yml exec -T postgres \
  pg_dump -U sculpt -Fc sculpt > "$BACKUP_DIR/db-$STAMP.dump"

docker run --rm -v sculpt_uploads:/uploads:ro -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/uploads-$STAMP.tar.gz" -C /uploads .

find "$BACKUP_DIR" -type f -mtime +30 -delete
```

Add it to cron (`0 3 * * *`) and copy the directory off the host — a backup that
only exists on the machine you are protecting is not a backup.

## Restoring

Stop the API first so nothing writes while you restore.

```bash
docker compose -f docker-compose.selfhost.yml stop api web
```

### Database

```bash
docker compose -f docker-compose.selfhost.yml exec -T postgres \
  dropdb -U sculpt --if-exists sculpt
docker compose -f docker-compose.selfhost.yml exec -T postgres \
  createdb -U sculpt sculpt
docker compose -f docker-compose.selfhost.yml exec -T postgres \
  pg_restore -U sculpt -d sculpt --no-owner < sculpt-2026-07-26.dump
```

### Media

```bash
docker run --rm \
  -v sculpt_uploads:/uploads \
  -v "$PWD":/backup \
  alpine sh -c 'rm -rf /uploads/* && tar xzf /backup/sculpt-uploads-2026-07-26.tar.gz -C /uploads'
```

### Bring it back up

```bash
docker compose -f docker-compose.selfhost.yml up -d
curl -fsS http://localhost:3001/health
```

The API runs `prisma migrate deploy` on boot, so restoring an older dump onto a
newer image applies any missing migrations automatically. The reverse — a newer
dump on an older image — is not supported; upgrade the image instead.

## Verifying a backup

Restore into a scratch database and count rows. A backup you have never
restored is a hypothesis, not a backup.

```bash
docker compose -f docker-compose.selfhost.yml exec -T postgres \
  createdb -U sculpt sculpt_verify
docker compose -f docker-compose.selfhost.yml exec -T postgres \
  pg_restore -U sculpt -d sculpt_verify --no-owner < sculpt-2026-07-26.dump
docker compose -f docker-compose.selfhost.yml exec -T postgres \
  psql -U sculpt -d sculpt_verify -c \
  'SELECT (SELECT count(*) FROM "Project") AS projects,
          (SELECT count(*) FROM "Image") AS media,
          (SELECT count(*) FROM "Comment") AS comments;'
docker compose -f docker-compose.selfhost.yml exec -T postgres \
  dropdb -U sculpt sculpt_verify
```

## What is safe to lose

- **Redis** holds presence, rate-limit counters and Socket.IO fan-out state.
  All of it is derived and rebuilt automatically; it needs no backup.
- **`uploads/.staging` and `uploads/.processing`** are scratch directories for
  in-flight uploads and transcodes. Exclude them if you like — a reaper clears
  abandoned files on a schedule anyway.

## Data retention

Audit log entries and their source IP addresses are kept indefinitely by
default. If your compliance posture requires trimming them, run a periodic
delete — the table is indexed on `createdAt`:

```sql
DELETE FROM "AuditLog" WHERE "createdAt" < NOW() - INTERVAL '400 days';
```

Users can export their own data (`Account → Download my data`) and delete their
account, which removes their profile, comments and reviews, and any project
they solely own.
