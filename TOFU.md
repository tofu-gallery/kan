# Tofu gallery copy

This repository is Tofu's copy of **kanbn/kan** (licence: AGPL-3.0), listed in Tofu's app gallery as **Kan**.

- `main` mirrors the upstream repository and is never committed to by Tofu.
- `tofu` carries Tofu's own changes; tags named `pin/<date>` mark the versions the gallery points to.
- A visitor who chooses this app gets a private snapshot of the pinned version in their own Tofu account. Their copy does not follow upstream updates.

How Tofu runs it: Next.js + PostgreSQL. Tofu builds it on the Vercel lane; the managed database supplies `DATABASE_URL` and `SUPABASE_CA_CERT`.

## What Tofu changes

- `packages/db/src/client.ts`: the database client reads `DATABASE_URL` (Tofu's managed database) first and upstream's `POSTGRES_URL` second. With neither set it now throws `No database configured: set DATABASE_URL (or POSTGRES_URL) to a PostgreSQL connection string.` Before, it silently opened a PGlite database in `./pgdata`, which on a serverless host sits on temporary disk and loses every write.
- `packages/db/src/client.ts`: when the URL carries `sslmode` (Tofu's ends in `?sslmode=require`), the parameter is taken out and TLS is set explicitly: verified against `SUPABASE_CA_CERT` when that is set, encrypted without verification otherwise. Without this, node-postgres lets `sslmode=require` force full verification against the system's certificates, which fails against the database pooler with `SELF_SIGNED_CERT_IN_CHAIN`. Host, port, user, password and database stay in the URL for pg to parse, and a URL without `sslmode` reaches pg unchanged, as it did upstream. `pgliteExtensions` is still exported for the integration tests.
- `apps/web/src/middleware.ts`: the redirect from `/` to `/login` stays on a build's own `*.vercel.app` address instead of going to `NEXT_PUBLIC_BASE_URL`. Tofu checks every new version at that address before putting it online, and the redirect to the public address sent the check to the version already online, so every deploy after the first failed its check. Everywhere else the redirect uses `NEXT_PUBLIC_BASE_URL`, as upstream does.
- `apps/web/next.config.js`: sets `turbopack.root` to the repository root, because the dependencies are hoisted there and Turbopack otherwise resolves from `apps/web` alone and cannot find `@lingui/core`, the react-email subpackages or `@aws-sdk/client-s3`.
- `package.json` and `pnpm-lock.yaml`: the root declares `next` at the same version as `apps/web` (15.5.9). Vercel reads the Next.js version from the repository root, and this root is a pnpm workspace with no `next` of its own; without it the build stops with `NEXT_NO_VERSION`.
- `supabase/migrations/*.sql` (new): byte-for-byte copies of the 36 files in `packages/db/migrations/`, plus one file of Tofu's own, `20261023000000_TofuEnableRlsOnRemainingTables.sql`. It turns on row-level security for `workspace_slugs` and `user_board_favorites`, the only two upstream tables without it; otherwise the database's Data API, reachable with its public key, could read and change them. The app's own connection is not limited by row-level security (upstream already turns it on for every other table), so the app is not affected. Drizzle's journal (`packages/db/migrations/meta/_journal.json`) lists three groups in a different order from the file names (`AddIntegrationsTable`/`AddOnDeleteActionToUserDeletion`, `AddWorkspaceWebhooks` against the three files dated after it, `AddGitHubIntegrationSupport`/`AddIsArchivedToBoard`). None of those files touches what the others create, so both orders build the same schema. The originals and the journal are untouched.
- `tooling/tofu-migrate.mjs` (new): applies `supabase/migrations` at the start of the build, in file-name order, each file once, and records each version in the Supabase CLI's own ledger (`supabase_migrations.schema_migrations`), so neither Tofu nor a person with the database key runs one twice. It needs `DATABASE_URL` and `SUPABASE_CA_CERT` and refuses to connect without verifying the server; with no `DATABASE_URL` it does nothing. Tofu applies `supabase/migrations` itself only when it can read the build, and the build command in `vercel.json` makes it leave them to the app. The script lives in `tooling/` because upstream's `.gitignore` ignores `scripts/`.
- `vercel.json` (new): builds `apps/web` from the repository root, because the app needs the workspace packages beside it. It sets the `nextjs` framework, the output directory `apps/web/.next` and the build command `node tooling/tofu-migrate.mjs && pnpm --filter @kan/mcp build && pnpm --filter @kan/web build`, which runs `apps/web`'s own `build` script unchanged. It deliberately skips `turbo run build`, whose strict environment mode hides undeclared variables from the build. Install stays Vercel's default `pnpm install`.
- `TOFU.md`: this file.

Nothing else changed: no upstream SQL and no `turbo.json`. The Stripe code path is still there. It only loads with `NEXT_PUBLIC_KAN_ENV=cloud`, which a Tofu copy leaves unset.

## Deploying on Tofu

- Preset: `nextjs`. Confirm it before the database is connected.
- App root: the whole repository, not `apps/web`. The app imports `packages/*`.
- Database: Tofu's managed database. Tofu sets `DATABASE_URL` and `SUPABASE_CA_CERT`; do not set them by hand.
- Install settings (public): `NPM_CONFIG_NODE_LINKER=hoisted`, `NPM_CONFIG_SHAMEFULLY_HOIST=true`, `NPM_CONFIG_LINK_WORKSPACE_PACKAGES=true` and `NPM_CONFIG_HOIST=true`. Upstream's `.npmrc` asks for a hoisted install, but Tofu never uploads `.npmrc` (it can hold registry credentials), so without these pnpm installs each package on its own and the build cannot resolve `@lingui/core`, the react-email subpackages or `@aws-sdk/client-s3`.
- Deploy once, set `NEXT_PUBLIC_BASE_URL` to the address that deploy got, then deploy again.

## Settings the owner sets

| Name | Value | Kind |
|---|---|---|
| `BETTER_AUTH_SECRET` | a random string of 32 or more characters, e.g. from `openssl rand -base64 32` | secret: save it with *Hide this value after saving* |
| `NEXT_PUBLIC_BASE_URL` | the app's own address, e.g. `https://<app>.trytofu.app`, with no trailing slash | public |
| `NEXT_PUBLIC_ALLOW_CREDENTIALS` | `true`: turns on email-and-password sign-in | public |
| `NEXT_PUBLIC_DISABLE_EMAIL` | `true`: the copy has no email service yet | public |

- Without `BETTER_AUTH_SECRET`, sign-up and sign-in answer HTTP 500.
- `NEXT_PUBLIC_*` values are fixed when the app is built (they are written into `apps/web/public/__ENV.js`), so deploy again after changing one.
- With email off there is no magic-link sign-in and no password-reset email, and people join a workspace through invite links instead of invitation emails.
- Google sign-in runs through Kan's own Better Auth, not Tofu's sign-in broker, so it needs the owner's own Google OAuth client. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (secret), and give the client the authorised redirect URI `<NEXT_PUBLIC_BASE_URL>/api/auth/callback/google`.
- `BETTER_AUTH_TRUSTED_ORIGINS` is needed when the app also answers on a second address, such as a custom domain.
- Leave unset:
  - `NEXT_PUBLIC_KAN_ENV`: `cloud` turns on Kan's own billing.
  - `NEXT_PUBLIC_USE_STANDALONE_OUTPUT`: standalone output is for the Docker image, not Vercel.
  - `POSTGRES_URL`: ignored while `DATABASE_URL` is set.
- Avatars and attachments need S3-compatible storage (`S3_*`, `NEXT_PUBLIC_STORAGE_*` and the bucket names). Without it those uploads do not work.

## Checked on Tofu (2026-10-23)

- The build detects Next.js 15.5.9 and finds `apps/web/.next`.
- `tooling/tofu-migrate.mjs` applied all 37 files to a fresh managed database: 31 app tables, every one with row-level security.
- On the live address: sign up with email and password, create a workspace, a board with three lists and a card, sign in again in a new session and read the card back. Board and card search (`similarity()` from `pg_trgm`) finds both. The runtime logs show no `No database configured`, `SELF_SIGNED_CERT_IN_CHAIN` or prepared-statement errors from the transaction pooler.
- A deploy after `NEXT_PUBLIC_BASE_URL` is set passes Tofu's check and goes online.

Not checked yet:

- Google sign-in with `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set.
- Avatars and attachments, which need S3-compatible storage.

## Licence

AGPL-3.0. Licence files and copyright notices stay as they are; every file Tofu changes carries a note saying so. Three kinds of file cannot carry one, and all are listed above: `vercel.json` and `package.json`, because JSON takes no comments, `pnpm-lock.yaml`, which is generated, and the SQL copies in `supabase/migrations/`, which are unmodified.
