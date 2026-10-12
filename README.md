# BuildStudio.io

Visual Roblox UI designer. The old Collab.io website and API files have been replaced.

**Live frontend:** https://sillydev2026.github.io/BuildStudio.io/

## GitHub Pages
Under Settings → Pages, publish `main` branch from `/docs`. The `.nojekyll` file bypasses Jekyll. No build step required.

## Editor features
Frame, TextLabel, TextButton, TextBox, ImageLabel, ImageButton, ScrollingFrame; nested layers; position/size inspector; drag-to-move and resize; undo/redo; Starter HUD and Shop templates; desktop/tablet/mobile preview; local autosave; JSON import/export; Luau export.

## Cloud backend setup (optional, not yet deployed)
The editor works locally immediately. GitHub sign-in and cloud projects need a new Cloudflare Worker and a **new BuildStudio.io D1 database**. The previous Collab.io D1 database remains untouched.

1. Create a D1 database named `buildstudio-io` in Cloudflare.
2. In `worker/wrangler.jsonc`, replace `REPLACE_WITH_NEW_BUILDSTUDIO_D1_ID` with the new D1 database UUID.
3. Create a GitHub OAuth App named `BuildStudio.io` with homepage `https://sillydev2026.github.io/BuildStudio.io/` and callback `https://buildstudio-io-api.YOUR_SUBDOMAIN.workers.dev/auth/github/callback` (replace with your actual Worker URL).
4. Set the GitHub repository Actions secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
5. Use **Actions → Deploy BuildStudio API → Run workflow**. The workflow installs Wrangler, migrates the new D1 database, deploys the Worker, and stores OAuth values as Worker secrets.
6. Verify `https://YOUR_WORKER/health` returns the BuildStudio API health response.
7. Edit `docs/config.js` and set `apiUrl` to your HTTPS Worker URL without a trailing slash. GitHub sign-in will become available.

Never place a client secret, Cloudflare token, or access token in the frontend or tracked repository. No D1 migration is run merely by committing these files.

## Luau export
Use **Luau** or **Export**. Paste the script into a `LocalScript` in `StarterPlayer > StarterPlayerScripts`. It creates a ScreenGui and visual objects with `UDim2.fromScale`. Button click behaviors must be scripted separately.

## Tests
`npm run check` and `npm test`. Automated tests cover the templates, project model, Luau export, Worker health, CORS and configuration errors. Live OAuth and remote D1 functionality must be validated after deployment.

**Note:** `BuildStudio.io` is a project name; a custom `.io` domain requires registration and DNS configuration.
