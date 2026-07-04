// portraitStudio.js — Portrait Studio: 384×384 dialog-portrait editor with
// its own layer stack, an emotion system that swaps eyes/eyebrows/mouth
// variants, a simple directional lighting overlay, and a soft hair sync
// bridge to the Character Editor (matches assets sharing a tag in their
// `compatibleWith` metadata — see characterEditor.js for the other half).
//
// NOTE on layer placement: unlike clothing layers in the Character Editor,
// portrait layers are expected to be authored at (or near) the full 384×384
// canvas size, so they're simply centered rather than run through the
// anchor system — that keeps behaviour predictable for template-style art.

import { i18n } from "../core/i18n.js";
import { PORTRAIT_LAYER_KEYS, PORTRAIT_LAYER_Z_DEFAULTS, EMOTIONS } from "../data/locales.js";
import { CompositeRenderer, ImageCache } from "../core/canvasEngine.js";
import { downloadCanvasAsPNG } from "../utils/exportUtils.js";

const STAGE_SIZE = 384;
const EMOTION_DRIVEN_LAYERS = ["eyes", "eyebrows", "mouth"];

function emptyEmotionMap() {
  const map = {};
  EMOTIONS.forEach((e) => { map[e] = null; });
  return map;
}

export class PortraitStudio {
  constructor({ store, assetManager }) {
    this.store = store;
    this.assetManager = assetManager;
    this.imageCache = new ImageCache();
    this.renderer = null;
    this.root = null;
    this.unsub = [];
    this._ensureDefaultState();
  }

  _ensureDefaultState() {
    const portrait = this.store.state.portrait;
    if (portrait.layers && Object.keys(portrait.layers).length) return;
    const layers = {};
    PORTRAIT_LAYER_KEYS.forEach((key) => {
      layers[key] = EMOTION_DRIVEN_LAYERS.includes(key)
        ? { assetIdByEmotion: emptyEmotionMap(), visible: true, zIndex: PORTRAIT_LAYER_Z_DEFAULTS[key] }
        : { assetId: null, visible: true, zIndex: PORTRAIT_LAYER_Z_DEFAULTS[key] };
    });
    this.store.state.portrait = {
      layers, emotion: "neutral",
      lighting: { angle: 45, intensity: 40, enabled: false },
      syncHairHat: true,
    };
  }

  mount(container) {
    this.root = container;
    const portrait = this.store.state.portrait;
    this.root.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">
        <div class="flex flex-col items-center gap-3">
          <div class="ssf-lightbox">
            <div class="ssf-checkerboard">
              <canvas data-role="stage" class="pixelated" width="${STAGE_SIZE}" height="${STAGE_SIZE}"
                style="width:min(320px,80vw);height:min(320px,80vw);"></canvas>
            </div>
          </div>
          <div class="flex flex-wrap gap-1 justify-center" data-role="emotion-tabs"></div>
          <button data-action="export-png" class="ssf-btn text-xs">${i18n.t("common.exportPng")}</button>
        </div>
        <div class="ssf-card space-y-4">
          <div>
            <h3 class="ssf-card-title" data-i18n="portrait.layers">${i18n.t("portrait.layers")}</h3>
            <div data-role="layer-list" class="space-y-1"></div>
          </div>
          <div class="border-t border-line pt-3">
            <label class="flex items-center gap-2 text-sm text-ink-muted mb-2">
              <input type="checkbox" data-role="lighting-enabled" ${portrait.lighting.enabled ? "checked" : ""}/>
              ${i18n.t("portrait.lighting")}
            </label>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="ssf-label">${i18n.t("portrait.lightAngle")}</label>
                <input type="range" min="0" max="360" data-role="light-angle" value="${portrait.lighting.angle}" class="ssf-slider w-full" />
              </div>
              <div>
                <label class="ssf-label">${i18n.t("portrait.lightIntensity")}</label>
                <input type="range" min="0" max="100" data-role="light-intensity" value="${portrait.lighting.intensity}" class="ssf-slider w-full" />
              </div>
            </div>
          </div>
          <div class="border-t border-line pt-3">
            <label class="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" data-role="sync-hair" ${portrait.syncHairHat ? "checked" : ""}/>
              ${i18n.t("portrait.syncToCharacter")}
            </label>
            <p class="text-xs text-ink-dim mt-1">${i18n.t("portrait.syncHint")}</p>
          </div>
        </div>
      </div>
    `;
    const stageCanvas = this.root.querySelector('[data-role="stage"]');
    this.renderer = new CompositeRenderer(stageCanvas, STAGE_SIZE, STAGE_SIZE);

    this.root.addEventListener("click", (e) => this._onClick(e));
    this.root.addEventListener("input", (e) => this._onInput(e));
    this.root.addEventListener("change", (e) => this._onChange(e));

    this.unsub.push(this.store.subscribe("portrait", () => {
      if (!Object.keys(this.store.state.portrait.layers || {}).length) this._ensureDefaultState();
      this._renderLayerList();
      this._renderEmotionTabs();
      this._recomposite();
    }));
    this.unsub.push(this.store.subscribe("assets", () => this._recomposite()));

    this._renderEmotionTabs();
    this._renderLayerList();
    this._recomposite();
  }

  refreshLocale() { if (this.root) this.mount(this.root); }
  destroy() { this.unsub.forEach((fn) => fn()); }

  // -------------------------------------------------------------- render

  _renderEmotionTabs() {
    const tabs = this.root.querySelector('[data-role="emotion-tabs"]');
    const portrait = this.store.state.portrait;
    tabs.innerHTML = EMOTIONS.map((e) => `
      <button data-action="select-emotion" data-emotion="${e}" class="ssf-chip text-xs ${portrait.emotion === e ? "ssf-chip-active" : ""}">
        ${i18n.t(`portrait.${e}`)}
      </button>
    `).join("");
  }

  _renderLayerList() {
    const list = this.root.querySelector('[data-role="layer-list"]');
    const portrait = this.store.state.portrait;
    list.innerHTML = PORTRAIT_LAYER_KEYS.map((key) => {
      const state = portrait.layers[key];
      const isEmotionDriven = EMOTION_DRIVEN_LAYERS.includes(key);
      const assetId = isEmotionDriven ? state.assetIdByEmotion[portrait.emotion] : state.assetId;
      const asset = assetId ? this.assetManager.getAsset(assetId) : null;
      return `
        <div class="flex items-center gap-2 p-2 ssf-layer-row">
          <div class="ssf-checkerboard w-9 h-9 shrink-0 rounded overflow-hidden">
            ${asset ? `<img src="${asset.currentDataURL}" class="pixelated w-full h-full object-contain" />` : ""}
          </div>
          <div class="flex-1 text-sm min-w-0">
            <div class="font-medium truncate">${i18n.t(`portrait.${key}`)}${isEmotionDriven ? ` · ${i18n.t(`portrait.${portrait.emotion}`)}` : ""}</div>
            <div class="text-xs text-ink-dim truncate">${asset ? asset.name : i18n.t("layers.noAssetAssigned")}</div>
          </div>
          <button data-action="toggle-visible" data-key="${key}" class="ssf-icon-btn">${state.visible ? "👁" : "🚫"}</button>
          <button data-action="assign-asset" data-key="${key}" class="ssf-btn text-xs whitespace-nowrap">${i18n.t("layers.assignAsset")}</button>
        </div>
      `;
    }).join("");
  }

  // --------------------------------------------------------------- events

  _onClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const key = btn.dataset.key;
    const action = btn.dataset.action;
    const portrait = this.store.state.portrait;
    if (action === "select-emotion") {
      portrait.emotion = btn.dataset.emotion;
    } else if (action === "toggle-visible") {
      portrait.layers[key].visible = !portrait.layers[key].visible;
    } else if (action === "assign-asset") {
      this.assetManager.openPicker(key, (assetId) => {
        const isEmotionDriven = EMOTION_DRIVEN_LAYERS.includes(key);
        if (isEmotionDriven) {
          this.store.state.portrait.layers[key].assetIdByEmotion[this.store.state.portrait.emotion] = assetId;
        } else {
          this.store.state.portrait.layers[key].assetId = assetId;
          if (key === "hairL" && assetId) this._trySyncHairToCharacter(assetId);
        }
      });
    } else if (action === "export-png") {
      this._exportPNG();
    }
  }

  _onInput(e) {
    const portrait = this.store.state.portrait;
    if (e.target.dataset.role === "light-angle") portrait.lighting.angle = parseInt(e.target.value, 10);
    else if (e.target.dataset.role === "light-intensity") portrait.lighting.intensity = parseInt(e.target.value, 10);
  }

  _onChange(e) {
    const portrait = this.store.state.portrait;
    if (e.target.dataset.role === "lighting-enabled") portrait.lighting.enabled = e.target.checked;
    else if (e.target.dataset.role === "sync-hair") portrait.syncHairHat = e.target.checked;
  }

  _trySyncHairToCharacter(chosenAssetId) {
    const portrait = this.store.state.portrait;
    if (!portrait.syncHairHat) return;
    const asset = this.assetManager.getAsset(chosenAssetId);
    if (!asset || !asset.compatibleWith.length) return;
    const candidates = this.assetManager.getAssetsByCategory("hair");
    const match = candidates.find((c) => c.compatibleWith.some((tag) => asset.compatibleWith.includes(tag)));
    if (match) {
      this.store.state.characterLayers.hair = { ...this.store.state.characterLayers.hair, assetId: match.id };
    }
  }

  // ---------------------------------------------------------- compositing

  _recomposite() {
    if (!this.renderer) return;
    const portrait = this.store.state.portrait;
    PORTRAIT_LAYER_KEYS.forEach((key) => {
      const state = portrait.layers[key];
      const layerCanvas = this.renderer.getOrCreateLayer(key);
      layerCanvas.visible = state.visible;
      layerCanvas.opacity = 1;
      layerCanvas.blendMode = "normal";
      layerCanvas.zIndex = state.zIndex;

      const assetId = EMOTION_DRIVEN_LAYERS.includes(key) ? state.assetIdByEmotion[portrait.emotion] : state.assetId;
      if (!assetId) { layerCanvas.clear(); return; }
      const asset = this.assetManager.getAsset(assetId);
      if (!asset) { layerCanvas.clear(); return; }
      const img = this.imageCache.get(asset.currentDataURL, () => this._recomposite());
      if (!img) return;
      const offsetX = Math.round((STAGE_SIZE - asset.width) / 2);
      const offsetY = Math.round((STAGE_SIZE - asset.height) / 2);
      layerCanvas.setContent(img, offsetX, offsetY);
    });
    this.renderer.render();
    this._applyLightingOverlay();
  }

  _applyLightingOverlay() {
    const { angle, intensity, enabled } = this.store.state.portrait.lighting;
    if (!enabled || intensity <= 0) return;
    const ctx = this.renderer.ctx;
    const w = STAGE_SIZE, h = STAGE_SIZE;
    const rad = ((angle - 90) * Math.PI) / 180;
    const cx = w / 2 + Math.cos(rad) * w * 0.5;
    const cy = h / 2 + Math.sin(rad) * h * 0.5;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.9);
    grad.addColorStop(0, `rgba(255,244,214,${(intensity / 100) * 0.5})`);
    grad.addColorStop(1, `rgba(20,15,35,${(intensity / 100) * 0.55})`);
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  async _exportPNG() {
    const canvas = this.renderer.snapshotCanvas();
    await downloadCanvasAsPNG(canvas, `portrait_${this.store.state.portrait.emotion}.png`);
  }

  getExportData() {
    const composite = this.renderer ? this.renderer.snapshotCanvas() : null;
    return {
      folder: "portrait",
      pngs: composite ? [{ name: `portrait_${this.store.state.portrait.emotion}`, canvas: composite }] : [],
      json: [{ name: "portrait_layers", data: this.store.state.portrait }],
    };
  }
}
