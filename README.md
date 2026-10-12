# BuildStudio.io

BuildStudio.io is a Roblox visual UI designer. Use the editor to create nested UI components, edit their scale-based positioning, preview device sizes, manage local projects, and export working Luau for a `LocalScript` in `StarterPlayerScripts`.

**Live site (after Pages deploy):** https://sillydev2026.github.io/BuildStudio.io/

## GitHub Pages

The repository is configured for publication from `main` / `/docs`. If Pages is not enabled, use Settings → Pages → Deploy from a branch → main → /docs. The `.nojekyll` file disables Jekyll conversion. All frontend files are within `/docs`.

## Editor

Includes Frame, TextLabel, TextButton, TextBox, ImageLabel, ImageButton, ScrollingFrame, templates, nested hierarchy, move and resize, inspector, undo/redo, local save, JSON export/import, and Luau export.

## Backend

The new frontend is standalone. `docs/config.js` intentionally has an empty API URL until a separate BuildStudio Cloudflare Worker and D1 database have been deployed. **Old Collab.io D1 data has not been deleted or migrated.** Do not expose GitHub OAuth secrets in the static website.

## Security

Local drafts reside in browser localStorage. Back up important work with JSON export. Generated Luau constructs UI instances only; gameplay logic/click handlers must be written separately.
