# Collab.io v0.2 — Roblox developer collaboration platform

**Site:** https://sillydev2026.github.io/Collab.io/  
**GitHub repository:** https://github.com/SillyDev2026/Collab.io

Collab.io is a mobile-friendly Roblox/Luau development workspace on GitHub Pages, with an optional Cloudflare backend for GitHub login, remote projects and role-based access. It is being developed alongside [Luau Developer Playground](https://github.com/SillyDev2026/Luau-Developer-Playground).

## What works in v0.2

- Responsive overview, projects, workspace, team, activity, docs and settings pages
- Luau syntax coloring and line-number gutter based on the Playground editor
- Indentation, bracket pairing, cursor position, auto-saving local drafts, Ctrl+S and search
- Autocomplete suggestions for locals, Luau keywords and common Roblox APIs (lexical only)
- Mobile script editor and Luau text-file export
- Local projects saved in browser localStorage
- **When a Cloudflare backend is configured:** GitHub OAuth login, project cloud publishing/import, revision checks, project membership and owner/editor/viewer roles

The frontend and backend source files are committed. **The backend is not deployed by the static website.** Until Cloudflare and GitHub OAuth are configured, sign-in and cloud features cannot work.

## Frontend hosting — GitHub Pages

Enable Pages via https://github.com/SillyDev2026/Collab.io/settings/pages and select **Deploy from a branch**, branch **main**, folder **/(root)**. The site is plain HTML/CSS/JS. Hash-based routes such as #/workspace work without additional rewrite rules. GitHub Pages updates after the repository deploy succeeds.

## Activate GitHub sign-in

Cloud services require a Cloudflare account, D1 database, Worker and a GitHub OAuth App.

Read **[backend/README.md](backend/README.md)** for the step-by-step guide. It includes:

1. Create the D1 database, put its database ID into backend/wrangler.toml.
2. Register GitHub OAuth App with callback **https://YOUR_WORKER_URL/auth/github/callback**.
3. Apply database migrations and deploy Cloudflare Worker.
4. Store GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET as Cloudflare secrets.
5. Set \`window.COLLAB_CONFIG.apiBase\` in config.js to the deployed API HTTPS URL.

You can alternatively deploy from GitHub on your **phone** using the manual [Deploy Collab.io API workflow](.github/workflows/deploy-api.yml). To use it, add these GitHub Actions repository secrets under Settings → Secrets and variables → Actions:

- \`CLOUDFLARE_API_TOKEN\`: a Cloudflare API token scoped for Workers deployment and D1
- \`CLOUDFLARE_ACCOUNT_ID\`: your Cloudflare account ID
- \`GITHUB_CLIENT_ID\`: GitHub OAuth App client ID
- \`GITHUB_CLIENT_SECRET\`: GitHub OAuth App client secret

Still create D1 and update \`wrangler.toml\` first. Then open Actions → Deploy Collab.io API → Run workflow. Do not put secrets in files or issues. Finally set \`apiBase\` in config.js.

## Cloud behavior

Signing in uses GitHub OAuth with CSRF state checking and PKCE. The Worker stores session hashes in D1; the browser stores the Collab.io bearer token in sessionStorage. GitHub client secrets and GitHub access tokens are not stored in the frontend.

- A user can explicitly publish a local project to the cloud.
- They can create further revisions, with server-side collision detection.
- Signed-in teammates can import a cloud project as a local workspace.
- Owners can grant access to GitHub accounts that already signed in.
- Editors can save updates; viewers cannot.
- Conflicts do not silently overwrite newer remote revisions.

### Limitations

This release does **not** yet offer real-time collaborative cursors, WebSockets, Studio live sync, a working Discord bot, project invitation acceptance, GitHub repository write-back, or full Luau type checking/running. Lexical completions are not a Roblox Studio type checker. Local projects do not become cloud projects unless explicitly published.

For production, add rate limiting, automatic backups, auditing, team invitation acceptance, D1 capacity limits, Cloudflare billing review, extensive integration testing and security hardening.

## Repository structure

\`\`\`
index.html                Browser application shell
styles.css                Responsive theme and editor colors
app.js                    Pages, Luau workspace, cloud client
config.js                 Public backend URL (never contains secrets)
editor/                   Adapted Luau Developer Playground editor components
backend/src/index.js      Cloudflare API: OAuth, projects, members
backend/migrations/       D1 database schema
backend/wrangler.toml     Worker configuration
backend/README.md         Cloud deployment and OAuth setup
.github/workflows/        Manual API deployment
\`\`\`

## Local frontend development

\`\`\`sh
python -m http.server 8000
\`\`\`

Open http://localhost:8000. The frontend works as a local editor without any cloud account.

**Status:** v0.2 frontend committed; deployment/production activation remains a separate step.
