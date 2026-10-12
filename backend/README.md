# Collab.io backend — GitHub sign-in and cloud projects

This folder is a **deployable Cloudflare Worker scaffold** for Collab.io v0.2. It is NOT automatically deployed by GitHub Pages. Deploy it separately in your own Cloudflare account.

## Features already coded

- GitHub OAuth authorization code login with PKCE, state-bound HTTP-only cookie and short-lived one-time exchange ticket
- SHA-256 hashed, revocable bearer sessions (7-day lifetime)
- GitHub identity and session data in Cloudflare D1
- Cloud project creation, listing, download and optimistic-concurrency updates (expected revision)
- Per-project owner, editor and viewer permissions with backend enforcement
- Project member list and direct access for users who already signed in
- Strict CORS for the configured website origin, bounded payloads, prepared SQL and no GitHub OAuth secrets exposed to the browser

**Not implemented:** Discord bot or DMs, a proper invitation acceptance flow, Studio sync, WebSockets, shared simultaneous editing, encrypted backups, GitHub repository writes, GitHub permissions syncing, audit trails and production-grade rate limiting. Do not describe these as active.

## Deploy (Cloudflare account required)

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/) and create/choose an account.
2. Create a **GitHub OAuth App** at https://github.com/settings/developers > OAuth Apps > New OAuth App.
   - **Application name:** Collab.io
   - **Homepage URL:** https://sillydev2026.github.io/Collab.io/
   - **Authorization callback URL:** the Worker URL that you will deploy, ending in **/auth/github/callback**. Example: \`https://collab-io-api.YOUR_SUBDOMAIN.workers.dev/auth/github/callback\`. You can edit this after deployment if the subdomain isn't known yet.
   - Keep the **Client ID** and **Client secret** private.
3. On a computer with Node.js, clone the repository and run:

\`\`\`sh
cd backend
npm install
npx wrangler login
npx wrangler d1 create collab-io
\`\`\`

4. Edit \`backend/wrangler.toml\` and replace \`REPLACE_WITH_D1_DATABASE_ID\` with the actual \`database_id\` from step 3. Do not modify \`PUBLIC_ORIGIN\` unless you moved the website.
5. Run database migrations:

\`\`\`sh
npx wrangler d1 migrations apply collab-io --remote
\`\`\`

6. Save OAuth credentials as Cloudflare secrets, **never in GitHub**:

\`\`\`sh
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npm run deploy
\`\`\`

7. Confirm the OAuth App callback URL exactly matches:

\`\`\`
https://YOUR_WORKER_URL/auth/github/callback
\`\`\`

8. Open \`config.js\` in the Collab.io GitHub repo and replace the empty \`apiBase\` with the deployed Worker URL:

\`\`\`js
window.COLLAB_CONFIG = Object.freeze({
  apiBase: "https://collab-io-api.YOUR_SUBDOMAIN.workers.dev"
});
\`\`\`

9. GitHub Pages will publish that frontend update. Refresh your Collab.io page, tap **Sign in**, authorize GitHub, and check that it returns showing your GitHub handle.

### API routes

| Method | Path | Access |
|---|---|---|
| GET | /health | Public |
| GET | /auth/github/start | Redirect to GitHub |
| GET | /auth/github/callback | GitHub OAuth callback |
| POST | /auth/exchange | One-time code |
| GET | /auth/me | Signed in |
| POST | /auth/logout | Signed in |
| GET | /api/projects | Signed in |
| POST | /api/projects | Signed in |
| GET | /api/projects/:id | Member |
| PUT | /api/projects/:id | Owner or editor, revision check |
| GET | /api/projects/:id/members | Member |
| POST | /api/projects/:id/members | Owner |

## Important security/UX notes

GitHub Pages and a workers.dev backend have **different origins**. The OAuth callback returns a single-use ticket in the URL fragment. The browser exchanges it for a temporary Collab.io session stored in \`sessionStorage\`. Backend database rows contain only a hash of the bearer token. GitHub's access token is used only to read account identity during login and is not stored.

Avoid placing tokens in local project scripts. Script contents are uploaded to D1 when **Publish to cloud** or **Update cloud revision** is pressed. Local edits do not automatically sync.

Browsers/devices do not share localStorage or sessionStorage. To use a project on another device, sign in there and **Import** the cloud revision. Imports create a separate local copy. A revision conflict fails instead of replacing remote content.

### Before production

Add anti-abuse rate limits for OAuth, cloud updates and membership changes, automated backups, stale-state cleanup, retention and deletion controls, monitoring, security reviews, invitation acceptance, and tests against a provisioned D1 database. Make sure quotas and terms of service suit your traffic.

### Next development stage

Use authenticated Durable Objects rooms and a Studio plugin to implement per-file edit locks or operations, server-side revisions, review/preview of incoming changes and project audit events. Roblox Studio plugin must never treat the web client as an authority to execute arbitrary Luau scripts.
