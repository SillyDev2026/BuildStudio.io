# BuildStudio Studio Connect v1.1 — No Cloudflare

BuildStudio.io now includes a local Node.js bridge and a Roblox Studio plugin for two-way UI synchronization. The website stays on GitHub Pages, while your computer stores project snapshots locally. Studio Connect needs no Cloudflare, D1, OAuth, or GitHub credentials.

## One-time setup on Windows

1. Install Node.js 22 or newer from https://nodejs.org.
2. On GitHub, choose Code → Download ZIP for this repository and extract it.
3. Double-click bridge/start-windows.cmd, or open a terminal at the repository root and run:
   node bridge/server.mjs
4. The terminal prints a 12-character pairing code. Leave that terminal open.
5. In Roblox Studio, create a temporary Script, paste the full source from studio/BuildStudioConnect.luau, select the Script, and choose Plugins → Save as Local Plugin. Delete the temporary Script afterward.
6. Open the BuildStudio Studio Connect plugin, enter the terminal code, and press Pair. Approve local HTTP requests if Studio prompts you.
7. In a browser on that PC, open https://sillydev2026.github.io/BuildStudio.io/, click Connect Studio, enter the same code, and press Pair browser.
8. Choose Use Website version or Use Studio version if the two sides hold different designs.

Both the plugin and browser automatically reconnect using paired tokens on subsequent launches while Node is running. Sync is checked every 3 seconds. The bridge stores data in your home directory under .buildstudio-connect/state.json and binds exclusively to 127.0.0.1 by default.

### Live behavior

- Website → Studio: UI elements, positions, hierarchy, styling, and names update StarterGui → BuildStudioGui.
- Studio → website: Supported GuiObject edits under BuildStudioGui sync back to the browser.
- Revision tracking prevents silent overwrites when both sides make edits. Choose the winning copy explicitly during a conflict.
- Auth uses a random bearer token for each client. Only hashed tokens are persisted on the PC.
- The plugin only replaces BuildStudioGui and does not edit other ScreenGuis.

This is short-interval synchronization rather than sub-second frame streaming. Complex Roblox UI instances and offsets may not round-trip exactly, and custom gameplay scripts are not synchronized. Back up important projects as JSON.

## Optional: connect from a phone, still without Cloudflare

On your phone, localhost points to the phone, not the PC. Use a secure Tailscale private tailnet if you want to edit on your phone while Studio runs on your PC:

1. Install Tailscale on the PC and phone, sign in to the same private tailnet, and enable HTTPS certificates.
2. On the PC, while the Node bridge is running, execute:
   tailscale serve --bg 38471
3. Read the HTTPS .ts.net address printed by Tailscale Serve or run:
   tailscale serve status
4. Turn on Tailscale on your phone. Open BuildStudio.io, tap Connect Studio, paste the full private HTTPS .ts.net URL in Bridge address, and press Use this address.
5. Enter the pairing code displayed on the PC, then pair the browser. Keep Roblox Studio, the Node bridge, and Tailscale running on the PC.

This does not publicly expose the bridge. Do not use Tailscale Funnel, which shares it with the internet. Documentation: https://tailscale.com/docs/reference/tailscale-cli/serve

New Chrome versions may ask for Local Network Access permission when a public HTTPS website connects to localhost. Approve only when you are connecting to your own PC.

## API and security

Local base URL: http://127.0.0.1:38471
Browser CORS origins: https://sillydev2026.github.io and localhost:8000 local development.

- GET /health — unauthenticated health status (pair code never disclosed)
- POST /v1/pair — one-time code + client role; returns randomly generated token
- GET /v1/state — authenticated project snapshot and revision
- PUT /v1/state — authenticated revision-checked snapshot update
- POST /v1/disconnect — revoke a client token

The bridge persists only on your PC, rate-limits failed pairing, limits JSON bodies to 200 KB, and validates up to 500 components.

## Run tests

    npm run check
    npm test

Node tests cover pairing, wrong origins, role restrictions, website-to-Studio and Studio-to-website updates, revision conflicts, and disk persistence. Roblox Studio-specific Luau integration requires manual Studio testing.

## Compatibility

BuildStudio.io v1.0 features remain: responsive editor, hierarchy, templates, property inspector, JSON import/export, undo/redo, and two Luau exporters.

The older optional Cloudflare Worker implementation remains in the repository for legacy compatibility. It is neither started nor required by Studio Connect, and its Cloud button is hidden on the website.
