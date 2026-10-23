# Tofu gallery copy

This repository is Tofu's copy of **kanbn/kan** (licence: AGPL-3.0), listed in Tofu's app gallery as **Kan**.

- `main` mirrors the upstream repository and is never committed to by Tofu.
- `tofu` carries Tofu's own changes; tags named `pin/<date>` mark the versions the gallery points to.
- A visitor who chooses this app gets a private snapshot of the pinned version in their own Tofu account. Their copy does not follow upstream updates.

How Tofu runs it: Next.js + PostgreSQL. Tofu builds it on the Vercel lane; the managed database supplies DATABASE_URL.

- `package.json` (root): declares `next` at the same version as `apps/web`, because Vercel reads the Next.js version from the repository root and the root is a pnpm workspace with no `next` of its own; without it the build stops with `NEXT_NO_VERSION`.

## What Tofu changes

- `packages/db/src/client.ts`: the database client reads `DATABASE_URL` (Tofu's managed database) first and upstream's `POSTGRES_URL` second. With neither set it now throws `No database configured: set DATABASE_URL (or POSTGRES_URL) to a PostgreSQL connection string.` Before, it silently opened a PGlite database in `./pgdata`, which on a serverless host sits on temporary disk and loses every write.
- `packages/db/src/client.ts`: when the URL carries `sslmode` (Tofu's ends in `?sslmode=require`), the parameter is taken out and TLS is set explicitly. The connection is encrypted without certificate verification, or verified against `SUPABASE_CA_CERT` when that is set. Without this, node-postgres lets `sslmode=require` force full verification, which fails against the database pooler with `SELF_SIGNED_CERT_IN_CHAIN`. Host, port, user, password and database stay in the URL for pg to parse, and a URL without `sslmode` reaches pg unchanged, as it did upstream. `pgliteExtensions` is still exported for the integration tests.
- `supabase/migrations/*.sql` (new): byte-for-byte copies of the 36 files in `packages/db/migrations/`, so Tofu applies the schema before each build while the app's migrations switch is on. Tofu applies them in filename order. Drizzle's journal (`packages/db/migrations/meta/_journal.json`) lists three groups in a different order (`AddIntegrationsTable`/`AddOnDeleteActionToUserDeletion`, `AddWorkspaceWebhooks` against the three files dated after it, `AddGitHubIntegrationSupport`/`AddIsArchivedToBoard`). None of those files touches what the others create, so both orders build the same schema. The originals and the journal are untouched.
- `vercel.json` (new): builds `apps/web` from the repository root, because the app needs the workspace packages beside it. It sets the `nextjs` framework, the build command `pnpm --filter @kan/web build` and the output directory `apps/web/.next`. The build command runs apps/web's own `build` script unchanged (`pnpm --filter @kan/mcp build && pnpm with-env next build --turbo`). It deliberately skips `turbo run build`, whose strict environment mode hides undeclared variables from the build. Install stays Vercel's default `pnpm install`. `.npmrc` sets `node-linker=hoisted`, so `next` lands in the root `node_modules`, where Vercel's Next.js builder looks for it, and the builder picks up `apps/web/public` beside the output directory.
- `TOFU.md`: this file.

Nothing else changed: no upstream SQL, package manifest, lockfile or `turbo.json`. The Stripe code path is still there. It only loads with `NEXT_PUBLIC_KAN_ENV=cloud`, which a Tofu copy leaves unset.

## Deploying on Tofu

- Preset: `nextjs`. Tofu's detector reads a pnpm workspace root as `unknown`, so confirm `nextjs` before the database is connected.
- App root: the whole repository, not `apps/web`. The app imports `packages/*`.
- Build command: `pnpm --filter @kan/web build` (from `vercel.json`). Output directory: `apps/web/.next`.
- Database: Tofu's managed database, with the migrations switch on. Tofu sets `DATABASE_URL`; do not set it by hand.

## Settings the owner sets

| Name | Value | Kind |
|---|---|---|
| `BETTER_AUTH_SECRET` | a random string of 32 or more characters, e.g. from `openssl rand -base64 32` | secret: save it with *Hide this value after saving* |
| `NEXT_PUBLIC_BASE_URL` | the app's own address, e.g. `https://<app>.ontofu.app`, with no trailing slash | public |
| `NEXT_PUBLIC_ALLOW_CREDENTIALS` | `true`: turns on email-and-password sign-in | public |
| `NEXT_PUBLIC_DISABLE_EMAIL` | `true`: the copy has no email service yet | public |

- `NEXT_PUBLIC_*` values are fixed when the app is built (they are written into `apps/web/public/__ENV.js`), so deploy again after changing one.
- With email off there is no magic-link sign-in and no password-reset email, and people join a workspace through invite links instead of invitation emails.
- Google sign-in runs through Kan's own Better Auth, not Tofu's sign-in broker, so it needs the owner's own Google OAuth client. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (secret), and give the client the authorised redirect URI `<NEXT_PUBLIC_BASE_URL>/api/auth/callback/google`.
- Optional: `SUPABASE_CA_CERT` (a public CA certificate, PEM text or base64) verifies the database's TLS certificate instead of only encrypting. `BETTER_AUTH_TRUSTED_ORIGINS` is needed when the app also answers on a second address, such as a custom domain.
- Leave unset:
  - `NEXT_PUBLIC_KAN_ENV`: `cloud` turns on Kan's own billing.
  - `NEXT_PUBLIC_USE_STANDALONE_OUTPUT`: standalone output is for the Docker image, not Vercel.
  - `POSTGRES_URL`: ignored while `DATABASE_URL` is set.
- Avatars and attachments need S3-compatible storage (`S3_*`, `NEXT_PUBLIC_STORAGE_*` and the bucket names). Without it those uploads do not work.

## Needs a real deploy to verify

- The build log says `Detected Next.js version: 15.5.9`. The lockfile also carries `next@16.0.8`, installed for `better-auth`'s optional `next` peer in `packages/auth`. Vercel's builder reads whichever copy the hoisted install puts in the root `node_modules`.
- The build finds `apps/web/.next` (no `NEXT_OUTPUT_DIR_MISSING`), and files from `apps/web/public` such as `/__ENV.js` and `/favicon.ico` answer 200.
- The install step's root `postinstall` (`pnpm lint:ws`, which runs `pnpm dlx sherif@latest`) passes on Vercel.
- Tofu applies all 36 files in `supabase/migrations` to a fresh database. Watch two of them:
  - `20250508083758_SetupTables` needs `uuid_generate_v4()` from the `extensions` schema.
  - `20251001220136_AddFuzzySearchSupport` creates `pg_trgm`.
- Sign up with email and password, create a workspace, a board, a list and a card, then reload. The data is still there, and the runtime logs show no `No database configured`, `SELF_SIGNED_CERT_IN_CHAIN` or prepared-statement errors from the transaction pooler.
- Board and card search works (it calls `similarity()` from `pg_trgm`).
- With `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set, Google sign-in completes and returns to the app.
- `databaseStatus` lists `workspace_slugs` and `user_board_favorites` under tables without access rules. They are the only two upstream tables without row-level security, so the database's Data API, reachable with its public key, can read and change them. Every other table is locked the way upstream locks it, and the app itself is not affected.

## Licence

AGPL-3.0. Licence files and copyright notices stay as they are; every file Tofu changes carries a note saying so. Two kinds of file cannot carry one, and both are listed above: `vercel.json`, because JSON takes no comments, and the SQL copies in `supabase/migrations/`, which are unmodified.
