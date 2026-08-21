# Steam Library Tier List

A tier-list maker for publicly visible Steam libraries. Paste a SteamID64, vanity name, or Steam Community URL and arrange the games using Steam-hosted artwork. Rankings are saved in the browser.

## Features

- Public-library lookup through a Cloudflare Worker
- Native drag-and-drop tiers, N/A, multi-select, undo, reset, and PNG export
- Search, played/unplayed filter, and sort controls for the unranked pool
- Per-profile browser persistence at `steam-tier-list:<steamId>`
- Direct Steam CDN artwork with image fallback

## Architecture

GitHub Pages hosts `frontend/`. The Worker holds `STEAM_API_KEY` as a Cloudflare secret and only calls Steam's vanity-resolution and owned-games APIs. Artwork is loaded directly from Steam's CDN.

Steam requires both **Profile: Public** and **Game details: Public**. The app never asks users to sign in.

## Local development

Install Node 22+ and pnpm, then:

```bash
pnpm --dir frontend install
pnpm --dir worker install
cp frontend/.env.example frontend/.env.local
cd frontend && pnpm dev
# in another terminal
cd worker && pnpm dev
```

Set `VITE_API_BASE_URL=http://localhost:8787` in `frontend/.env.local`. For Worker local development, create `worker/.dev.vars` containing `STEAM_API_KEY=your_key` (never commit it).

## Deploy the Worker

Create a Steam Web API key, then update `ALLOWED_ORIGINS` in `worker/wrangler.toml` with the Pages origin (for a project page, use `https://YOUR_GITHUB_USERNAME.github.io`). Deploy:

```bash
cd worker
pnpm install
pnpm exec wrangler login
pnpm exec wrangler secret put STEAM_API_KEY
pnpm exec wrangler deploy
```

Save the resulting `https://...workers.dev` URL for the frontend configuration.

## Deploy GitHub Pages

In the GitHub repository, open **Settings → Pages** and set Source to **GitHub Actions**. Under **Settings → Secrets and variables → Actions → Variables**, add `VITE_API_BASE_URL` with the deployed Worker URL. Push to `main`; the workflow publishes the frontend at `https://lucas-mathieu.github.io/steam-tier-list-maker/`.

The Vite base path is enabled by the workflow. If the repository name changes, update `/steam-tier-list-maker/` in `frontend/vite.config.ts`.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
```

The test suites cover profile parsing, tier moves, numeric Worker lookup, and malformed input. A live test requires a Steam API secret and a public profile.

## Troubleshooting

- **Private library:** Make Profile and Game Details public in Steam privacy settings.
- **Vanity lookup fails:** Check the custom URL spelling; Steam's vanity resolver is used, not HTML scraping.
- **CORS error:** Add the exact Pages origin and local development origin to `ALLOWED_ORIGINS`.
- **Missing images:** Some Steam apps do not publish header art; the card remains usable with a fallback.
