# Autoxide Web

Admin interface for [Autoxide](https://github.com/thuongtamduy/autoxide), the Rust backend
core. It only talks to the core's public REST API. Its pages need a signed-in account of the
core.

[Tiếng Việt](README.vi.md)

## Status

The admin frame follows the Autoxide admin design: an area bar (bottom bar on phones), a menu for
the screens of each area, a command palette (Ctrl K / ⌘K) and light, dark or system appearance.
An area shows up only when its module is installed in the core and your role grants its
permission.

Screens so far:

- **Overview**: the areas you can use.
- **Settings › General settings**, one tab each:
  - **Modules**: the modules installed in the core server and what each declares: permissions,
    events, jobs, schedules, MCP tools, deprecated endpoints and migration status. Read-only:
    modules are compiled into the core, so installing or removing one means rebuilding the core.
  - **Webhooks**: add endpoints that receive events (the signing secret is shown once), choose
    their events, turn them off and on, replace the secret, delete them and see each delivery.
    Needs `webhooks.manage`.
  - **Audit log**: who changed what and when, filtered by module, change, record or person, with
    the state before and after. Needs `audit.read`.
  - **Staff** links to Organization › Users and roles.
- **Settings › API keys and AI agents**: create keys for programs and AI agents with only the
  permissions they need and an expiry date (the key is shown once, with a `curl` command to try
  it), revoke them, and connect an AI agent to the core's MCP endpoint. Every signed-in account
  manages its own keys.
- **Settings › Developers**: recent webhook deliveries of every endpoint, the OpenAPI document of
  the core and its API docs page (when the core turns it on).
- **My account** (account menu, or Ctrl K): your profile and email verification, changing your
  email or password, two-step sign-in with an authenticator app and recovery codes, passkeys,
  the devices signed in to your account, downloading your data and deleting your account. Every
  signed-in account can open it; no permission is needed.
- **Organization › Users and roles**: find and page through user accounts with their roles and
  status; create an account, rename, disable or enable it, give it roles, set its first
  password, send it a password-reset mail, sign it out everywhere, turn off its two-step
  sign-in or delete it (each risky action asks first and says what happens). Roles: create and
  change them with a permission picker grouped by module, with search; the built-in `admin` role
  is read-only. Needs `auth.users.read` or `auth.roles.read`; changes need
  `auth.users.manage` / `auth.roles.manage`.
- **Pages opened from mail** (no sign-in needed): `/verify-email` confirms an email address,
  `/forgot-password` asks for a password-reset mail and `/reset-password` chooses the new
  password. Point the core's mail links here (see [Mail links](#mail-links)).

Parts of the design the core has no API for yet (invitations, delegation, public store profiles,
support access; plan and subscription, domains, partner connections, jobs; commands waiting for an
agent's approval; request log and events by record) are shown with **sample data**, marked "Sample data · waiting for API step N".
They show only when `AUTOXIDE_WEB_SAMPLE_DATA` is on (the default outside production); changes
there are kept in the app's memory and lost on restart.

Works with Autoxide core **v0.12.0** or newer.

## Requirements

- Node.js 22 or newer and [pnpm](https://pnpm.io) 10 (`corepack enable` installs the pinned
  version).
- A running Autoxide core (see its README), and an account that has the
  `kernel.modules.read` permission. The built-in `admin` role has every permission:

  ```bash
  autoxide user create --email you@example.com --name You --admin --password-stdin
  ```

## Getting started

```bash
pnpm install
cp apps/admin/.env.example apps/admin/.env.local   # then edit AUTOXIDE_API_URL if needed
pnpm --filter @autoxide/admin dev
```

Open <http://localhost:3000> and sign in with your core account.

### Configuration

| Variable                      | Default                 | Meaning                                                                                     |
| ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| `AUTOXIDE_API_URL`            | `http://127.0.0.1:8080` | Address of the core, without `/api/v1`. Only this app's server calls it; browsers never do. |
| `AUTOXIDE_WEB_SECURE_COOKIES` | `true` in production    | Send session cookies only over HTTPS. Turn it off only when serving over plain HTTP.        |
| `AUTOXIDE_WEB_SAMPLE_DATA`    | `false` in production   | Show screens and tabs that use sample data while the core has no API for them.              |

### Mail links

The core sends verification and password-reset mails. Set these two variables **on the core**
so the links in those mails open this app (replace the address with where this app is served):

```bash
AUTOXIDE_AUTH_EMAIL_VERIFICATION_URL=https://admin.example.com/verify-email?token={token}
AUTOXIDE_AUTH_PASSWORD_RESET_URL=https://admin.example.com/reset-password?token={token}
```

The core puts the token where `{token}` is. Without them, the mails contain the token and tell the
reader to call the API. During development the core writes mail as `.eml` files to
`AUTOXIDE_MAIL_FILE_DIR` (default `data/mail`) when no SMTP server is set; open the link from
there. Opening a verification link does nothing until the person presses "Confirm my email",
so mail scanners that open every link do not use up the token.

### Production

Build and run the standalone server:

```bash
pnpm build
PORT=3000 AUTOXIDE_API_URL=http://127.0.0.1:8080 pnpm --filter @autoxide/admin start
```

Or with Docker:

```bash
docker build -t autoxide-web .
```

```bash
docker run -p 3000:3000 -e AUTOXIDE_API_URL=http://core:8080 autoxide-web
```

Serve the app over HTTPS: its session cookies are marked `Secure` in production.

If you run more than one copy of this app behind a load balancer, turn on sticky sessions. Each
refresh token works once, and copies of the app do not share the refresh in progress.

## How it works

- **Sessions.** After sign-in, the core's access and refresh tokens are kept in `httpOnly`
  cookies. The browser never sees them. The app's server attaches the access token to every
  call to the core. When the access token expires, the proxy (`src/proxy.ts`) exchanges the
  refresh token for a new pair before the page renders.
- **Two-step sign-in.** Accounts with an authenticator app get a code step.
- **Devices.** The app's server forwards the browser's `User-Agent` to the core, so the list of
  sessions under My account names each device. The session id is kept in an `httpOnly` cookie
  too, to mark "this session" and keep it when signing out every other device.
- **Passkeys.** Adding a passkey runs WebAuthn in the browser; the options and the result go
  through the app's server. Passkeys work only when the core has `AUTOXIDE_AUTH_PASSKEY_RP_ID`
  set to the domain of this app and `AUTOXIDE_AUTH_PASSKEY_ORIGINS` lists its address (for
  example `https://admin.example.com`).
- **SDK.** `packages/sdk` holds TypeScript types generated from the core's `openapi.json` and a
  small client. To upgrade the core, raise `CORE_VERSION` in
  `packages/sdk/scripts/generate.mjs`, then run `pnpm sdk:generate`. The compiler then shows
  every call that no longer fits. `AUTOXIDE_OPENAPI=/path/to/openapi.json pnpm sdk:generate`
  uses a local file instead.
- **Languages.** English and Vietnamese. The app sends the chosen language to the core, so the
  core's error messages come back in the same language.

## Development

```bash
./gate.sh          # everything below, in order; must pass before a commit
pnpm lint          # Biome
pnpm typecheck
pnpm test          # Vitest
pnpm build
pnpm e2e           # Playwright, against a mock core (apps/admin/e2e/mock-core.ts)
```

End-to-end tests need a Chromium: run `pnpm --filter @autoxide/admin exec playwright install
chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing one.

## Project layout

| Path                | Contents                                                    |
| ------------------- | ----------------------------------------------------------- |
| `apps/admin`        | The admin app (Next.js, App Router)                         |
| `packages/sdk`      | Client and types generated from the core's OpenAPI document |
| `docs/DECISIONS.md` | Decision log (Vietnamese)                                   |

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option, like
the core.
