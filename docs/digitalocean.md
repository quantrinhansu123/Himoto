# Production on DigitalOcean

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

## Initial switch and rollback

The first automated deployment only warms the application until `/etc/himoto-web/cutover-enabled` exists. After authenticated read-only verification, the operator switches Nginx to the staged port and enables subsequent automatic deployments. The previous Laravel application is removed from public serving and its own scheduler/PHP pool is retired; the source tree and database backup remain private for recovery.

On 28/10/2026 the owner explicitly selected keeping the current new-app data and archiving the old app. Post-19/10 legacy records are therefore preserved in the legacy backup, not merged into or substituted for current Supabase contracts/receipts.

For a release rollback, start the previous port/release, verify `/api/health`, restore the upstream port, run `nginx -t`, then reload Nginx. The release metadata and systemd instance symlinks retain the prior artifact. For initial cutover rollback, restore the backed-up Nginx site, PHP pool and only the legacy application's scheduler entry; do not restore an older database over the current Supabase application.

Integration scheduler and GPS callback URLs use the canonical domain. Browser video PUT CORS must include `https://app.himoto.vn` while preserving existing origins. Existing external callbacks at the previous Vercel alias remain compatible during their transition; do not remove the alias before changing provider-side callback settings.
