// objectEditor.js — Object & Tile Editor: per-object state machine (e.g.
// Door: closed/open), seasonal variants, a simplified 4-direction auto-tile
// demo, a hue/brightness recoloring tool that saves new asset variants, and
// a combined placement/auto-tile preview grid.
//
// NOTE on auto-tiling: real terrain auto-tiling usually uses a 47-tile blob
// set. To keep this usable, neighbor bitmasks are bucketed into 5 common
// roles (isolated / horizontal / vertical / corner / cross) that the user
// assigns art to — a simplified but genuinely working demonstration.

import { i18n } from "../core/i18n.js";
import { SEASONS } from "../data/locales.js";
import { applyColorAdjustments, loadImage } from "../utils/imageTools.js";

const TILE_SIZES = [16, 32];
const AUTO_TILE_ROLES = ["isolated", "horizontal", "vertical", "corner", "cross"];
const GRID_DIM = 6;

let objUid = 0;
function newObjectId() { objUid += 1; return `obj_${Date.now().toString(36)}${objUid}`; }

function emptySeasonMap() {
  const map = { default: null };
  SEASONS.forEach((s) => { map[s] = null; });
  return map;
}

function classifyBitmask(mask) {
  const n = !!(mask & 1), e = !!(mask & 2), s = !!(mask & 4), w = !!(mask & 8);
  const count = [n, e, s, w].filter(Boolean).length;
  if (count === 0) return "isolated";
  if (count >= 3) return "cross";
  if (count === 2) return (n && s) ? "vertical" : (e && w) ? "horizontal" : "corner";
  return (n || s) ? "vertical" : "horizontal";
}

export class ObjectEditor {
  constructor({ store, assetManager }) {
    this.store = store;
    this.assetManager = assetManager;
    this.root = null;
    this.unsub = [];
    this.activeSeason = "default";
    this._ensureDefaultState();
  }

  _ensureDefaultState() {
    const obj = this.store.state.object;
    if (!obj.grid) {
      this.store.state.object = {
        ...obj,
        tileSize: obj.tileSize || 16,
        objects: obj.objects || {},
        activeObjectId: obj.activeObjectId || null,
        grid: Array.from({ length: GRID_DIM }, () => Array(GRID_DIM).fill(false)),
      };
    }
  }

  _newObject() {
    const id = newObjectId();
    const count = Object.keys(this.store.state.object.objects).length + 1;
    const record = {
      id, name: `${i18n.t("assets.categoryObject")} ${count}`,
      tileSize: this.store.state.object.tileSize,
      states: ["default"], activeState: "default",
      assetByStateSeason: { default: emptySeasonMap() },
      autoTileEnabled: false,
      autoTileAssets: Object.fromEntries(AUTO_TILE_ROLES.map((r) => [r, null])),
    };
    this.store.state.object = {
      ...this.store.state.object,
      objects: { ...this.store.state.object.objects, [id]: record },
      activeObjectId: id,
    };
  }

  mount(container) {
    this.root = container;
    const obj = this.store.state.object;
    if (!obj.activeObjectId && Object.keys(obj.objects).length) {
      this.store.state.object.activeObjectId = Object.keys(obj.objects)[0];
    }
    this.root.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">
        <div class="flex flex-col items-center gap-3">
          <div class="ssf-lightbox">
            <div class="ssf-checkerboard" data-role="grid-wrap"></div>
          </div>
          <p class="text-xs text-ink-muted text-center max-w-[220px]">${i18n.t("object.toggleTile")}</p>
          <p class="text-xs text-ink-dim text-center max-w-[220px]">${i18n.t("object.placePreview")} · ${i18n.t("object.gridDemo")}</p>
        </div>
        <div class="ssf-card space-y-4">
          <div class="flex flex-wrap items-end gap-2">
            <div class="flex-1 min-w-[140px]">
              <label class="ssf-label">${i18n.t("object.panelTitle")}</label>
              <select data-role="object-select" class="ssf-select w-full"></select>
            </div>
            <button data-action="new-object" class="ssf-btn ssf-btn-primary text-xs">+ ${i18n.t("common.add")}</button>
          </div>
          <div data-role="object-detail"></div>
        </div>
      </div>
    `;
    this.root.addEventListener("click", (e) => this._onClick(e));
    this.root.addEventListener("input", (e) => this._onInput(e));
    this.root.addEventListener("change", (e) => this._onChange(e));

    this.unsub.push(this.store.subscribe("object", () => {
      if (!this.store.state.object.grid) this._ensureDefaultState();
      this._renderAll();
    }));
    this.unsub.push(this.store.subscribe("assets", () => this._renderAll()));
    this._renderAll();
  }

  refreshLocale() { if (this.root) this.mount(this.root); }
  destroy() { this.unsub.forEach((fn) => fn()); }

  get activeObject() {
    const obj = this.store.state.object;
    return obj.activeObjectId ? obj.objects[obj.activeObjectId] || null : null;
  }

  _resolveAssetId(record, state, season) {
    const seasonMap = record.assetByStateSeason[state];
    if (!seasonMap) return null;
    return (season !== "default" && seasonMap[season]) ? seasonMap[season] : seasonMap.default;
  }

  // -------------------------------------------------------------- render

  _renderAll() {
    if (!this.root) return;
    this._renderObjectSelect();
    this._renderObjectDetail();
    this._renderGrid();
  }

  _renderObjectSelect() {
    const select = this.root.querySelector('[data-role="object-select"]');
    const obj = this.store.state.object;
    const ids = Object.keys(obj.objects);
    if (!ids.length) { select.innerHTML = `<option value="">${i18n.t("layers.noAssetAssigned")}</option>`; return; }
    select.innerHTML = ids.map((id) => `<option value="${id}" ${id === obj.activeObjectId ? "selected" : ""}>${obj.objects[id].name}</option>`).join("");
  }

  _renderObjectDetail() {
    const wrap = this.root.querySelector('[data-role="object-detail"]');
    const record = this.activeObject;
    if (!record) { wrap.innerHTML = `<p class="text-sm text-ink-muted">${i18n.t("assets.emptyGallery")}</p>`; return; }
    wrap.innerHTML = `
      <div>
        <label class="ssf-label">${i18n.t("common.name")}</label>
        <input type="text" data-role="obj-name" value="${record.name}" class="ssf-input w-full" />
      </div>
      <div class="grid grid-cols-2 gap-3 mt-2">
        <div>
          <label class="ssf-label">${i18n.t("object.tileSize")}</label>
          <select data-role="obj-tilesize" class="ssf-select w-full">
            ${TILE_SIZES.map((s) => `<option value="${s}" ${s === record.tileSize ? "selected" : ""}>${s}×${s}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="ssf-label">${i18n.t("object.season")}</label>
          <select data-role="obj-season" class="ssf-select w-full">
            <option value="default">${i18n.t("common.none")}</option>
            ${SEASONS.map((s) => `<option value="${s}" ${s === this.activeSeason ? "selected" : ""}>${i18n.t(`object.${s}`)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="mt-3">
        <label class="ssf-label">${i18n.t("object.states")}</label>
        <div class="flex flex-wrap gap-2 mb-2" data-role="state-chips"></div>
        <div class="flex gap-2">
          <input type="text" data-role="new-state-name" placeholder="${i18n.t("object.stateName")}" class="ssf-input flex-1" />
          <button data-action="add-state" class="ssf-btn text-xs">${i18n.t("object.addState")}</button>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-3">
        <div class="ssf-checkerboard w-14 h-14 shrink-0 rounded overflow-hidden" data-role="state-thumb"></div>
        <button data-action="assign-state-asset" class="ssf-btn text-xs">${i18n.t("layers.assignAsset")}</button>
      </div>
      <div class="border-t border-line pt-3 mt-3">
        <label class="flex items-center gap-2 text-sm text-ink-muted mb-2">
          <input type="checkbox" data-role="autotile-enabled" ${record.autoTileEnabled ? "checked" : ""}/> ${i18n.t("object.autoTile")}
        </label>
        <p class="text-xs text-ink-dim mb-2">${i18n.t("object.autoTileHint")}</p>
        ${record.autoTileEnabled ? this._autoTileRolesHTML(record) : ""}
      </div>
      <div class="border-t border-line pt-3 mt-3">
        <label class="ssf-label">${i18n.t("object.recolor")}</label>
        <div class="grid grid-cols-2 gap-3">
          <div><span class="text-xs text-ink-muted">${i18n.t("layers.hue")}</span><input type="range" min="-100" max="100" value="0" data-role="recolor-hue" class="ssf-slider w-full" /></div>
          <div><span class="text-xs text-ink-muted">${i18n.t("layers.brightness")}</span><input type="range" min="-100" max="100" value="0" data-role="recolor-brightness" class="ssf-slider w-full" /></div>
        </div>
        <button data-action="create-variant" class="ssf-btn ssf-btn-primary text-xs mt-2">${i18n.t("object.createVariant")}</button>
      </div>
    `;
    this._renderStateChips();
    this._renderStateThumb();
  }

  _autoTileRolesHTML(record) {
    return `<div class="grid grid-cols-3 gap-2" data-role="autotile-roles">
      ${AUTO_TILE_ROLES.map((role) => {
        const assetId = record.autoTileAssets[role];
        const asset = assetId ? this.assetManager.getAsset(assetId) : null;
        return `
          <button data-action="assign-autotile" data-role-key="${role}" class="ssf-thumb" title="${role}">
            <div class="ssf-checkerboard">${asset ? `<img src="${asset.currentDataURL}" class="pixelated" />` : ""}</div>
            <div class="ssf-thumb-label">${role}</div>
          </button>`;
      }).join("")}
    </div>`;
  }

  _renderStateChips() {
    const wrap = this.root.querySelector('[data-role="state-chips"]');
    const record = this.activeObject;
    if (!wrap || !record) return;
    wrap.innerHTML = record.states.map((s) => `
      <button data-action="select-state" data-state="${s}" class="ssf-chip text-xs ${record.activeState === s ? "ssf-chip-active" : ""}">
        ${s}${record.states.length > 1 ? ` <span data-action="remove-state" data-state="${s}" class="opacity-70">×</span>` : ""}
      </button>
    `).join("");
  }

  _renderStateThumb() {
    const thumb = this.root.querySelector('[data-role="state-thumb"]');
    const record = this.activeObject;
    if (!thumb || !record) return;
    const assetId = this._resolveAssetId(record, record.activeState, this.activeSeason);
    const asset = assetId ? this.assetManager.getAsset(assetId) : null;
    thumb.innerHTML = asset ? `<img src="${asset.currentDataURL}" class="pixelated w-full h-full object-contain" />` : "";
  }

  _renderGrid() {
    const wrap = this.root.querySelector('[data-role="grid-wrap"]');
    if (!wrap) return;
    const gridState = this.store.state.object.grid;
    const record = this.activeObject;
    const cellPx = 40;
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = `repeat(${GRID_DIM}, ${cellPx}px)`;
    wrap.innerHTML = "";
    for (let r = 0; r < GRID_DIM; r++) {
      for (let c = 0; c < GRID_DIM; c++) {
        const filled = gridState[r][c];
        const cellBtn = document.createElement("button");
        cellBtn.dataset.action = "toggle-cell";
        cellBtn.dataset.cell = `${r},${c}`;
        cellBtn.className = "border border-line/40 flex items-center justify-center";
        cellBtn.style.width = cellPx + "px";
        cellBtn.style.height = cellPx + "px";
        if (filled && record) {
          let assetId;
          if (record.autoTileEnabled) {
            const mask = (gridState[r - 1]?.[c] ? 1 : 0) | (gridState[r]?.[c + 1] ? 2 : 0) | (gridState[r + 1]?.[c] ? 4 : 0) | (gridState[r]?.[c - 1] ? 8 : 0);
            const role = classifyBitmask(mask);
            assetId = record.autoTileAssets[role] || this._resolveAssetId(record, record.activeState, this.activeSeason);
          } else {
            assetId = this._resolveAssetId(record, record.activeState, this.activeSeason);
          }
          const asset = assetId ? this.assetManager.getAsset(assetId) : null;
          if (asset) {
            const img = document.createElement("img");
            img.src = asset.currentDataURL;
            img.className = "pixelated w-full h-full object-contain";
            cellBtn.appendChild(img);
          } else {
            cellBtn.classList.add("bg-lantern/20");
          }
        }
        wrap.appendChild(cellBtn);
      }
    }
  }

  // --------------------------------------------------------------- events

  _onClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const record = this.activeObject;

    if (action === "new-object") {
      this._newObject();
    } else if (action === "add-state") {
      const input = this.root.querySelector('[data-role="new-state-name"]');
      const name = (input.value || "").trim();
      if (!name || !record || record.states.includes(name)) return;
      record.states.push(name);
      record.assetByStateSeason[name] = emptySeasonMap();
      record.activeState = name;
      input.value = "";
    } else if (action === "select-state") {
      if (record) record.activeState = btn.dataset.state;
    } else if (action === "remove-state") {
      if (!record || record.states.length <= 1) return;
      const remaining = record.states.filter((s) => s !== btn.dataset.state);
      record.states = remaining;
      delete record.assetByStateSeason[btn.dataset.state];
      if (record.activeState === btn.dataset.state) record.activeState = remaining[0];
    } else if (action === "assign-state-asset") {
      if (!record) return;
      this.assetManager.openPicker("object", (assetId) => {
        const seasonKey = this.activeSeason;
        this.store.state.object.objects[record.id].assetByStateSeason[record.activeState][seasonKey] = assetId;
      });
    } else if (action === "assign-autotile") {
      if (!record) return;
      this.assetManager.openPicker("object", (assetId) => {
        this.store.state.object.objects[record.id].autoTileAssets[btn.dataset.roleKey] = assetId;
      });
    } else if (action === "create-variant") {
      this._createRecolorVariant();
    } else if (action === "toggle-cell") {
      const [r, c] = btn.dataset.cell.split(",").map(Number);
      const grid = this.store.state.object.grid;
      grid[r][c] = !grid[r][c];
    }
  }

  _onInput(e) {
    if (e.target.dataset.role === "recolor-hue" || e.target.dataset.role === "recolor-brightness") {
      this._previewRecolor();
    }
  }

  _onChange(e) {
    const record = this.activeObject;
    const role = e.target.dataset.role;
    if (role === "obj-name" && record) record.name = e.target.value;
    else if (role === "obj-tilesize" && record) record.tileSize = parseInt(e.target.value, 10);
    else if (role === "obj-season") { this.activeSeason = e.target.value; this._renderStateThumb(); this._renderGrid(); }
    else if (role === "autotile-enabled" && record) record.autoTileEnabled = e.target.checked;
  }

  // ------------------------------------------------------------- recolor

  async _previewRecolor() {
    const record = this.activeObject;
    if (!record) return;
    const assetId = this._resolveAssetId(record, record.activeState, this.activeSeason);
    const asset = assetId ? this.assetManager.getAsset(assetId) : null;
    const thumb = this.root.querySelector('[data-role="state-thumb"]');
    if (!asset || !thumb) return;
    const hue = parseInt(this.root.querySelector('[data-role="recolor-hue"]').value, 10);
    const brightness = parseInt(this.root.querySelector('[data-role="recolor-brightness"]').value, 10);
    const img = await loadImage(asset.currentDataURL);
    const c = document.createElement("canvas");
    c.width = asset.width; c.height = asset.height;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    applyColorAdjustments(c, { hue, brightness });
    thumb.innerHTML = `<img src="${c.toDataURL()}" class="pixelated w-full h-full object-contain" />`;
  }

  async _createRecolorVariant() {
    const record = this.activeObject;
    if (!record) return;
    const assetId = this._resolveAssetId(record, record.activeState, this.activeSeason);
    const asset = assetId ? this.assetManager.getAsset(assetId) : null;
    if (!asset) { this.store.setStatus(i18n.t("messages.selectAssetFirst"), "warn"); return; }
    const hue = parseInt(this.root.querySelector('[data-role="recolor-hue"]').value, 10);
    const brightness = parseInt(this.root.querySelector('[data-role="recolor-brightness"]').value, 10);
    const img = await loadImage(asset.currentDataURL);
    const c = document.createElement("canvas");
    c.width = asset.width; c.height = asset.height;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    applyColorAdjustments(c, { hue, brightness });
    await this.assetManager.createDerivedAsset(asset, c, { nameSuffix: i18n.t("object.recolor"), historyLabel: `recolor_hue${hue}_bright${brightness}` });
    this.store.setStatus(i18n.t("object.createVariant"), "success");
  }

  // --------------------------------------------------------------- export

  getExportData() {
    return { folder: "objects", json: [{ name: "objects_data", data: this.store.state.object.objects }] };
  }
}
