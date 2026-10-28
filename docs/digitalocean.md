# Production on DigitalOcean

## Current applications — original hosting restored 28/10/2026

At the owner's request, `https://app.himoto.vn` again serves the original Laravel application from `/var/www/app.himoto.vn/public`, using the existing MySQL database `himoto`, PHP pool `himoto-app`, and original scheduler. The Next.js cutover was a misunderstanding of the request to copy the separate WordPress website. No database restore or merge was performed during this reversal.

The separate Next.js management application belongs at `https://himoto.vercel.app`, with its existing Supabase database and accounts. Vercel serves both its pages and API directly; do not redirect its pages or proxy its API to the Laravel hostname. Its integration scheduler and generated GPS callbacks must use the Vercel origin.

`/etc/himoto-web/cutover-enabled` has been removed, so the release wrapper cannot automatically replace the restored Laravel virtual host. Next.js releases, Supabase data and private configuration are retained. The DigitalOcean workflow is manual-only; normal pushes deploy through the existing Vercel integration. Do not recreate that marker or reactivate Next.js on the Laravel hostname without explicit authorization. The health timer now uses the existing Laravel monitor through `/etc/systemd/system/himoto-health.service.d/legacy-restore.conf`.

Pre-restore configuration and a fresh legacy database backup are under `/root/himoto-app-restore-20261028`; the original cutover archive remains under `/root/himoto-next-cutover-20261028`. Both WordPress sites, `himoto.vn` and the independent development copy `himoto.com.vn`, were left unchanged by this application restoration. The following sections describe the earlier Next.js deployment and remain as its reference runbook.

## Previous Next.js deployment reference

Public application: `https://app.himoto.vn`. The application uses the existing Supabase database, accounts, integration encryption key and external media storage. The separate `himoto.vn` marketing site stays on its existing PHP pool.

The Next.js standalone artifact runs as `himoto-next`, bound only to localhost. Nginx terminates HTTPS with the existing certificate. Two systemd instances use ports 3100/3101: deployment warms the unused instance, verifies its release ID, reloads Nginx, and retires the prior instance after a grace period. A failed health check leaves the current upstream serving traffic.

## Releases

`.github/workflows/digitalocean.yml` builds Linux artifacts from `main` using Node 22 LTS. SSH keys and pinned host keys come from the `DIGITALOCEAN_HOST`, `DIGITALOCEAN_DEPLOY_KEY`, and `DIGITALOCEAN_KNOWN_HOSTS` repository secrets. The deployment key can invoke only the root-owned release wrapper; it cannot request a general SSH shell. Secrets are injected at runtime from `/etc/himoto-web/runtime.env`, outside the artifact and repository.

The previous Vercel alias redirects browser pages to the canonical domain and proxies old `/api/*` callbacks to DigitalOcean without caching private responses. This keeps existing provider callback addresses working while all application execution moves to the VPS.

Server files:

- `/srv/himoto-web/releases/<git-sha>`: immutable application code.
- `/srv/himoto-web/current`: currently selected release.
- `/etc/himoto-web/active.json`: active release and port.
- `/etc/himoto-web/staged.json`: most recently warmed release.
- `/etc/himoto-web/runtime.env`: private runtime configuration, root-owned with group read for the application.
- `/root/himoto-next-cutover-20261028`: private legacy application/database and configuration backups.

Check `systemctl status himoto-web@3100 himoto-web@3101`, `journalctl -u himoto-web@3100`, and `/api/health`. Keep release/environment contents out of support logs.

The login page must render at request time because build jobs do not receive database credentials. Packaging rejects a prerendered `/login`, and the server checks that the login fields and submit button are enabled before activating a release.

Every deployment also runs type checking, ESLint, 34 offline business/authentication test suites, release and operations checks, and an audit of production dependencies. Test processes cannot contact external services. An unsuccessful check leaves the serving release unchanged.

## Monitoring and backups

`himoto-health.timer` checks every five minutes. Its service uses `deploy/monitor.py` to verify the selected application release through Nginx, an enabled and uncached login form, the marketing origin, required services, the firewall, and recent backups. `/` intentionally redirects to `/login`; it is not the application health endpoint. Results remain private in `/var/lib/himoto-monitor/health-latest.json`.

The new Supabase application has a separate daily backup from the archived Laravel/MySQL application. `himoto-web-backup.timer` runs at 04:00 Asia/Ho_Chi_Minh with up to ten minutes of jitter and retains fourteen successful snapshots under `/var/backups/himoto-web`, accessible only to root. The backup uses PostgreSQL client 18, verified TLS, and a read-only source session; it dumps the `himoto` schema and privately copies the runtime environment needed to decrypt integration credentials. It never prints credentials or puts database passwords in command arguments.

An incomplete dump or archive validation cannot replace `latest`. Before publishing a snapshot, `pg_restore --file=/dev/null` reads/decompresses the entire archive and SHA-256 is recorded in `manifest.json`. This verifies archive readability; an isolated full database restore is a separate recovery rehearsal. Restore business data into an isolated database first, apply the required roles/grants, and compare counts before considering a production restore. Never restore the legacy MySQL snapshot over current Supabase data.

Root-managed files are installed separately from app releases: `deploy/backup.py` → `/usr/local/sbin/himoto-web-backup`, `deploy/monitor.py` → `/usr/local/sbin/himoto-web-monitor`, and their service/timer files → `/etc/systemd/system/`. Preserve the previous monitor's integrity service. `/etc/himoto-web/database-ca.pem` combines system trust roots with the Supabase CA. After changing these files, validate units, reload systemd, run the backup once, then run the health service and inspect its private result. Do not add these operational secrets or backups to release artifacts.

## Initial switch and rollback

The first automated deployment only warms the application until `/etc/himoto-web/cutover-enabled` exists. After authenticated read-only verification, the operator switches Nginx to the staged port and enables subsequent automatic deployments. The previous Laravel application is removed from public serving and its own scheduler/PHP pool is retired; the source tree and database backup remain private for recovery.

On 28/10/2026 the owner explicitly selected keeping the current new-app data and archiving the old app. Post-19/10 legacy records are therefore preserved in the legacy backup, not merged into or substituted for current Supabase contracts/receipts.

For a release rollback, start the previous port/release, verify `/api/health`, restore the upstream port, run `nginx -t`, then reload Nginx. The release metadata and systemd instance symlinks retain the prior artifact. For initial cutover rollback, restore the backed-up Nginx site, PHP pool and only the legacy application's scheduler entry; do not restore an older database over the current Supabase application.

Integration scheduler and GPS callback URLs use the canonical domain. Browser video PUT CORS must include `https://app.himoto.vn` while preserving existing origins. Existing external callbacks at the previous Vercel alias remain compatible during their transition; do not remove the alias before changing provider-side callback settings.
