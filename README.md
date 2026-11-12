# Autoxide Web

Admin interface for [Autoxide](https://github.com/thuongtamduy/autoxide), the Rust backend
core. It only talks to the core's public REST API. Its pages need a signed-in account of the
core.

[Tiếng Việt](README.vi.md)

## Status

First screen: **modules**. It lists the modules installed in the core server and what each
declares: permissions, events, jobs, schedules, MCP tools, deprecated endpoints and migration
status. The screen is read-only: modules are compiled into the core, so installing or removing
one means rebuilding the core.

Works with Autoxide core **v0.5.0** or newer.

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
