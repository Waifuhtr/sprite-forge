// animationSystem.js — 4-direction frame-based animation timeline. Frames
// can be captured straight from the Character Editor's current composite or
// assigned from any gallery asset. Includes play/pause + FPS preview, onion
// skinning, a simple crossfade "tween" helper between two adjacent frames,
// and sprite-sheet export.
//
// NOTE on interpolation: pixel-art "tweening" isn't a well-defined operation
// the way it is for vector/skeletal animation. The interpolate button here
// generates a straightforward alpha crossfade between two frames, which is a
// useful quick starting point to hand-clean up rather than a true betweener.

import { i18n } from "../core/i18n.js";
import { DIRECTIONS } from "../data/locales.js";
import { ImageCache } from "../core/canvasEngine.js";
import { loadImage, canvasToDataURL } from "../utils/imageTools.js";
import { downloadCanvasAsPNG, buildSpriteSheet } from "../utils/exportUtils.js";

let frameUid = 0;
function newFrameId() { frameUid += 1; return `f${Date.now().toString(36)}${frameUid}`; }

export class AnimationSystem {
  constructor({ store, assetManager, characterEditor }) {
    this.store = store;
    this.assetManager = assetManager;
    this.characterEditor = characterEditor;
    this.imageCache = new ImageCache();
    this.root = null;
    this.unsub = [];
    this._playTimer = null;
    this._ensureDefaultState();
  }

  _ensureDefaultState() {
    const anim = this.store.state.animation;
    if (anim && anim.frames) return;
    this.store.state.animation = {
      fps: 6, onionSkin: true, activeDirection: "down", activeFrameIndex: 0, playing: false,
      frames: { down: [], up: [], left: [], right: [] },
    };
  }

  mount(container) {
    this.root = container;
    const anim = this.store.state.animation;
    this.root.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">
        <div class="flex flex-col items-center gap-3">
          <div class="ssf-lightbox">
            <div class="ssf-checkerboard"><canvas data-role="preview" class="pixelated"></canvas></div>
          </div>
          <div class="flex items-center gap-2">
            <button data-action="play-pause" class="ssf-btn ssf-btn-primary text-xs" data-role="play-btn"></button>
            <label class="text-xs text-ink-muted flex items-center gap-1">${i18n.t("anim.fps")}
              <input type="range" min="1" max="12" data-role="fps" value="${anim.fps}" class="ssf-slider w-24" />
              <span data-role="fps-value" class="w-5 text-center">${anim.fps}</span>
            </label>
          </div>
          <label class="flex items-center gap-2 text-xs text-ink-muted">
            <input type="checkbox" data-role="onion" ${anim.onionSkin ? "checked" : ""}/> ${i18n.t("anim.onionSkin")}
          </label>
          <button data-action="export-sheet" class="ssf-btn text-xs">${i18n.t("anim.exportSheet")}</button>
        </div>
        <div class="ssf-card">
          <div class="flex flex-wrap gap-2 mb-3" data-role="direction-tabs"></div>
          <div data-role="frame-strip" class="flex flex-wrap gap-2 mb-3 min-h-[70px]"></div>
          <div class="flex flex-wrap gap-2">
            <button data-action="capture" class="ssf-btn text-xs">+ ${i18n.t("nav.character")}</button>
            <button data-action="from-gallery" class="ssf-btn text-xs">+ ${i18n.t("nav.assets")}</button>
            <button data-action="duplicate" class="ssf-btn text-xs">${i18n.t("anim.duplicateFrame")}</button>
            <button data-action="remove" class="ssf-btn text-xs text-berry">${i18n.t("anim.removeFrame")}</button>
            <button data-action="interpolate" class="ssf-btn text-xs">${i18n.t("anim.interpolate")}</button>
          </div>
        </div>
      </div>
    `;
    this.previewCanvas = this.root.querySelector('[data-role="preview"]');
    this.previewCanvas.width = 16; this.previewCanvas.height = 16;
    this.pctx = this.previewCanvas.getContext("2d");
    this.pctx.imageSmoothingEnabled = false;

    this.root.addEventListener("click", (e) => this._onClick(e));
    this.root.addEventListener("input", (e) => this._onInput(e));
    this.root.addEventListener("change", (e) => this._onChange(e));

    this.unsub.push(this.store.subscribe("animation", () => {
      if (!this.store.state.animation.frames) this._ensureDefaultState();
      this._renderAll();
    }));
    this._renderAll();
  }

  refreshLocale() { if (this.root) this.mount(this.root); }
  destroy() { this.unsub.forEach((fn) => fn()); this._stopPlayback(); }

  pause() {
    if (this.store.state.animation.playing) {
      this.store.state.animation.playing = false;
      this._stopPlayback();
    }
  }

  _img(src) {
    return this.imageCache.get(src, () => this._drawPreview());
  }

  // -------------------------------------------------------------- render

  _renderAll() {
    if (!this.root) return;
    this._renderDirectionTabs();
    this._renderFrameStrip();
    this._drawPreview();
    this._updatePlayButton();
    const fpsVal = this.root.querySelector('[data-role="fps-value"]');
    if (fpsVal) fpsVal.textContent = this.store.state.animation.fps;
  }

  _renderDirectionTabs() {
    const tabs = this.root.querySelector('[data-role="direction-tabs"]');
    const anim = this.store.state.animation;
    tabs.innerHTML = DIRECTIONS.map((d) => `
      <button data-action="select-direction" data-dir="${d}" class="ssf-chip ${anim.activeDirection === d ? "ssf-chip-active" : ""}">
        ${i18n.t(`anim.${d}`)} (${anim.frames[d].length})
      </button>
    `).join("");
  }

  _renderFrameStrip() {
    const strip = this.root.querySelector('[data-role="frame-strip"]');
    const anim = this.store.state.animation;
    const frames = anim.frames[anim.activeDirection];
    if (!frames.length) { strip.innerHTML = `<p class="text-sm text-ink-muted">${i18n.t("anim.emptyFrame")}</p>`; return; }
    strip.innerHTML = frames.map((f, i) => `
      <button data-action="select-frame" data-index="${i}" class="ssf-thumb ${i === anim.activeFrameIndex ? "ssf-thumb-active" : ""}" style="width:56px">
        <div class="ssf-checkerboard"><img src="${f.dataUrl}" class="pixelated" /></div>
        <div class="ssf-thumb-label">${i + 1}</div>
      </button>
    `).join("");
  }

  _drawPreview() {
    if (!this.pctx) return;
    const anim = this.store.state.animation;
    const frames = anim.frames[anim.activeDirection];
    this.pctx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    if (!frames.length) return;
    const idx = Math.min(anim.activeFrameIndex, frames.length - 1);
    if (anim.onionSkin && idx > 0) {
      const prevImg = this._img(frames[idx - 1].dataUrl);
      if (prevImg) {
        this.pctx.globalAlpha = 0.3;
        this.pctx.drawImage(prevImg, 0, 0, this.previewCanvas.width, this.previewCanvas.height);
        this.pctx.globalAlpha = 1;
      }
    }
    const img = this._img(frames[idx].dataUrl);
    if (img) this.pctx.drawImage(img, 0, 0, this.previewCanvas.width, this.previewCanvas.height);
  }

  _updatePlayButton() {
    const btn = this.root.querySelector('[data-role="play-btn"]');
    if (!btn) return;
    btn.textContent = this.store.state.animation.playing ? `⏸ ${i18n.t("anim.pause")}` : `▶ ${i18n.t("anim.play")}`;
  }

  // --------------------------------------------------------------- events

  _onClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const anim = this.store.state.animation;
    const action = btn.dataset.action;
    if (action === "select-direction") {
      anim.activeDirection = btn.dataset.dir; anim.activeFrameIndex = 0;
    } else if (action === "select-frame") {
      anim.activeFrameIndex = parseInt(btn.dataset.index, 10);
    } else if (action === "play-pause") {
      anim.playing = !anim.playing;
      if (anim.playing) this._startPlayback(); else this._stopPlayback();
    } else if (action === "capture") {
      this._captureFromCharacter();
    } else if (action === "from-gallery") {
      this.assetManager.openPicker(null, (assetId) => {
        if (!assetId) return;
        const asset = this.assetManager.getAsset(assetId);
        this._addFrame(asset.currentDataURL, asset.width, asset.height);
      });
    } else if (action === "duplicate") {
      this._duplicateFrame();
    } else if (action === "remove") {
      this._removeFrame();
    } else if (action === "interpolate") {
      this._interpolate();
    } else if (action === "export-sheet") {
      this._exportSheet();
    }
  }

  _onInput(e) {
    if (e.target.dataset.role === "fps") {
      this.store.state.animation.fps = parseInt(e.target.value, 10);
      const fpsVal = this.root.querySelector('[data-role="fps-value"]');
      if (fpsVal) fpsVal.textContent = e.target.value;
      if (this.store.state.animation.playing) this._startPlayback();
    }
  }

  _onChange(e) {
    if (e.target.dataset.role === "onion") {
      this.store.state.animation.onionSkin = e.target.checked;
    }
  }

  // ----------------------------------------------------------- playback

  _startPlayback() {
    this._stopPlayback();
    const tick = () => {
      const anim = this.store.state.animation;
      const frames = anim.frames[anim.activeDirection];
      if (frames.length) anim.activeFrameIndex = (anim.activeFrameIndex + 1) % frames.length;
      this._playTimer = setTimeout(tick, 1000 / Math.max(1, anim.fps));
    };
    this._playTimer = setTimeout(tick, 1000 / Math.max(1, this.store.state.animation.fps));
  }

  _stopPlayback() {
    if (this._playTimer) { clearTimeout(this._playTimer); this._playTimer = null; }
  }

  // -------------------------------------------------------- frame editing

  _captureFromCharacter() {
    if (!this.characterEditor?.renderer) return;
    const canvas = this.characterEditor.renderer.snapshotCanvas();
    this._addFrame(canvasToDataURL(canvas), canvas.width, canvas.height);
  }

  _addFrame(dataUrl, width, height) {
    const anim = this.store.state.animation;
    const frames = anim.frames[anim.activeDirection];
    frames.push({ id: newFrameId(), dataUrl, width, height });
    anim.activeFrameIndex = frames.length - 1;
  }

  _duplicateFrame() {
    const anim = this.store.state.animation;
    const frames = anim.frames[anim.activeDirection];
    if (!frames.length) return;
    const src = frames[anim.activeFrameIndex];
    frames.splice(anim.activeFrameIndex + 1, 0, { id: newFrameId(), dataUrl: src.dataUrl, width: src.width, height: src.height });
    anim.activeFrameIndex += 1;
  }

  _removeFrame() {
    const anim = this.store.state.animation;
    const frames = anim.frames[anim.activeDirection];
    if (!frames.length) return;
    frames.splice(anim.activeFrameIndex, 1);
    anim.activeFrameIndex = Math.max(0, Math.min(anim.activeFrameIndex, frames.length - 1));
  }

  _interpolate() {
    const anim = this.store.state.animation;
    const frames = anim.frames[anim.activeDirection];
    const idx = anim.activeFrameIndex;
    if (frames.length < 2 || idx >= frames.length - 1) return;
    const countStr = window.prompt(`${i18n.t("anim.interpolate")} (1-3)`, "1");
    if (countStr === null) return;
    const count = Math.max(1, Math.min(3, parseInt(countStr, 10) || 1));
    const a = frames[idx], b = frames[idx + 1];
    const imgA = this._img(a.dataUrl), imgB = this._img(b.dataUrl);
    if (!imgA || !imgB) return;
    const w = a.width, h = a.height;
    const inserts = [];
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(imgA, 0, 0, w, h);
      ctx.globalAlpha = t;
      ctx.drawImage(imgB, 0, 0, w, h);
      ctx.globalAlpha = 1;
      inserts.push({ id: newFrameId(), dataUrl: canvasToDataURL(c), width: w, height: h });
    }
    frames.splice(idx + 1, 0, ...inserts);
  }

  // -------------------------------------------------------------- export

  async _exportSheet() {
    const anim = this.store.state.animation;
    const framesByDirection = {};
    let fw = 16, fh = 16;
    for (const d of DIRECTIONS) {
      const canvases = [];
      for (const f of anim.frames[d]) {
        fw = f.width; fh = f.height;
        const img = await loadImage(f.dataUrl);
        const c = document.createElement("canvas");
        c.width = f.width; c.height = f.height;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        canvases.push(c);
      }
      framesByDirection[d] = canvases;
    }
    const sheet = buildSpriteSheet(framesByDirection, DIRECTIONS, fw, fh);
    await downloadCanvasAsPNG(sheet, "animation_sheet.png");
  }

  getExportData() {
    const anim = this.store.state.animation;
    const dataUrls = [];
    DIRECTIONS.forEach((d) => {
      anim.frames[d].forEach((f, i) => dataUrls.push({ name: `${d}_frame_${i + 1}`, dataUrl: f.dataUrl }));
    });
    const json = [{
      name: "animation_data",
      data: { fps: anim.fps, directions: DIRECTIONS, frameCounts: Object.fromEntries(DIRECTIONS.map((d) => [d, anim.frames[d].length])) },
    }];
    return { folder: "animation", dataUrls, json };
  }
}
