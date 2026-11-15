# Autoxide Web

Admin interface and public storefront website for [Autoxide](https://github.com/thuongtamduy/autoxide),
the Rust backend core. Both only talk to the core's public REST API. The admin pages need a
signed-in account of the core; the storefront (see [Storefront website](#storefront-website)) is
open to everyone.

[Tiếng Việt](README.vi.md)

## Status

The admin follows the Autoxide admin design: an area bar (bottom bar on phones), a menu for the
screens of each area with a count of waiting work next to each screen, a command palette
(Ctrl K / ⌘K) and light, dark or system appearance (remembered per account, so it follows you to
another device when you sign in). An area shows up only when its module is
installed in the core and your role grants its permission.

In-app help: a **?** button on every page (or the `?` key) opens the guides of that page, keyboard
shortcuts and what's new; an ⓘ icon next to a section explains it in place; a short card
introduces a new feature until you press "Got it". Dismissed cards and seen news are remembered
per account by the core (`/api/v1/me/flags`), so they stay dismissed on every device.

**Screens on the core's real API**

- **Overview** and **Work and activity**: greeting, figures, the work waiting for you gathered from
  every area (snooze or hand over an item), setup steps and recent activity from the audit log.
- **Content**: posts and pages with the block editor, review and scheduling, version history;
  filters for posts awaiting review, my posts, AI-labelled posts and missing translations, and the
  upcoming schedule of every post; pages, categories, tags, authors (with post counts) and
  redirects; **website menus** (category bar, mega menu, footer; items point to posts, categories
  or addresses; storefront preview); the **media library** (upload, folders, tags, alt text per
  language with optional AI suggestions, decorative images, library totals, trash).
- **Marketing**: forms and their submissions (counts per status, CSV export, also in the
  background for large forms), newsletter lists, campaigns (the mail exactly as sent, bounces and
  unsubscribes) and subscribers, comment moderation (plain text or Markdown) and the posts that
  have comments.
- **Organization › Users and roles**: accounts with their roles, status filter and last sign-in,
  roles with a permission picker (risky permissions are labelled), first password and two-step
  sign-in reset only where they apply, sign-out everywhere, removing the passkeys of someone who
  lost their device.
- **Settings**: modules, per-customer settings, webhooks (with their last delivery), audit log,
  API keys and AI agents (MCP; confirm a new key with a password, an authenticator code or a
  passkey; administrators see and revoke everyone's keys), developer tools.
- **My account**: profile, email and password (cancel a pending email change; an account without a
  password gets a link to set one), two-step sign-in, passkeys with their kind, devices with how and
  from which country they signed in, your data.
- **Platform console › Customers and Database fleet**: the customers and placements of the core;
  add, rename, suspend and resume a customer.
- **Pages opened from mail** (no sign-in): verify an email, forgot and reset password, and "it was
  not me" when someone else changed your email.

**Screens on sample data** (marked "Sample data · waiting for API step N"), because the core
builds them in later steps: Sales (orders, returns, counter sales, shipping and COD, stores,
sales channels), Products (catalog, prices, tax groups, inventory), Marketing (promotions,
affiliate marketing), Customers, Marketplace and the Seller Center, Finance (ledger, e-invoices,
tax), Organization tree, Compliance, and the rest of the Platform console (plans, subscriptions,
provisioning, health, customer data access). Parts of the real screens the core
has no API for yet use sample data the same way. Sample data shows only when
`AUTOXIDE_WEB_SAMPLE_DATA` is on (the default outside production); changes there are kept in the
app's memory and lost on restart. The sample records agree across screens (an order, its
shipment, its ledger entries and its invoice are the same order).

Works with Autoxide core from commit `27380c9` of its `main` branch or newer (the next release,
v0.15.0, will include it).

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

The core sends verification and password-reset mails, and tells the old address when an account's
email changes. Set these variables **on the core** so the links in those mails open this app
(replace the address with where this app is served):

```bash
AUTOXIDE_AUTH_EMAIL_VERIFICATION_URL=https://admin.example.com/verify-email?token={token}
AUTOXIDE_AUTH_PASSWORD_RESET_URL=https://admin.example.com/reset-password?token={token}
AUTOXIDE_AUTH_EMAIL_CHANGE_REPORT_URL=https://admin.example.com/not-me?token={token}
```

The core puts the token where `{token}` is. Without them, the mails contain the token and tell the
reader to call the API. During development the core writes mail as `.eml` files to
`AUTOXIDE_MAIL_FILE_DIR` (default `data/mail`) when no SMTP server is set; open the link from
there. Opening a verification link does nothing until the person presses "Confirm my email",
so mail scanners that open every link do not use up the token. The same goes for `/not-me`: the
account is locked only when the person presses "It was not me".

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

## Storefront website

`apps/storefront` is the public website of one shop (decision D-200 of the core): home page,
categories, products, cart and checkout, seller pages, articles with products, the buyer's
account; the blog is one section of it. It follows the storefront boards of the Autoxide design
(category bar with a mega menu, balanced grids, money that never wraps) in light and dark, and in
four looks (`AUTOXIDE_STOREFRONT_THEME`).

- **On the core's real API** (public endpoints only, called by the website's server): the header
  and footer menus (`main`, `footer`), the blog with categories, tags, authors and paging, articles
  and static pages at any address the core knows (redirects included), comments under articles
  (guests can write when the core allows it), search in articles and pages, the newsletter sign-up
  and the pages its mails link to, draft previews, `sitemap.xml`, `robots.txt` and an RSS feed.
- **On sample data** (marked with a small "sample" tag and a notice bar), until the core has the
  APIs: products, prices, discount codes, stock per store, stores, the cart, sellers. Pages built on
  it: all products and product categories (`/danh-muc`, `/danh-muc/<slug>`: filters for material,
  hob type, price, rating, seller and "in stock at my store", six sort orders, paging), product
  pages (`/san-pham/<slug>`: gallery, options, list price with the code price and the reference
  price of a flash sale, delivery date and stock per store, reviews with filters, questions and
  answers, seller and legal information, JSON-LD), deals (`/khuyen-mai`: flash sale countdown,
  codes, automatic offers, promotion notices) and livestream (`/livestream`: live show, pinned
  products, schedule). The header search suggests keywords, categories, products, articles and
  stores. When sample data is off these sections are hidden and the site shows only what the core
  serves. A menu the core does not have yet is replaced by a sample menu while sample data is on.
- **Languages in the address**: Vietnamese at `/`, English under `/en`, with `hreflang` links.

Run it next to the admin:

```bash
cp apps/storefront/.env.example apps/storefront/.env.local   # then edit if needed
pnpm --filter @autoxide/storefront dev                       # http://localhost:3300
```

| Variable                    | Default                 | Meaning                                                                  |
| --------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| `AUTOXIDE_API_URL`          | `http://127.0.0.1:8080` | Address of the core, without `/api/v1`. Browsers never call it directly. |
| `AUTOXIDE_STOREFRONT_URL`   | `http://localhost:3000` | Public address of the website: canonical links, sitemap, RSS.            |
| `AUTOXIDE_STOREFRONT_NAME`  | sample shop / Autoxide  | Name of the shop in the header, footer and titles.                       |
| `AUTOXIDE_STOREFRONT_THEME` | `default`               | Look: `default`, `market`, `minimal` or `luxe`.                          |
| `AUTOXIDE_WEB_SAMPLE_DATA`  | `false` in production   | Show the shop sections that use sample data.                             |

Set these **on the core** so its mails link to the website:

```bash
AUTOXIDE_NEWSLETTER_CONFIRM_URL=https://www.example.com/newsletter/confirm?token={token}
AUTOXIDE_NEWSLETTER_PREFERENCES_URL=https://www.example.com/newsletter/preferences?token={token}
AUTOXIDE_NEWSLETTER_SITE_URL=https://www.example.com
AUTOXIDE_COMMENTS_VERIFY_URL=https://www.example.com/comments/verify?token={token}
AUTOXIDE_COMMENTS_UNSUBSCRIBE_URL=https://www.example.com/comments/unsubscribe?token={token}
AUTOXIDE_COMMENTS_SITE_URL=https://www.example.com
```

The website's server sends comments and sign-ups to the core on behalf of visitors and passes on
the `X-Forwarded-For` header it received, so the core can limit by the visitor's address: put the
website behind a reverse proxy that sets that header, and list the website's server in the core's
`AUTOXIDE_HTTP_TRUSTED_PROXIES` (with `AUTOXIDE_HTTP_CLIENT_IP_HEADER=X-Forwarded-For`). The
newsletter form shows when the core has at least one public list. Draft previews open at
`/preview?token=…`. In production: `pnpm build`, then
`PORT=3000 AUTOXIDE_API_URL=… AUTOXIDE_STOREFRONT_URL=… pnpm --filter @autoxide/storefront start`,
or `docker build --build-arg APP=storefront -t autoxide-storefront .`.

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
pnpm e2e           # Playwright for both apps, against a mock core (apps/admin/e2e/mock-core.ts)
```

End-to-end tests need a Chromium: run `pnpm --filter @autoxide/admin exec playwright install
chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing one.

## Project layout

| Path                | Contents                                                    |
| ------------------- | ----------------------------------------------------------- |
| `apps/admin`        | The admin app (Next.js, App Router)                         |
| `apps/storefront`   | The public storefront website (Next.js, App Router)         |
| `packages/sdk`      | Client and types generated from the core's OpenAPI document |
| `docs/DECISIONS.md` | Decision log (Vietnamese)                                   |

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option, like
the core.
