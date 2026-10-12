# Collab.io

A Roblox developer collaboration workspace, currently available as a **browser-only frontend preview**.

**Repository:** https://github.com/SillyDev2026/Collab.io  
**GitHub Pages (after enabling Pages):** https://sillydev2026.github.io/Collab.io/

## Current frontend (v0.1)

- Dashboard with project statistics and activity
- Projects: create, search, open and delete local workspaces
- Workspace: Luau example scripts, add scripts, line numbers, tab indentation and Ctrl+S / Cmd+S local saves
- Team: planned roles and invitation interface (not yet connected)
- Activity: local project event history
- Documentation: planned architecture and setup guide
- Settings: dark/light theme and reset
- Mobile-friendly navigation including narrow foldable screens

**Important:** This release deliberately does not claim to have live collaboration. Project data is stored in the local browser using localStorage, not on GitHub or a server. Clearing browser storage removes local edits. Never paste API keys or secrets into the local preview.

## Publish via GitHub Pages

This version is plain HTML, CSS, and JavaScript; no build step, Node.js, or custom domain is required.

1. Open [repository settings](https://github.com/SillyDev2026/Collab.io/settings/pages).
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**.
4. Press **Save**.
5. Once GitHub finishes publishing, open **https://sillydev2026.github.io/Collab.io/**.

New changes to the root files on main will be published automatically by GitHub Pages. Publishing may take a short period after enabling the site.

If you choose **GitHub Actions** as a Pages source instead, add a workflow for static deployment first. The instructions above use branch deployment and do **not** require a custom workflow.

## Repo layout

- index.html — accessible app shell, inline SVG icons, metadata
- styles.css — responsive design system and themes
- app.js — hash navigation, local models, Luau workspace and interactions
- favicon.svg — site icon
- README.md — this guide

Routes use hash URLs (e.g. #/projects or #/workspace/example). This avoids 404 errors on GitHub Pages refreshes.

## Planned cloud architecture (not yet deployed)

```text
GitHub Pages (frontend)
       |
       | HTTPS JSON APIs + authenticated WebSocket
       v
Cloudflare Workers (auth, APIs, GitHub/Discord integrations)
       |                |                 |
       v                v                 v
Durable Objects         D1                R2
rooms + presence        metadata          snapshots
       ^
       |
Roblox Studio plugin / optional local desktop companion
```

Planned milestones:

- v0.2: Cloud API scaffold, DB migrations, project CRUD, signed sessions
- v0.3: GitHub/Discord OAuth via backend; team roles and secure invite flows
- v0.4: Studio plugin pairing, script capture, review/merge safeguards
- v0.5: Real-time events, collaboration rooms, presence, conflict resolution
- v0.6: Revision history, backups, audit logs, offline replay, rate limits
- v1.0: Production hardening, testing, observability, mobile accessibility, docs

### Security requirements for backend work

- Do not put Discord bot tokens, GitHub secrets, OAuth client secrets, or Cloudflare API tokens in the GitHub Pages frontend.
- Enforce permissions on the backend for every project, script, and invite API route.
- Never directly execute user-provided Luau on the backend.
- Validate project IDs, request sizes, and websocket authorization; add rate limits and audit trails.
- For Roblox Studio synchronization, capture approved changes, use stable object identifiers and revisions, perform preview/dry-run, and require explicit apply for destructive operations.
- Protect against accidental loss with revision history, backups and concurrent modification checks.

## Local development

Clone the repository and serve its root using any static server:

```sh
python -m http.server 8000
```

Then open http://localhost:8000.

No dependencies are required for this frontend preview.

## Status

GitHub Pages publishing must be enabled in the repository's settings. The published domain is the standard GitHub Pages URL, **not** an owned `collab.io` domain.