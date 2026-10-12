# BuildStudio.io v1.0

Clean, dependency-free Roblox UI builder for desktop and mobile. Build ScreenGui designs visually, keep projects in your browser, export editable Luau code, or import saved JSON into Roblox Studio with the bundled plugin.

**Website:** https://sillydev2026.github.io/BuildStudio.io/  
**Repository:** https://github.com/SillyDev2026/BuildStudio.io

## The 0.2 → 1.0 feature roadmap (implemented together in v1)

| Milestone | Features |
|---|---|
| 0.2 | Nested UI components, undo/redo, visual inspector, responsive ratios, JSON and Luau export |
| 0.3 | Standalone model, project store, canvas renderer, cloud client |
| 0.4 | Redesigned desktop/mobile interface and accessible controls |
| 0.5 | Parent-relative drag/resize, 2.5% snapping, 1% keyboard nudging, zoom |
| 0.6 | Eight component types and nine starter templates |
| 0.7 | Anchors, rotation, ZIndex, font styling, borders, stroke, padding and native Roblox layouts |
| 0.8 | Searchable hierarchy, safe reparenting, layer ordering, clipboard, design audit |
| 0.9 | Runtime and Studio Luau exporters plus an offline Studio JSON importer |
| **1.0** | Full modular rewrite, v0.2 project migration, cloud schema compatibility, automated regression tests |

## How to use

1. Open the website. Use **Components** to add objects and **Templates** for starter designs.
2. Select a Frame, CanvasGroup, or ScrollingFrame before adding objects to nest them.
3. Drag the objects to position, use their corner handles to resize, or edit exact scale percentages under Properties.
4. Switch Desktop / Tablet / Phone aspect ratio; toggle Snap and Grid; change zoom.
5. Use **Export** to generate LocalScript Luau, Studio Command Bar Luau, or a project JSON backup.

**LocalScript mode:** Paste the code into a LocalScript under StarterPlayer → StarterPlayerScripts. The code adds the screen to PlayerGui.

**Studio mode:** Paste into Roblox Studio's Command Bar in edit mode. The code creates editable UI instances in StarterGui.

**Studio plugin:** Open [studio/BuildStudioImporter.luau](studio/BuildStudioImporter.luau), copy its source to a Script in Roblox Studio, select the Script, and choose **Plugins → Save as Local Plugin**. Open the resulting BuildStudio widget and paste the *contents* of a BuildStudio JSON export to import into StarterGui. No HTTP access or cloud account required. See [Roblox's plugin documentation](https://create.roblox.com/docs/studio/plugins).

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl/Cmd + Z, Ctrl/Cmd + Y | Undo, redo |
| Arrow, Shift + Arrow | Move selected node 1%, 5% |
| Ctrl/Cmd + D | Duplicate selected subtree |
| Ctrl/Cmd + C, Ctrl/Cmd + V | Copy/paste a selected subtree |
| Delete or Backspace | Delete selected object and descendants |
| Ctrl/Cmd + S, Ctrl/Cmd + E | Local save, export |
| Escape | Deselect |

### Project compatibility

The v1 editor continues to read browser storage key **buildstudio.v1.projects** and accepts the v0.2 JSON schema. Existing node IDs and parent relationships are preserved. Export JSON backups before deleting browser storage. Projects saved locally are not automatically published to the cloud.

## Project structure

- docs/index.html + docs/styles.css — responsive website
- docs/model.mjs — portable schema, validation, templates, layout functions, Luau exporters
- docs/store.mjs — browser storage, project management, migration, history
- docs/canvas.mjs — recursive UI preview and drag/resize engine
- docs/cloud.mjs — optional GitHub OAuth and D1 cloud adapter
- docs/app.js — modular UI controller, dialogs, editor shortcuts
- docs/config.js — public API URL only (no secrets)
- studio/BuildStudioImporter.luau — local Studio plugin
- worker/src/index.js — Cloudflare OAuth + private project API
- worker/migrations/ — database schema
- tests/ — automated unit tests and regressions

The frontend runs on GitHub Pages from branch **main**, folder **/docs**. It has no npm build step. To test locally, serve the repository root with Python's HTTP server and visit http://localhost:8000/docs/.

Run **npm run check** and **npm test**. GitHub Actions also runs these on pushes and PRs.

## Optional GitHub account and cloud projects

1. Create a Cloudflare D1 database named **buildstudio-io**.
2. Update the placeholder database UUID in worker/wrangler.jsonc with your own newly created BuildStudio database ID. Do not delete the old Collab.io D1 data.
3. Create a GitHub OAuth App named BuildStudio.io with homepage https://sillydev2026.github.io/BuildStudio.io/ and callback https://YOUR_WORKER_HOST/auth/github/callback.
4. Add repository Actions secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET.
5. Run **Actions → Deploy BuildStudio API → Run workflow**. This applies the D1 migrations and deploys your Worker with secret configuration.
6. Check your Worker /health endpoint and then set the public HTTPS Worker URL as apiUrl in docs/config.js.

Cloud projects are user-scoped; the API uses hashed bearer sessions, and v1 cloud updates accept an expected timestamp to detect conflicts. **Deploying GitHub Pages alone does not enable GitHub sign-in or remote saves.** The front end works locally even before cloud activation.

## Limitations

- Browser preview approximates Roblox UI layout. Native Roblox UIListLayout/UIGridLayout are created in exports; they may differ from the preview.
- Export generates visual UI instances. Button behavior, purchases, gameplay, Roblox data, and other functionality must be scripted separately.
- Cloudflare/GitHub OAuth and a custom .io domain require manual service setup.
- The Studio importer is an offline JSON importer, not live two-way Studio sync.
- Automated Node tests do not execute the Studio plugin or validate live OAuth; those require manual Roblox/Cloudflare testing.
