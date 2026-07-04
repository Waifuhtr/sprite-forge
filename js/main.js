// main.js — App bootstrap. Loads persisted assets & the last project from
// IndexedDB, instantiates the five editor modules, and wires up the tabbed
// shell, language switcher, and project save/load/export controls defined
// in index.html.

import { store } from "./core/store.js";
import { i18n } from "./core/i18n.js";
import { database } from "./core/db.js";
import { AssetManager } from "./modules/assetManager.js";
import { CharacterEditor } from "./modules/characterEditor.js";
import { AnimationSystem } from "./modules/animationSystem.js";
import { PortraitStudio } from "./modules/portraitStudio.js";
import { ObjectEditor } from "./modules/objectEditor.js";
import { exportProjectAsZip } from "./utils/exportUtils.js";

const TABS = ["character", "animation", "portrait", "object", "assets"];

async function main() {
  // 1. Bring in everything persisted from earlier sessions before any module
  //    renders, so the very first paint already has real data.
  if (database.ready) {
    const savedAssets = await database.listAssets();
    if (savedAssets.length) {
      store.state.assets = Object.fromEntries(savedAssets.map((a) => [a.id, a]));
    }
  }

  // 2. Instantiate modules. assetManager has no editor dependencies; the
  //    editors all read/write assets through it and through the shared store.
  const assetManager = new AssetManager({ store, database });
  const characterEditor = new CharacterEditor({ store, assetManager });
  const animationSystem = new AnimationSystem({ store, assetManager, characterEditor });
  const portraitStudio = new PortraitStudio({ store, assetManager });
  const objectEditor = new ObjectEditor({ store, assetManager });
  const modules = {
    character: characterEditor, animation: animationSystem,
    portrait: portraitStudio, object: objectEditor, assets: assetManager,
  };

  // 3. Silently resume the most recent saved project, if one exists.
  if (database.ready) {
    const latest = await database.latestProject();
    if (latest) {
      store.replaceState(latest.data);
      store.state.project.id = latest.id;
      store.state.project.name = latest.name;
      store.state.project.updatedAt = latest.updatedAt;
    }
  }

  // 4. Mount every module into its tab view.
  TABS.forEach((tab) => {
    const container = document.querySelector(`[data-view="${tab}"]`);
    modules[tab].mount(container);
  });

  // 5. Tab navigation.
  function setActiveTab(tab) {
    store.state.ui.activeTab = tab;
    document.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.classList.toggle("ssf-tab-active", btn.dataset.tab === tab);
    });
    document.querySelectorAll("[data-view]").forEach((view) => {
      view.classList.toggle("hidden", view.dataset.view !== tab);
    });
    if (tab !== "animation") animationSystem.pause();
  }
  document.querySelector('[data-role="tab-nav"]').addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (btn) setActiveTab(btn.dataset.tab);
  });
  setActiveTab(TABS.includes(store.state.ui.activeTab) ? store.state.ui.activeTab : "character");

  // 6. Language switching — flips i18n's active language, refreshes every
  //    static data-i18n element, then asks each module to rebuild its own UI.
  function applyLanguageUI() {
    i18n.applyTo(document);
    document.querySelectorAll('[data-role="lang-toggle"] [data-lang]').forEach((btn) => {
      btn.classList.toggle("ssf-lang-btn-active", btn.dataset.lang === i18n.lang);
    });
    Object.values(modules).forEach((m) => m.refreshLocale && m.refreshLocale());
  }
  document.querySelector('[data-role="lang-toggle"]').addEventListener("click", (e) => {
    const btn = e.target.closest("[data-lang]");
    if (btn) { i18n.setLanguage(btn.dataset.lang); applyLanguageUI(); }
  });
  applyLanguageUI();

  // 7. Header actions: new / save / load / export project.
  document.querySelector("header").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "new-project") handleNewProject();
    else if (action === "save-project") handleSaveProject();
    else if (action === "load-project") handleOpenProjectPicker();
    else if (action === "export-zip") handleExportZip();
  });

  function handleNewProject() {
    if (!window.confirm(i18n.t("messages.confirmNewProject"))) return;
    store.replaceState({});
    applyLanguageUI();
    setActiveTab("character");
  }

  async function handleSaveProject() {
    const name = window.prompt(i18n.t("common.saveProject"), store.state.project.name || "Untitled Farmer");
    if (!name) return;
    store.state.project.name = name;
    const snapshot = store.snapshot();
    const id = await database.saveProject(name, snapshot, store.state.project.id || null);
    store.state.project.id = id;
    store.state.project.updatedAt = Date.now();
    store.setStatus(i18n.t("messages.projectSaved"), "success");
  }

  async function handleOpenProjectPicker() {
    const modal = document.querySelector('[data-role="project-modal"]');
    const list = await database.listProjects();
    modal.innerHTML = `
      <div class="ssf-modal-backdrop">
        <div class="ssf-modal">
          <div class="flex items-center justify-between mb-3">
            <h3 class="ssf-card-title mb-0">${i18n.t("common.loadProject")}</h3>
            <button class="ssf-btn text-xs" data-role="close-project-modal">${i18n.t("common.close")}</button>
          </div>
          ${list.length ? `<div class="space-y-2">
            ${list.map((p) => `
              <div class="flex items-center justify-between gap-2 ssf-layer-row p-2">
                <div class="min-w-0">
                  <div class="font-medium truncate">${p.name}</div>
                  <div class="text-xs text-ink-dim">${new Date(p.updatedAt).toLocaleString(i18n.lang === "tr" ? "tr-TR" : "en-US")}</div>
                </div>
                <div class="flex gap-2 shrink-0">
                  <button class="ssf-btn text-xs" data-load-id="${p.id}">${i18n.t("common.select")}</button>
                  <button class="ssf-btn text-xs text-berry" data-delete-id="${p.id}">${i18n.t("common.delete")}</button>
                </div>
              </div>
            `).join("")}
          </div>` : `<p class="text-sm text-ink-muted">${i18n.t("messages.noSavedProject")}</p>`}
        </div>
      </div>
    `;
    const close = () => { modal.innerHTML = ""; };
    modal.querySelector(".ssf-modal-backdrop").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) close();
    });
    modal.querySelector('[data-role="close-project-modal"]').addEventListener("click", close);
    modal.querySelectorAll("[data-load-id]").forEach((loadBtn) => {
      loadBtn.addEventListener("click", async () => {
        const record = await database.loadProject(parseInt(loadBtn.dataset.loadId, 10));
        if (!record) return;
        store.replaceState(record.data);
        store.state.project.id = record.id;
        store.state.project.name = record.name;
        store.state.project.updatedAt = record.updatedAt;
        applyLanguageUI();
        setActiveTab("character");
        store.setStatus(i18n.t("messages.projectLoaded"), "success");
        close();
      });
    });
    modal.querySelectorAll("[data-delete-id]").forEach((delBtn) => {
      delBtn.addEventListener("click", async () => {
        if (!window.confirm(i18n.t("messages.confirmDeleteProject"))) return;
        await database.deleteProject(parseInt(delBtn.dataset.deleteId, 10));
        store.setStatus(i18n.t("messages.projectDeleted"), "success");
        handleOpenProjectPicker();
      });
    });
  }

  async function handleExportZip() {
    const sections = [
      characterEditor.getExportData(),
      animationSystem.getExportData(),
      portraitStudio.getExportData(),
      objectEditor.getExportData(),
      assetManager.getExportData(),
      { json: [{ name: "project", data: { name: store.state.project.name, exportedAt: new Date().toISOString() } }] },
    ];
    try {
      const filename = `${(store.state.project.name || "stardew-sprite-forge").trim().replace(/\s+/g, "_")}.zip`;
      await exportProjectAsZip(sections, filename);
      store.setStatus(i18n.t("messages.exportReady"), "success");
    } catch (err) {
      console.error(err);
      store.setStatus(String((err && err.message) || err), "error");
    }
  }

  // 8. Status toast — subscribes once, fed by any module calling store.setStatus().
  const toast = document.querySelector('[data-role="status-toast"]');
  let toastTimer = null;
  store.subscribe("ui", (ui) => {
    if (!ui.statusMessage) return;
    toast.textContent = ui.statusMessage;
    toast.className = `ssf-toast ssf-toast-${ui.statusTone || "info"}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
  });
}

main().catch((err) => {
  console.error("Stardew Sprite Forge failed to start:", err);
  document.body.innerHTML = `
    <div style="padding:2rem;font-family:sans-serif;color:#F1EAD8;background:#17141F;min-height:100vh;">
      <h1 style="font-size:1.25rem;margin-bottom:0.75rem;">Something went wrong starting the app.</h1>
      <p style="opacity:0.85;max-width:640px;">Check the browser console for details. This app loads Tailwind, Dexie, and
      JSZip from a CDN, so it needs an internet connection at least once (e.g. on first load, or when opened via
      GitHub Pages) — a fully offline file:// double-click may fail to load ES modules or those libraries.</p>
      <pre style="white-space:pre-wrap;opacity:0.6;margin-top:1rem;font-size:0.8rem;">${(err && err.stack) || err}</pre>
    </div>`;
});
