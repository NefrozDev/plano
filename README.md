# Plano

Plano is a full-stack learning and showcase application organized as a single repository.

## Repository structure

```text
plano/
├── Backend/   # NestJS REST API and persistent authentication
├── Common/    # Shared contracts and framework-independent types
└── Frontend/  # Angular application
```

The three boundaries are intentionally separate. `Frontend` and `Backend` may depend on `Common`; `Common` must not depend on either application.

## Local development

Install both applications from the repository root:

```bash
npm --prefix Frontend ci
npm --prefix Backend ci
```

The API stores its data in PostgreSQL. With Docker running, start a local
database and give the API its configuration once:

```bash
npm run db:start
cp Backend/.env.example Backend/.env
```

Then run the API and Angular development server in separate terminals:

```bash
npm run start:back
npm run start:front
```

Other root commands:

```bash
npm run frontend:build
npm run frontend:test
npm run test:coverage
```

The application is available at `http://localhost:4200/`. Angular proxies
`/api` requests to the API at `http://localhost:3000/` during development.

## Authentication

Registration and login use an opaque, persistent session cookie. The cookie is
`HttpOnly`, so Angular cannot read or store the credential. On every app launch,
Angular calls `GET /api/v1/auth/session`; the backend hashes the cookie token and
looks up the matching session in its PostgreSQL database. Users and sessions therefore
survive both browser and backend restarts. Logout revokes the stored session and
clears the cookie.

The local database keeps its data in a Docker volume; `npm run db:stop` stops it
without deleting anything. Backend configuration names and safe defaults are
documented in `Backend/.env.example`.

## Deployment

Production runs with Docker Compose ([compose.prod.yaml](compose.prod.yaml)) on a
VPS that also hosts a Mailcow mail server:

- Mailcow's nginx owns ports 80/443, terminates HTTPS with Mailcow's Let's
  Encrypt certificate and forwards `plano.synapseengineering.dev` to Plano
  ([deploy/mailcow-plano.conf](deploy/mailcow-plano.conf)).
- `web`: Caddy serving the built Angular app and proxying `/api` to the API.
  Frontend and API share one origin, so no cross-origin setup is needed.
- `api`: the NestJS API. Migrations run when it starts.
- `db`: PostgreSQL, reachable only on Plano's internal Docker network.

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) lints,
tests (with coverage thresholds) and builds both applications on every push and
pull request. Only when all checks pass on `main` does it publish
`ghcr.io/nefrozdev/plano-api` and `plano-web`; the VPS only pulls them, so no
build competes with the mail server for memory.

### First install

1. DNS: add an `A` record `plano` → the VPS IP, **DNS only** (grey cloud) so
   Mailcow's ACME client can validate it.
2. Start Plano (as `ubuntu`, using `sudo` for Docker):

   ```bash
   git clone https://github.com/NefrozDev/plano.git ~/plano && cd ~/plano
   cp .env.production.example .env
   sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" .env
   sudo docker compose -f compose.prod.yaml pull
   sudo docker compose -f compose.prod.yaml up -d
   ```

3. Plug it into Mailcow (in `/opt/mailcow-dockerized`). `nginx -t` must pass
   before the reload; a reload with a broken config keeps the old one running.

   ```bash
   sudo cp ~/plano/deploy/mailcow-plano.conf data/conf/nginx/plano.conf
   sudo docker compose exec nginx-mailcow nginx -t
   sudo docker compose exec nginx-mailcow nginx -s reload
   # mailcow.conf: ADDITIONAL_SAN=plano.synapseengineering.dev (comma-separate if not empty)
   sudo docker compose up -d   # recreates acme-mailcow to request the new name
   sudo docker compose logs --tail=50 acme-mailcow
   ```

   If `nginx -t` fails, remove `data/conf/nginx/plano.conf` and nothing changes.

4. Schedule the nightly database backup (`sudo crontab -e`), see
   [deploy/backup.sh](deploy/backup.sh).

### Updating

Wait for the CI workflow to finish (including its `images` job), then:

```bash
cd ~/plano && git pull
sudo docker compose -f compose.prod.yaml pull && sudo docker compose -f compose.prod.yaml up -d
```

Logs: `docker compose -f compose.prod.yaml logs -f api`.

### Backups

[deploy/backup.sh](deploy/backup.sh) writes a compressed dump to
`/root/plano-backups` every night and keeps 14 days. Check that a dump is
usable, without touching production:

```bash
sudo sh ~/plano/deploy/verify-backup.sh   # newest dump, or pass a file
```

It restores the dump into a throwaway PostgreSQL container and prints each
table's row count. To restore into production (this overwrites live data;
stop the API first):

```bash
gunzip -c <file>.sql.gz | sudo docker compose -f compose.prod.yaml exec -T db psql -U plano -d plano
```

The dumps stay on the VPS: copy them elsewhere regularly to survive losing the server.

## Test coverage

Run `npm run test:coverage` to generate both reports. Jest and Karma enforce a
minimum of 80% for statements, branches, functions, and lines; the command fails
when either application falls below any threshold. Generated reports are written
to each package's ignored `coverage/` directory.
