// characterEditor.js — Character Sprite Editor: 10-layer outfit system with
// smart anchoring, per-layer color adjustment, blend modes, and drag/button
// z-index reordering. Composites through the shared CompositeRenderer.
// Layer color adjustments (hue/sat/brightness/contrast/palette-lock) are
// stored as plain numeric state and re-applied fresh from each asset's own
// pixels on every render — never baked in — so they stay fully reversible.

import { i18n } from "../core/i18n.js";
import { CHARACTER_LAYER_KEYS, CHARACTER_LAYER_Z_DEFAULTS, BLEND_MODES } from "../data/locales.js";
import { CompositeRenderer, ImageCache, resolveAnchorOffset } from "../core/canvasEngine.js";
import { applyColorAdjustments, applyPaletteLock, EXAMPLE_PALETTE } from "../utils/imageTools.js";
import { downloadCanvasAsPNG } from "../utils/exportUtils.js";

const STAGE_SIZE = 16;
const DEFAULT_REFERENCE_ANCHOR = { x: 8, y: 4 };

export class CharacterEditor {
  constructor({ store, assetManager }) {
    this.store = store;
    this.assetManager = assetManager;
    this.imageCache = new ImageCache();
    this.renderer = null;
    this.root = null;
    this.expandedKey = null;
    this._dragKey = null;
    this.unsub = [];
    this._ensureDefaultState();
  }

  _ensureDefaultState() {
    if (Object.keys(this.store.state.characterLayers).length) return;
    const fresh = {};
    CHARACTER_LAYER_KEYS.forEach((key) => {
      fresh[key] = {
        assetId: null, visible: true, opacity: 1, blendMode: "normal",
        hue: 0, saturation: 0, brightness: 0, contrast: 0, paletteLock: false,
        zIndex: CHARACTER_LAYER_Z_DEFAULTS[key],
      };
    });
    this.store.state.characterLayers = fresh;
  }

  mount(container) {
    this.root = container;
    this.root.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">
        <div class="flex flex-col items-center gap-3">
          <div class="ssf-lightbox">
            <div class="ssf-checkerboard">
              <canvas data-role="stage" class="pixelated" width="16" height="16"></canvas>
            </div>
          </div>
          <button data-action="export-png" class="ssf-btn text-xs">${i18n.t("common.exportPng")}</button>
        </div>
        <div class="ssf-card">
          <h3 class="ssf-card-title" data-i18n="layers.panelTitle">${i18n.t("layers.panelTitle")}</h3>
          <div data-role="layer-list" class="space-y-2"></div>
        </div>
      </div>
    `;
    const stageCanvas = this.root.querySelector('[data-role="stage"]');
    this.renderer = new CompositeRenderer(stageCanvas, STAGE_SIZE, STAGE_SIZE);

    this.root.addEventListener("click", (e) => this._onClick(e));
    this.root.addEventListener("input", (e) => this._onInput(e));
    this.root.addEventListener("change", (e) => this._onChange(e));

    this.unsub.push(this.store.subscribe("characterLayers", () => {
      if (!Object.keys(this.store.state.characterLayers).length) this._ensureDefaultState();
      this._renderLayerList();
      this._recomposite();
    }));
    this.unsub.push(this.store.subscribe("assets", () => this._recomposite()));

    this._renderLayerList();
    this._recomposite();
  }

  refreshLocale() {
    if (this.root) this.mount(this.root);
  }

  destroy() {
    this.unsub.forEach((fn) => fn());
  }

  // ------------------------------------------------------------ ordering

  _orderedKeys() {
    const layers = this.store.state.characterLayers;
    return [...CHARACTER_LAYER_KEYS].sort((a, b) => layers[b].zIndex - layers[a].zIndex);
  }

  _applyOrder(ordered) {
    const layers = this.store.state.characterLayers;
    const n = ordered.length;
    ordered.forEach((k, i) => { layers[k].zIndex = (n - i) * 10; });
  }

  _moveLayer(key, direction) {
    const ordered = this._orderedKeys();
    const idx = ordered.indexOf(key);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= ordered.length) return;
    [ordered[idx], ordered[swapIdx]] = [ordered[swapIdx], ordered[idx]];
    this._applyOrder(ordered);
  }

  _reorderTo(draggedKey, targetKey) {
    const ordered = this._orderedKeys();
    const from = ordered.indexOf(draggedKey);
    const to = ordered.indexOf(targetKey);
    if (from === -1 || to === -1) return;
    ordered.splice(from, 1);
    ordered.splice(to, 0, draggedKey);
    this._applyOrder(ordered);
  }

  // -------------------------------------------------------------- render

  _renderLayerList() {
    const list = this.root?.querySelector('[data-role="layer-list"]');
    if (!list) return;
    const layers = this.store.state.characterLayers;
    const ordered = this._orderedKeys();
    list.innerHTML = ordered.map((key, idx) => {
      const state = layers[key];
      const asset = state.assetId ? this.assetManager.getAsset(state.assetId) : null;
      const expanded = this.expandedKey === key;
      return `
        <div class="ssf-layer-row" draggable="true" data-key="${key}">
          <div class="flex items-center gap-2 p-2">
            <span class="ssf-drag-handle" title="${i18n.t("layers.dragToReorder")}">⠿</span>
            <div class="ssf-checkerboard w-9 h-9 shrink-0 rounded overflow-hidden">
              ${asset ? `<img src="${asset.currentDataURL}" class="pixelated w-full h-full object-contain" />` : ""}
            </div>
            <button class="flex-1 text-left text-sm min-w-0" data-action="toggle-expand" data-key="${key}">
              <div class="font-medium truncate">${i18n.t(`layers.${key}`)}</div>
              <div class="text-xs text-ink-dim truncate">${asset ? asset.name : i18n.t("layers.noAssetAssigned")}</div>
            </button>
            <button data-action="move-up" data-key="${key}" class="ssf-icon-btn" ${idx === 0 ? "disabled" : ""} title="${i18n.t("layers.moveUp")}">▲</button>
            <button data-action="move-down" data-key="${key}" class="ssf-icon-btn" ${idx === ordered.length - 1 ? "disabled" : ""} title="${i18n.t("layers.moveDown")}">▼</button>
            <button data-action="toggle-visible" data-key="${key}" class="ssf-icon-btn">${state.visible ? "👁" : "🚫"}</button>
            <button data-action="assign-asset" data-key="${key}" class="ssf-btn text-xs whitespace-nowrap">${i18n.t("layers.assignAsset")}</button>
          </div>
          ${expanded ? this._layerDetailHTML(key, state) : ""}
        </div>
      `;
    }).join("");
    this._bindDragEvents();
  }

  _layerDetailHTML(key, state) {
    return `
      <div class="ssf-layer-detail">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="ssf-label">${i18n.t("layers.opacity")}</label>
            <input type="range" min="0" max="100" value="${Math.round(state.opacity * 100)}" data-role="opacity" data-key="${key}" class="ssf-slider w-full" />
          </div>
          <div>
            <label class="ssf-label">${i18n.t("layers.blendMode")}</label>
            <select data-role="blend" data-key="${key}" class="ssf-select w-full">
              ${BLEND_MODES.map((b) => `<option value="${b}" ${b === state.blendMode ? "selected" : ""}>${i18n.t(`blend.${b}`)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 mt-2">
          ${["hue", "saturation", "brightness", "contrast"].map((k) => `
            <div>
              <label class="ssf-label">${i18n.t(`layers.${k}`)}</label>
              <input type="range" min="-100" max="100" value="${state[k]}" data-role="${k}" data-key="${key}" class="ssf-slider w-full" />
            </div>
          `).join("")}
        </div>
        <label class="flex items-center gap-2 mt-3 text-sm text-ink-muted">
          <input type="checkbox" data-role="palette-lock" data-key="${key}" ${state.paletteLock ? "checked" : ""}/>
          ${i18n.t("layers.paletteLock")}
        </label>
      </div>
    `;
  }

  _bindDragEvents() {
    this.root.querySelectorAll(".ssf-layer-row").forEach((row) => {
      row.addEventListener("dragstart", () => { this._dragKey = row.dataset.key; });
      row.addEventListener("dragover", (e) => { e.preventDefault(); row.classList.add("ssf-drop-target"); });
      row.addEventListener("dragleave", () => row.classList.remove("ssf-drop-target"));
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("ssf-drop-target");
        if (!this._dragKey || this._dragKey === row.dataset.key) return;
        this._reorderTo(this._dragKey, row.dataset.key);
        this._dragKey = null;
      });
    });
  }

  // --------------------------------------------------------------- events

  _onClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const key = btn.dataset.key;
    const action = btn.dataset.action;
    if (action === "toggle-expand") {
      this.expandedKey = this.expandedKey === key ? null : key;
      this._renderLayerList();
    } else if (action === "toggle-visible") {
      this.store.state.characterLayers[key].visible = !this.store.state.characterLayers[key].visible;
    } else if (action === "move-up") {
      this._moveLayer(key, -1);
    } else if (action === "move-down") {
      this._moveLayer(key, 1);
    } else if (action === "assign-asset") {
      this.assetManager.openPicker(key, (assetId) => {
        this.store.state.characterLayers[key] = { ...this.store.state.characterLayers[key], assetId };
        if (key === "hair" && assetId) this._trySyncHairToPortrait(assetId);
      });
    } else if (action === "export-png") {
      this._exportPNG();
    }
  }

  /** Soft hair sync bridge: if the chosen hair asset shares a tag in its
   *  `compatibleWith` metadata with a portrait "hairL" asset, auto-selects
   *  that matching portrait hair variant too (only when the person has left
   *  Portrait Studio's "sync" checkbox on). Assets aren't auto-tagged, so
   *  this only fires once the user has tagged matching pieces themselves. */
  _trySyncHairToPortrait(chosenAssetId) {
    const portrait = this.store.state.portrait;
    if (!portrait || !portrait.syncHairHat || !portrait.layers?.hairL) return;
    const asset = this.assetManager.getAsset(chosenAssetId);
    if (!asset || !asset.compatibleWith.length) return;
    const candidates = this.assetManager.getAssetsByCategory("hairL");
    const match = candidates.find((c) => c.compatibleWith.some((tag) => asset.compatibleWith.includes(tag)));
    if (match) this.store.state.portrait.layers.hairL.assetId = match.id;
  }

  _onInput(e) {
    const el = e.target;
    const key = el.dataset.key;
    if (!key || !this.store.state.characterLayers[key]) return;
    const layers = this.store.state.characterLayers;
    if (el.dataset.role === "opacity") layers[key].opacity = parseInt(el.value, 10) / 100;
    else if (["hue", "saturation", "brightness", "contrast"].includes(el.dataset.role)) {
      layers[key][el.dataset.role] = parseInt(el.value, 10);
    }
  }

  _onChange(e) {
    const el = e.target;
    const key = el.dataset.key;
    if (!key || !this.store.state.characterLayers[key]) return;
    const layers = this.store.state.characterLayers;
    if (el.dataset.role === "blend") layers[key].blendMode = el.value;
    else if (el.dataset.role === "palette-lock") layers[key].paletteLock = el.checked;
  }

  // ---------------------------------------------------------- compositing

  _recomposite() {
    if (!this.renderer) return;
    const layers = this.store.state.characterLayers;
    const bodyState = layers.body;
    const bodyAsset = bodyState?.assetId ? this.assetManager.getAsset(bodyState.assetId) : null;
    const referenceAnchor = bodyAsset ? bodyAsset.anchor : DEFAULT_REFERENCE_ANCHOR;

    CHARACTER_LAYER_KEYS.forEach((key) => {
      const state = layers[key];
      const layerCanvas = this.renderer.getOrCreateLayer(key);
      layerCanvas.visible = state.visible;
      layerCanvas.opacity = state.opacity;
      layerCanvas.blendMode = state.blendMode;
      layerCanvas.zIndex = state.zIndex;

      if (!state.assetId) { layerCanvas.clear(); return; }
      const asset = this.assetManager.getAsset(state.assetId);
      if (!asset) { layerCanvas.clear(); return; }
      const img = this.imageCache.get(asset.currentDataURL, () => { this._recomposite(); });
      if (!img) return;

      const working = document.createElement("canvas");
      working.width = asset.width; working.height = asset.height;
      const wctx = working.getContext("2d");
      wctx.imageSmoothingEnabled = false;
      wctx.drawImage(img, 0, 0);
      if (state.hue || state.saturation || state.brightness || state.contrast) {
        applyColorAdjustments(working, state);
      }
      if (state.paletteLock) applyPaletteLock(working, EXAMPLE_PALETTE);

      const offset = resolveAnchorOffset(referenceAnchor, asset.anchor);
      layerCanvas.setContent(working, offset.x, offset.y);
    });
    this.renderer.render();
  }

  async _exportPNG() {
    const canvas = this.renderer.snapshotCanvas();
    await downloadCanvasAsPNG(canvas, "character.png");
  }

  // --------------------------------------------------------- for main.js

  getExportData() {
    const composite = this.renderer ? this.renderer.snapshotCanvas() : null;
    return {
      folder: "character",
      pngs: composite ? [{ name: "character_composite", canvas: composite }] : [],
      json: [{ name: "character_layers", data: this.store.state.characterLayers }],
    };
  }
}
