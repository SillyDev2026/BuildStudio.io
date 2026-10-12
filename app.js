import { CodeEditor } from './editor/v1-editor.js';
import { completeLuau } from './editor/completions.js';
import { textareaCaretOffset, placeCompletionPopup } from './editor/completion-geometry.js';
/* Collab.io — GitHub Pages front end.
 * Local Preview: data stays in this browser only. No cloud sync or login is claimed.
 */
(function () {
  "use strict";

  var STORE = "collab-io-preview-v1";
  var THEME = "collab-io-theme";
  var ROOT = document.getElementById("app");
  var toastTimer = null;
  var activeEditor = null;
  var activeScript = null;
  var activeCompletion = null;
  var completionIndex = 0;
  var modal = "";
  var authToken = "";
  var authUser = null;
  var cloudProjects = [];
  function apiBase() {
    try {
      var raw = String(window.COLLAB_CONFIG?.apiBase || "");
      var url = new URL(raw);
      if (url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost")) return url.origin;
    } catch (_) {}
    return "";
  }
  function signedIn() { return !!authToken && !!authUser; }
  async function callAPI(path, method, body) {
    if (!apiBase()) throw Error("Backend not configured");
    var headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (authToken) headers.Authorization = "Bearer " + authToken;
    var response = await fetch(apiBase() + path, { method: method || "GET", headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
    var result = await response.json().catch(function () { return {}; });
    if (!response.ok) throw Error(result.error || "HTTP " + response.status);
    return result;
  }
  async function refreshCloud() {
    if (!signedIn()) return;
    try { cloudProjects = (await callAPI("/api/projects")).projects || []; }
    catch (error) { notice("Cloud: " + error.message); }
  }
  async function initAuth() {
    var ticket = /\bauth_ticket=([A-Za-z0-9_-]{43})\b/.exec(location.hash)?.[1];
    if (ticket) {
      history.replaceState(null, "", location.pathname + location.search + "#/overview");
      try {
        var result = await callAPI("/auth/exchange", "POST", { ticket });
        authToken = result.token;
        authUser = result.user;
        sessionStorage.setItem("collab_access", authToken);
        notice("Signed in as @" + authUser.login);
      } catch (error) { notice("Sign-in failed: " + error.message); }
    } else {
      try { authToken = sessionStorage.getItem("collab_access") || ""; } catch (_) {}
      if (authToken && apiBase()) {
        try { authUser = (await callAPI("/auth/me")).user; }
        catch (_) { authToken = ""; try { sessionStorage.removeItem("collab_access"); } catch (_) {} }
      }
    }
    if (signedIn()) await refreshCloud();
    render();
  }
  function startSignIn() {
    if (!apiBase()) { location.hash = "#/settings"; notice("Configure and deploy the Cloudflare backend first."); return; }
    location.assign(apiBase() + "/auth/github/start");
  }
  async function signOut() {
    try { if (authToken) await callAPI("/auth/logout", "POST"); } catch (_) {}
    authToken = "";
    authUser = null;
    cloudProjects = [];
    try { sessionStorage.removeItem("collab_access"); } catch (_) {}
    render(); notice("Signed out");
  }
  async function syncCloud(projectId) {
    var project = getProject(projectId);
    if (!project || !signedIn()) return;
    if (!confirm("Upload this project's Luau scripts to Collab.io cloud storage?")) return;
    var scripts = project.scripts.map(function (f) { return { name: f.name, source: f.source }; });
    try {
      if (project.cloud_id) {
        var updated = await callAPI("/api/projects/" + encodeURIComponent(project.cloud_id), "PUT", {
          name: project.name, description: project.description, scripts, expected_revision: project.cloud_revision
        });
        project.cloud_revision = updated.revision;
      } else {
        var created = await callAPI("/api/projects", "POST", { name: project.name, description: project.description, scripts });
        project.cloud_id = created.project.id;
        project.cloud_revision = created.project.revision;
      }
      save(); activity("Cloud revision saved", project.name);
      await refreshCloud(); render();
      notice("Synced cloud revision " + project.cloud_revision);
    } catch (error) {
      notice(error.message === "revision_conflict" ? "Revision conflict — cloud copy was not overwritten." : "Cloud save: " + error.message);
    }
  }
  async function importCloud(id) {
    try {
      var result = await callAPI("/api/projects/" + encodeURIComponent(id));
      var remote = result.project;
      var project = { id: makeId(), name: remote.name, description: remote.description, updated: Date.now(),
        cloud_id: remote.id, cloud_revision: remote.revision, sample: false,
        scripts: remote.scripts.map(function (f) { return { id: makeId(), name: f.name, source: f.source }; }) };
      state.projects.unshift(project); activity("Imported cloud revision", project.name);
      selectedScript = ""; location.hash = "#/workspace/" + project.id;
      render(); notice("Cloud project imported locally");
    } catch (error) { notice("Cloud import: " + error.message); }
  }

  var selectedScript = "";
  var sidebarOpen = false;
  var gradients = [
    "linear-gradient(130deg,#8066f5,#5448c5)",
    "linear-gradient(130deg,#24b6a1,#17728e)",
    "linear-gradient(130deg,#ea9a69,#ca5582)",
    "linear-gradient(130deg,#4b93f7,#5f5acb)",
    "linear-gradient(130deg,#b870ec,#744ae0)"
  ];

  function sampleScripts() {
    return [
      { id: "server", name: "ServerMain.server.luau", source: "--!strict\n-- Collab.io example ServerScript\nlocal Players = game:GetService(\"Players\")\n\nPlayers.PlayerAdded:Connect(function(player)\n    print(\"Welcome, \" .. player.Name)\nend)\n" },
      { id: "client", name: "ClientMain.client.luau", source: "--!strict\n-- Collab.io example LocalScript\nlocal Players = game:GetService(\"Players\")\nlocal player = Players.LocalPlayer\n\nprint(\"Client ready for \" .. player.Name)\n" },
      { id: "module", name: "Config.luau", source: "--!strict\n-- Collab.io example ModuleScript\nlocal Config = {\n    Debug = false,\n    AutoSaveInterval = 120,\n}\n\nreturn Config\n" }
    ];
  }
  function samples() {
    var now = Date.now();
    return {
      projects: [
        { id: "sample-obby", name: "Obby Framework", description: "Reusable checkpoints, rounds, and progression logic.", updated: now - 7200000, scripts: sampleScripts(), sample: true },
        { id: "sample-combat", name: "Combat Prototype", description: "A modular combat system with ability components.", updated: now - 86400000, scripts: sampleScripts(), sample: true },
        { id: "sample-ui", name: "UI Toolkit", description: "Scalable interface components for Roblox experiences.", updated: now - 172800000, scripts: sampleScripts(), sample: true }
      ],
      activity: [
        { id: "sample-event-1", action: "Welcome to your Collab.io preview workspace", project: "Getting started", time: now - 600000, sample: true },
        { id: "sample-event-2", action: "Added example scripts", project: "Obby Framework", time: now - 7200000, sample: true },
        { id: "sample-event-3", action: "Prepared a sample workspace", project: "Combat Prototype", time: now - 86400000, sample: true }
      ]
    };
  }
  function load() {
    try {
      var value = JSON.parse(localStorage.getItem(STORE) || "null");
      if (value && Array.isArray(value.projects) && Array.isArray(value.activity)) return value;
    } catch (error) { console.warn("Could not load local preview data", error); }
    return samples();
  }
  var state = load();
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); }
    catch (error) { notice("Browser storage is full or unavailable. Changes may not persist."); }
  }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function icon(name, more) {
    return '<svg class="icon ' + (more || "") + '" aria-hidden="true"><use href="#i-' + esc(name) + '"></use></svg>';
  }
  function badge(text, cls) { return '<span class="badge ' + (cls || "") + '">' + esc(text) + "</span>"; }
  function timeAgo(timestamp) {
    var minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return minutes + "m ago";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "h ago";
    return Math.floor(hours / 24) + "d ago";
  }
  function projectIcon(project) {
    var sum = 0;
    for (var i = 0; i < project.id.length; i++) sum += project.id.charCodeAt(i);
    var gradient = gradients[sum % gradients.length];
    var letters = project.name.trim().split(/\s+/).slice(0, 2).map(function (word) { return word[0] || ""; }).join("").toUpperCase();
    return '<span class="project-logo" style="background:' + gradient + '">' + esc(letters) + "</span>";
  }
  function navLink(route, label, iconName, active) {
    return '<a class="nav-item ' + (active ? "active" : "") + '" href="#/' + route + '" data-close-nav="1">' + icon(iconName) + "<span>" + esc(label) + "</span></a>";
  }
  function route() {
    var raw = (location.hash || "#/overview").replace(/^#\/?/, "");
    var pieces = raw.split("/");
    var page = pieces[0] || "overview";
    if (["overview", "projects", "workspace", "team", "activity", "docs", "settings"].indexOf(page) === -1) page = "overview";
    return { page: page, id: pieces[1] || "" };
  }
  function getProject(id) { return state.projects.find(function (p) { return p.id === id; }); }
  function activity(action, project) {
    state.activity.unshift({ id: "event-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5), action: action, project: project, time: Date.now(), sample: false });
    state.activity = state.activity.slice(0, 75);
    save();
  }
  function notice(message) {
    var node = document.getElementById("toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove("show"); }, 3500);
  }
  function pageHead(title, description, button) {
    return '<div class="page-head"><div><div class="eyebrow">' + icon("bolt", "tiny") + ' COLLAB.IO / LOCAL PREVIEW</div><h1>' + title + '</h1><p>' + description + '</p></div>' + (button || "") + '</div>';
  }
  function listProject(p) {
    return '<button class="project-row" data-open="' + esc(p.id) + '">' + projectIcon(p) +
      '<span class="detail"><strong>' + esc(p.name) + '</strong><p>' + esc(p.description || "No description") + '</p></span>' +
      (p.sample ? badge("Sample") : badge("Local")) + icon("chevron", "right-icon") + "</button>";
  }
  function feedItem(e) {
    return '<div class="feed-item"><span class="feed-avatar">' + icon(e.sample ? "layers" : "check") +
      '</span><div class="feed-body"><strong>' + esc(e.action) + '</strong><p>' + esc(e.project) +
      (e.sample ? ' · Sample activity' : ' · Local activity') + '</p><time datetime="' + new Date(e.time).toISOString() + '">' +
      timeAgo(e.time) + "</time></div></div>";
  }
  function overview() {
    return '<div class="hero"><div class="hero-content"><div class="eyebrow"><span class="small-dot"></span> THE DEVELOPER WORKSPACE</div>' +
      '<h1>Build together.<br><em>Ship better.</em></h1><p>Your projects, scripts, and team workspace in one place. This preview saves changes only on your device.</p>' +
      '<button class="btn primary" data-new-project="1">' + icon("plus") + ' Create a project</button> <a class="btn ghost" href="#/docs">Explore the roadmap ' + icon("arrow") + '</a></div>' +
      '<div class="hero-art"><div class="orb one"></div><div class="orb two"></div><div class="orb three"></div></div></div>' +
      '<div class="stats">' +
      stat("Projects", state.projects.length, "Stored on this device", "layers") +
      stat("Script files", state.projects.reduce(function (n, p) { return n + p.scripts.length; }, 0), "Editable in local preview", "code") +
      stat("Team members", "1", "You · local preview", "users") +
      stat("Cloud sync", "Off", "Backend not connected", "shield") + "</div>" +
      '<div class="two-col"><section><div class="section-head"><h2>Recent projects</h2><a href="#/projects">View all ' + icon("arrow", "tiny") + '</a></div>' +
      '<div class="card panel"><div class="project-list">' + (state.projects.length ? state.projects.slice(0, 4).map(listProject).join("") : emptyProjects()) +
      '</div></div></section><section><div class="section-head"><h2>Recent activity</h2><a href="#/activity">View all ' + icon("arrow", "tiny") + '</a></div>' +
      '<div class="card panel"><div class="feed">' + state.activity.slice(0, 4).map(feedItem).join("") + "</div></div></section></div>";
  }
  function stat(label, value, foot, iconName) {
    return '<div class="card stat-card"><div class="meta"><span>' + esc(label) + '</span>' + icon(iconName) + '</div><div class="stat-number">' + esc(value) +
      '</div><div class="stat-foot">' + esc(foot) + "</div></div>";
  }
  function emptyProjects() {
    return '<div class="empty">' + icon("layers", "large") + '<h3>No projects yet</h3><p>Create a project to get started.</p><button class="btn primary small" data-new-project="1">' + icon("plus") + " Create project</button></div>";
  }
  function projectsPage() {
    var cards = state.projects.map(function (p) {
      return '<button class="card project-tile" data-open="' + esc(p.id) + '" data-project-title="' + esc((p.name + " " + p.description).toLowerCase()) +
        '"><div class="tile-top">' + projectIcon(p) + (p.sample ? badge("Sample") : badge("Local")) +
        '</div><h3>' + esc(p.name) + '</h3><p>' + esc(p.description || "No description provided") +
        '</p><div class="tile-footer"><span>' + icon("file", "tiny") + " " + p.scripts.length + ' scripts</span><span>' + timeAgo(p.updated) + " " + icon("arrow", "tiny") + "</span></div></button>";
    }).join("");
    return pageHead("Your projects", "Manage your Roblox development workspaces.", '<button class="btn primary" data-new-project="1">' + icon("plus") + ' New project</button>') +
      '<div class="toolbar"><div class="search-wrap">' + icon("search") + '<input id="project-search" type="search" placeholder="Search projects" aria-label="Search projects"></div>' +
      badge(state.projects.length + " projects") + '</div><div class="project-grid" id="project-grid">' + cards +
      '</div><div id="project-no-match" class="empty" style="display:none">No projects match your search.</div>' +
      (state.projects.length ? "" : emptyProjects()) + (signedIn() ? '<div class="section-head mt-24"><h2>Cloud projects</h2><button class="btn small" data-refresh-cloud="1">Refresh</button></div><div class="card panel"><div class="project-list">' +
      (cloudProjects.length ? cloudProjects.map(function (p) { return '<div class="cloud-project-row">' + projectIcon(p) + '<div><strong>' + esc(p.name) + '</strong><p>Revision ' + p.revision + ' · ' + esc(p.role) + '</p></div><button class="btn small" data-import-cloud="' + esc(p.id) + '">Import</button></div>'; }).join('') : '<p>No cloud projects yet. Publish one from its workspace.</p>') + '</div></div>' : '');
  }
  function workspacePage(id) {
    var p = getProject(id) || state.projects[0];
    if (!p) return pageHead("Workspace", "Select or create a project.") + emptyProjects();
    if (id !== p.id) location.replace("#/workspace/" + p.id);
    var script = p.scripts.find(function (s) { return s.id === selectedScript; }) || p.scripts[0];
    if (script) selectedScript = script.id;
    var files = p.scripts.map(function (s) {
      return '<button class="script-item ' + (script && s.id === script.id ? "active" : "") + '" data-script="' + esc(s.id) + '">' +
        icon("file", "tiny") + '<span>' + esc(s.name) + "</span></button>";
    }).join("");
    var count = script ? script.source.split("\n").length : 1;
    return pageHead("Workspace", "Edit local Luau drafts and organize scripts. Studio connectivity is coming later.", '<a href="#/projects" class="btn ghost">' + icon("layers") + ' All projects</a>') +
      '<div class="card workspace-header">' + projectIcon(p) + '<div><h2>' + esc(p.name) + '</h2><p>' + esc(p.description || "No description") +
      '</p></div><span class="push">' + (p.sample ? badge("Sample project") : badge("Local project", "purple")) + '</span></div>' +
      '<div class="notice">' + icon("shield") + '<div><strong>Drafts autosave locally</strong><p>Cloud updates require an explicit sync. Live Roblox Studio synchronization is not connected.</p></div></div>' +
      (signedIn() ? '<div class="cloud-actions"><button class="btn primary small" data-sync-cloud="' + esc(p.id) + '">' + icon("save", "tiny") + ' ' + (p.cloud_id ? 'Update cloud revision' : 'Publish to cloud') + '</button> ' + (p.cloud_revision ? badge('Revision ' + p.cloud_revision, 'green') : '') + '</div>' : '') +
      '<div class="workspace-layout"><aside class="card explorer"><h3>Explorer</h3>' + files +
      '<button class="script-item" data-new-script="' + esc(p.id) + '">' + icon("plus", "tiny") + ' New script</button></aside>' +
      '<section class="card editor"><div class="editor-top"><div class="flex">' + icon("code") + '<strong>' + esc(script ? script.name : "No scripts") +
      '</strong></div><div class="flex">' + badge("Luau", "purple") + '<button class="btn small primary" data-save-script="' + esc(p.id) + '"' + (!script ? " disabled" : "") +
      '>' + icon("save", "tiny") + ' Save locally</button></div></div>' +
      '<div class="editor-tools"><label class="find-label">Find <input id="editor-find" type="search" placeholder="Search in script" aria-label="Find in script"></label><button class="btn small" data-find-next="1">Next</button><button class="btn small" data-indent="1">' + icon("code", "tiny") + ' Tab</button><button class="btn small" data-export-script="1">Export .luau</button></div>' +
      '<div class="editor-body"><div class="line-numbers" id="line-numbers">' + Array.from({ length: count }, function (_, i) { return i + 1; }).join("\n") +
      '</div><div class="code-surface"><div class="syntax-scroll"><pre id="source-highlight" class="syntax-text" aria-hidden="true"></pre></div>' +
      '<textarea id="source-editor" class="code-input" aria-label="Luau code editor" spellcheck="false" autocorrect="off" autocapitalize="off" autocomplete="off" wrap="off"' + (!script ? " disabled" : "") +
      '>' + esc(script ? script.source : "-- Create a script to begin") + '</textarea><div id="completion-popup" class="completion-popup" role="listbox" hidden></div></div></div>' +
      '<div class="editor-bottom"><span id="editor-count">' + count + ' lines · Ln 1, Col 1 · Saved locally</span><span>Not synced to Studio</span></div></section></div>' +
      '<div class="flex mt-24"><button class="btn danger small" data-delete-project="' + esc(p.id) + '">' + icon("trash", "tiny") + ' Delete project</button></div>';
  }
  function teamPage() {
    return pageHead("Team & access", "Manage collaborators and permissions once the secure backend is connected.") +
      '<div class="notice">' + icon("shield") + '<div><strong>Invitations are not active</strong><p>Account login, invitations, and access controls require the cloud backend. No invitation is sent from this preview.</p></div></div>' +
      '<div class="two-col"><section class="card panel"><div class="section-head"><h2>Workspace members</h2>' + badge("Local") +
      '</div><div class="member-row"><span class="avatar">YOU</span><div><strong>You (this device)</strong><p>Local preview administrator</p></div>' +
      badge("Owner", "purple") + '</div></section><section class="card panel"><h2>Coming with cloud sync</h2><p>Invite contributors by Discord or link, review pending invitations, and assign role-based permissions.</p>' +
      '<div class="feature-grid"><div>' + badge("Owner") + '</div><div>' + badge("Editor") + '</div><div>' + badge("Reviewer") +
      '</div><div>' + badge("Viewer") + '</div></div></section></div>';
  }
  function activityPage() {
    return pageHead("Activity history", "Review saved actions on this device. Example entries are labeled.") +
      '<div class="card panel"><div class="section-head"><h2>Event timeline</h2>' + badge(state.activity.length + " events") + '</div><div class="feed">' +
      (state.activity.length ? state.activity.map(feedItem).join("") : '<div class="empty">No activity yet.</div>') + "</div></div>";
  }
  function docsPage() {
    return pageHead("Documentation", "How Collab.io works today and what will be connected next.") +
      '<div class="feature-grid"><div class="card feature">' + icon("layers") + '<h3>GitHub Pages frontend</h3><p>The interface loads directly from this repository. It works on desktop and mobile without a backend.</p></div>' +
      '<div class="card feature">' + icon("code") + '<h3>Roblox Studio bridge</h3><p>Planned Studio plugin will capture approved script updates and apply reviewed changes through authenticated project sessions.</p></div>' +
      '<div class="card feature">' + icon("users") + '<h3>Cloud collaboration</h3><p>Cloudflare Workers, Durable Objects, D1 and R2 are planned for auth, WebSocket rooms, metadata and snapshots.</p></div>' +
      '<div class="card feature">' + icon("git") + '<h3>GitHub + Discord</h3><p>Future account linking, repository history and Discord notifications will use server-side tokens with scoped permissions.</p></div></div>' +
      '<div class="card doc-box mt-24"><h3>Try the current preview</h3><ol><li>Open Projects and create a workspace.</li><li>Open the workspace and select or add a Luau script.</li>' +
      '<li>Edit the draft and press <strong>Save locally</strong>.</li><li>Review your actions on the Activity page.</li></ol>' +
      '<p class="mb-0">Data is stored using your browser’s localStorage. Clearing site data or using a different device may remove it. Do not store secrets in drafts.</p></div>' +
      '<div class="card doc-box"><h3>Developer source</h3><p>Code, feature roadmap, and deployment instructions are available in the public repository.</p>' +
      '<a class="btn" href="https://github.com/SillyDev2026/Collab.io" rel="noopener noreferrer" target="_blank">' + icon("external") + ' Open GitHub repository</a></div>';
  }
  function settingsPage() {
    return pageHead("Settings", "Customize the interface and manage browser-only preview data.") +
      '<div class="card panel"><h2>Appearance</h2><div class="settings-row"><div><strong>Theme</strong><p>Choose how Collab.io looks on this device.</p></div>' +
      '<select id="theme-select" aria-label="Appearance theme"><option value="dark">Dark</option><option value="light">Light</option></select></div>' +
      '<div class="settings-row"><div><strong>Environment</strong><p>No account or backend is connected to this demo.</p></div>' + badge("Local preview", "warning") +
      '</div><div class="settings-row"><div><strong>Clear local preview data</strong><p>Restore sample projects and remove edits saved in this browser.</p></div>' +
      '<button class="btn danger small" data-reset="1">' + icon("trash", "tiny") + ' Reset</button></div></div>' +
      '<div class="card doc-box mt-24"><h3>Privacy in this version</h3><p class="mb-0">No sign-in, live collaboration, server upload, or Discord messages are implemented. Workspace data only lives in localStorage on this browser. The site may load Google Fonts from Google’s servers.</p></div>';
  }
  function renderModal() {
    if (!modal) return "";
    var newScript = modal.indexOf("script:") === 0;
    var title = newScript ? "Add Luau script" : "Create new project";
    return '<div class="modal-backdrop" data-modal-backdrop="1"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<div class="modal-head"><h2 id="modal-title">' + title + '</h2><button class="icon-btn" data-close-modal="1" aria-label="Close dialog">' + icon("close") + '</button></div>' +
      '<form id="' + (newScript ? "script-form" : "project-form") + '">' +
      '<div class="form-field"><label for="item-name">' + (newScript ? "Script name" : "Project name") + '</label><input id="item-name" name="name" maxlength="72" placeholder="' +
      (newScript ? "InventoryService" : "My Roblox project") + '" required autocomplete="off"></div>' +
      (newScript ? '<p style="font-size:12px">Creates an editable ModuleScript draft in this browser.</p>' :
        '<div class="form-field"><label for="item-description">Description</label><textarea id="item-description" name="description" maxlength="240" placeholder="What are you building?"></textarea></div>') +
      '<div class="modal-footer"><button type="button" class="btn" data-close-modal="1">Cancel</button><button type="submit" class="btn primary">' +
      icon("plus") + (newScript ? " Add script" : " Create project") + "</button></div></form></div></div>";
  }
  function render() {
    var current = route();
    var titles = { overview: "Overview", projects: "Projects", workspace: "Workspace", team: "Team", activity: "Activity", docs: "Documentation", settings: "Settings" };
    var body = { overview: overview, projects: projectsPage, workspace: function () { return workspacePage(current.id); }, team: teamPage, activity: activityPage, docs: docsPage, settings: settingsPage }[current.page]();
    var navs = [
      ["overview", "Overview", "grid"], ["projects", "Projects", "layers"], ["workspace", "Workspace", "code"],
      ["team", "Team", "users"], ["activity", "Activity", "clock"], ["docs", "Documentation", "book"], ["settings", "Settings", "settings"]
    ];
    ROOT.innerHTML = '<div class="app-shell"><div class="overlay ' + (sidebarOpen ? "open" : "") + '" data-close-nav="1"></div>' +
      '<aside class="sidebar ' + (sidebarOpen ? "open" : "") + '"><a href="#/overview" class="brand" data-close-nav="1"><span class="brand-mark">' + icon("layers") +
      '</span><span><span class="brand-name">Collab<span>.io</span></span><div class="brand-sub">Developer platform</div></span></a>' +
      '<div class="nav-label">Workspace</div><nav aria-label="Main navigation">' + navs.slice(0, 5).map(function (n) {
        return navLink(n[0] === "workspace" ? "workspace/" + (state.projects[0] ? state.projects[0].id : "") : n[0], n[1], n[2], current.page === n[0]);
      }).join("") + '</nav><div class="nav-label" style="margin-top:27px">Resources</div><nav aria-label="Resources">' +
      navs.slice(5).map(function (n) { return navLink(n[0], n[1], n[2], current.page === n[0]); }).join("") +
      '</nav><div class="sidebar-bottom"><div class="side-info"><div class="flex"><span class="small-dot"></span><strong>Preview is ready</strong></div><p>Explore the interface. Cloud and Studio sync are not connected.</p></div>' +
      '<div class="side-foot">Collab.io v0.2 · ' + (signedIn() ? 'Cloud account' : 'Local preview') + '</div></div></aside><main class="main"><header class="topbar">' +
      '<div class="flex"><button class="icon-btn mobile-menu" data-menu="1" aria-label="Open navigation">' + icon("menu") +
      '</button><div class="crumbs"><span>Workspace</span>' + icon("chevron", "tiny") + '<strong>' + titles[current.page] + '</strong></div></div>' +
      '<div class="top-actions">' + (signedIn() ? '<span class="badge green">@' + esc(authUser.login) + '</span><button class="btn small" data-signout="1">Sign out</button>' : '<button class="btn small" data-signin="1">' + icon("git", "tiny") + ' Sign in</button>') + '<button class="btn primary small" data-new-project="1">' + icon("plus", "tiny") +
      '<span class="mobile-only">New</span><span class="desktop-only">New project</span></button></div></header><div class="page">' + body +
      '</div></main></div>' + renderModal();
    var select = document.getElementById("theme-select");
    if (select) select.value = getTheme();
    var nameInput = document.getElementById("item-name");
    if (nameInput) nameInput.focus();
    initializeEditor();
  }
  function hideCompletions() {
    activeCompletion = null;
    var popup = document.getElementById("completion-popup");
    if (popup) { popup.hidden = true; popup.replaceChildren(); }
  }
  function updateStatus() {
    var input = document.getElementById("source-editor");
    var label = document.getElementById("editor-count");
    if (!label || !input || !activeEditor) return;
    var pos = activeEditor.position;
    label.textContent = input.value.split("\n").length + " lines · Ln " + pos.line + ", Col " + pos.column + " · Autosaved locally";
  }
  function showCompletions() {
    var input = document.getElementById("source-editor");
    var popup = document.getElementById("completion-popup");
    if (!input || !popup || !activeEditor || document.activeElement !== input) { hideCompletions(); return; }
    var result = completeLuau(input.value, input.selectionStart);
    if (!result) { hideCompletions(); return; }
    activeCompletion = result;
    completionIndex = 0;
    popup.innerHTML = result.items.map(function (item, i) {
      return '<button type="button" role="option" aria-selected="' + (i === 0) + '" class="completion-item ' + (i === 0 ? "selected" : "") +
        '" data-complete="' + i + '"><span>' + esc(item.label) + '</span><small>' + esc(item.kind) + '</small></button>';
    }).join("");
    popup.hidden = false;
    try {
      var caret = textareaCaretOffset(input);
      var bounds = { width: input.clientWidth, height: input.clientHeight };
      var placement = placeCompletionPopup(caret, bounds, { width: 300, height: 245 });
      popup.style.left = Math.round(placement.left) + "px";
      popup.style.top = Math.round(placement.top) + "px";
      popup.style.width = Math.round(placement.width) + "px";
      popup.style.maxHeight = Math.max(90, Math.round(placement.height)) + "px";
    } catch (error) { popup.style.left = "10px"; popup.style.top = "80px"; }
  }
  function selectCompletion(index) {
    if (!activeEditor || !activeCompletion) return;
    var item = activeCompletion.items[index];
    if (!item) return;
    var range = activeCompletion;
    hideCompletions();
    activeEditor.replace(range.from, range.to, item.label);
  }
  function initializeEditor() {
    activeEditor = null;
    activeScript = null;
    activeCompletion = null;
    var input = document.getElementById("source-editor");
    if (!input || input.disabled) return;
    var current = route();
    var project = getProject(current.id);
    var script = project && project.scripts.find(function (file) { return file.id === selectedScript; });
    if (!script) return;
    activeScript = script;
    activeEditor = new CodeEditor({
      input: input,
      highlight: document.getElementById("source-highlight"),
      gutter: document.getElementById("line-numbers"),
      onChange: function (value) {
        script.source = value;
        project.updated = Date.now();
        save();
        updateStatus();
        showCompletions();
      },
      onCursor: function () { updateStatus(); },
      onShortcut: function (key) {
        if (key === "s") { var btn = document.querySelector("[data-save-script]"); if (btn) btn.click(); }
        else if (key === "f") { document.getElementById("editor-find").focus(); }
        else if (key === "Enter") notice("Code execution requires a trusted Luau runtime.");
        else if (key === "p") notice("Open a script from the Explorer.");
      }
    });
    activeEditor.load(script.source, script.id);
    input.addEventListener("keyup", function () { if (document.activeElement === input) showCompletions(); });
    input.addEventListener("click", hideCompletions);
    input.addEventListener("keydown", function (event) {
      if (!activeCompletion) return;
      var popup = document.getElementById("completion-popup");
      if (!popup || popup.hidden) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        completionIndex = (completionIndex + (event.key === "ArrowDown" ? 1 : -1) + activeCompletion.items.length) % activeCompletion.items.length;
        popup.querySelectorAll("[data-complete]").forEach(function (item, index) {
          item.classList.toggle("selected", index === completionIndex);
          item.setAttribute("aria-selected", index === completionIndex ? "true" : "false");
        });
      } else if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        selectCompletion(completionIndex);
      } else if (event.key === "Escape") {
        event.preventDefault();
        hideCompletions();
      }
    }, true);
    updateStatus();
  }
  function findNext() {
    var input = document.getElementById("source-editor");
    var query = document.getElementById("editor-find");
    if (!input || !query || !query.value) { if (query) query.focus(); return; }
    var start = input.selectionEnd;
    var found = input.value.toLowerCase().indexOf(query.value.toLowerCase(), start);
    if (found < 0) found = input.value.toLowerCase().indexOf(query.value.toLowerCase());
    if (found < 0) { notice("No matches found."); return; }
    input.focus();
    input.setSelectionRange(found, found + query.value.length);
    var prefixLines = input.value.slice(0, found).split("\n").length;
    input.scrollTop = Math.max(0, (prefixLines - 3) * 22);
    updateStatus();
  }
  function exportScript() {
    if (!activeScript) return;
    var file = new Blob([activeScript.source], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(file);
    var link = document.createElement("a");
    link.href = url;
    link.download = activeScript.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function getTheme() {
    try { return localStorage.getItem(THEME) === "light" ? "light" : "dark"; }
    catch (_) { return "dark"; }
  }
  function updateTheme(value) {
    document.body.dataset.theme = value;
    try { localStorage.setItem(THEME, value); } catch (_) {}
  }
  function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
  function openModal(value) { modal = value; render(); }
  function closeModal() { modal = ""; render(); }
  function createProject(form) {
    var fd = new FormData(form);
    var name = String(fd.get("name") || "").trim();
    var description = String(fd.get("description") || "").trim();
    if (!name) return;
    var project = { id: makeId(), name: name, description: description, updated: Date.now(), scripts: [], sample: false };
    state.projects.unshift(project);
    activity("Created a project", name);
    modal = "";
    selectedScript = "";
    location.hash = "#/workspace/" + project.id;
    render();
    notice("Project created locally.");
  }
  function createScript(form) {
    var id = modal.slice("script:".length);
    var project = getProject(id);
    if (!project) return;
    var name = String(new FormData(form).get("name") || "").trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!name) { notice("Use letters, numbers, or underscores."); return; }
    var fullName = name + ".luau";
    if (project.scripts.some(function (s) { return s.name.toLowerCase() === fullName.toLowerCase(); })) { notice("That script already exists."); return; }
    var script = { id: makeId(), name: fullName, source: "--!strict\nlocal " + name + " = {}\n\nreturn " + name + "\n" };
    project.scripts.push(script);
    project.updated = Date.now();
    selectedScript = script.id;
    activity("Created " + fullName, project.name);
    modal = "";
    render();
    notice("Script added locally.");
  }
  async function copy(value) {
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      notice("Copied to clipboard.");
    } catch (_) { notice("Copy is unavailable in this browser."); }
  }
  document.addEventListener("click", function (event) {
    var el = event.target.closest("[data-menu],[data-close-nav],[data-new-project],[data-open],[data-script],[data-save-script],[data-new-script],[data-delete-project],[data-close-modal],[data-reset],[data-copy],[data-complete],[data-find-next],[data-indent],[data-export-script],[data-signin],[data-signout],[data-sync-cloud],[data-import-cloud],[data-refresh-cloud]");
    if (el && el.hasAttribute("data-signin")) { startSignIn(); return; }
    if (el && el.hasAttribute("data-signout")) { signOut(); return; }
    if (el && el.hasAttribute("data-sync-cloud")) { syncCloud(el.dataset.syncCloud); return; }
    if (el && el.hasAttribute("data-import-cloud")) { importCloud(el.dataset.importCloud); return; }
    if (el && el.hasAttribute("data-refresh-cloud")) { refreshCloud().then(render); return; }
    if (el && el.hasAttribute("data-complete")) { selectCompletion(Number(el.dataset.complete)); return; }
    if (el && el.hasAttribute("data-find-next")) { findNext(); return; }
    if (el && el.hasAttribute("data-export-script")) { exportScript(); return; }
    if (el && el.hasAttribute("data-indent")) { if (activeEditor) activeEditor.replace(activeEditor.input.selectionStart, activeEditor.input.selectionEnd, "    "); return; }
    if (!el) {
      if (event.target.matches("[data-modal-backdrop]")) closeModal();
      return;
    }
    if (el.hasAttribute("data-menu")) { sidebarOpen = !sidebarOpen; render(); }
    else if (el.hasAttribute("data-close-nav")) { sidebarOpen = false; if (el.tagName !== "A") render(); }
    else if (el.hasAttribute("data-new-project")) openModal("project");
    else if (el.hasAttribute("data-open")) { selectedScript = ""; location.hash = "#/workspace/" + el.dataset.open; render(); }
    else if (el.hasAttribute("data-script")) { selectedScript = el.dataset.script; render(); }
    else if (el.hasAttribute("data-new-script")) openModal("script:" + el.dataset.newScript);
    else if (el.hasAttribute("data-close-modal")) closeModal();
    else if (el.hasAttribute("data-save-script")) {
      var p = getProject(el.dataset.saveScript);
      var s = p && p.scripts.find(function (file) { return file.id === selectedScript; });
      var area = document.getElementById("source-editor");
      if (s && area) {
        s.source = area.value;
        p.updated = Date.now();
        activity("Saved " + s.name, p.name);
        render();
        notice("Draft saved on this device.");
      }
    }
    else if (el.hasAttribute("data-delete-project")) {
      var project = getProject(el.dataset.deleteProject);
      if (project && window.confirm('Delete "' + project.name + '" and its local scripts? This cannot be undone.')) {
        state.projects = state.projects.filter(function (p) { return p.id !== project.id; });
        activity("Deleted a project", project.name);
        selectedScript = "";
        location.hash = "#/projects";
        render();
        notice("Local project deleted.");
      }
    }
    else if (el.hasAttribute("data-reset")) {
      if (window.confirm("Remove local changes and restore sample projects?")) {
        state = samples();
        save();
        selectedScript = "";
        location.hash = "#/overview";
        render();
        notice("Preview data reset.");
      }
    }
    else if (el.hasAttribute("data-copy")) copy(el.dataset.copy);
  });
  document.addEventListener("submit", function (event) {
    if (event.target.id === "project-form") { event.preventDefault(); createProject(event.target); }
    else if (event.target.id === "script-form") { event.preventDefault(); createScript(event.target); }
  });
  document.addEventListener("input", function (event) {
    if (event.target.id === "project-search") {
      var query = event.target.value.trim().toLowerCase();
      var visible = 0;
      document.querySelectorAll("[data-project-title]").forEach(function (card) {
        var matches = card.dataset.projectTitle.indexOf(query) !== -1;
        card.style.display = matches ? "" : "none";
        if (matches) visible++;
      });
      var empty = document.getElementById("project-no-match");
      if (empty) empty.style.display = visible ? "none" : "";
    }
  });
  document.addEventListener("change", function (event) {
    if (event.target.id === "theme-select") { updateTheme(event.target.value); notice("Theme updated."); }
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && modal) closeModal();
  });
  window.addEventListener("hashchange", function () { sidebarOpen = false; modal = ""; selectedScript = ""; render(); window.scrollTo(0, 0); });
  updateTheme(getTheme());
  render();
  initAuth();
})();