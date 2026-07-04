// assetManager.js — Atlas Parser/Slicer + Asset gallery + in-asset editor.
// This is the most critical module in the project: it turns one big atlas
// image (hats.png, shirts.png, objects.png…) into many independently
// editable, taggable sprite assets that every other editor pulls from.

import { i18n } from "../core/i18n.js";
import {
  CHARACTER_LAYER_KEYS, PORTRAIT_LAYER_KEYS,
  CHARACTER_LAYER_Z_DEFAULTS, PORTRAIT_LAYER_Z_DEFAULTS,
} from "../data/locales.js";
import {
  loadImageFromFile, applyColorAdjustments, applyPaletteLock, EXAMPLE_PALETTE,
  floodFill, flipCanvas, rotateCanvas90, canvasToDataURL,
} from "../utils/imageTools.js";

const CANDIDATE_GRID_SIZES = [16, 32, 64, 24, 48, 8];
const OTHER_CATEGORIES = ["object", "tile", "other"];
const MAX_PREVIEW_WIDTH = 560;

const FILENAME_KEYWORDS = {
  hat: ["hat", "sapka", "şapka"], shirt: ["shirt", "gomlek", "gömlek"],
  pants: ["pant", "pantolon"], shoes: ["shoe", "boot", "ayakkabi", "ayakkabı"],
  hair: ["hair", "sac", "saç"], accessory: ["access", "aksesuar"],
  facialHair: ["beard", "mustache", "sakal", "biyik", "bıyık"],
  glasses: ["glass", "gozluk", "gözlük"], body: ["body", "vucut", "vücut"],
  special: ["special", "ozel", "özel"],
  eyes: ["eye", "goz", "göz"], mouth: ["mouth", "agiz", "ağız"],
  eyebrows: ["eyebrow", "kas", "kaş"], nose: ["nose", "burun"],
  faceShape: ["face", "yuz", "yüz"], blush: ["blush", "allik", "allık"],
  background: ["background", "bg", "arkaplan"],
  object: ["object", "obje", "furniture", "esya", "eşya"], tile: ["tile", "terrain", "zemin"],
};

function detectGrid(width, height) {
  for (const size of CANDIDATE_GRID_SIZES) {
    if (width % size === 0 && height % size === 0) {
      return { cellW: size, cellH: size, cols: width / size, rows: height / size };
    }
  }
  return null;
}

function guessCategory(filename) {
  const lower = filename.toLowerCase();
  for (const [cat, words] of Object.entries(FILENAME_KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) return cat;
  }
  return "other";
}

function categoryLabel(cat) {
  if (CHARACTER_LAYER_KEYS.includes(cat)) return i18n.t(`layers.${cat}`);
  if (PORTRAIT_LAYER_KEYS.includes(cat)) return i18n.t(`portrait.${cat}`);
  if (cat === "object") return i18n.t("assets.categoryObject");
  if (cat === "tile") return i18n.t("assets.categoryTile");
  return i18n.t("assets.categoryOther");
}

function defaultZIndex(cat) {
  return CHARACTER_LAYER_Z_DEFAULTS[cat] ?? PORTRAIT_LAYER_Z_DEFAULTS[cat] ?? 0;
}

function categoryOptionsHTML(selected) {
  const group = (keys, labelKey) => `<optgroup label="${i18n.t(labelKey)}">${keys
    .map((k) => `<option value="${k}" ${k === selected ? "selected" : ""}>${categoryLabel(k)}</option>`)
    .join("")}</optgroup>`;
  return (
    group(CHARACTER_LAYER_KEYS, "assets.groupCharacter") +
    group(PORTRAIT_LAYER_KEYS, "assets.groupPortrait") +
    group(OTHER_CATEGORIES, "assets.groupOther")
  );
}

let uidCounter = 0;
function uid() { uidCounter += 1; return `${Date.now().toString(36)}${uidCounter}`; }

export class AssetManager {
  constructor({ store, database }) {
    this.store = store;
    this.database = database;
    this.queue = [];        // pending atlases: { id, file, filename, image, cellW, cellH, category, sourceLabel }
    this.activeQueueId = null;
    this.manualRegions = [];  // [{x,y,w,h}] in original-atlas pixel coords, for the active queue item
    this.manualMode = false;
    this.dragStart = null;
    this.skipTransparent = false;
    this.galleryFilter = "all";
    this.editing = null;    // { assetId, canvas, ctx, tool, brushColor, brushSize, settingAnchor }
    this.root = null;
    this.unsub = [];
  }

  mount(container) {
    this.root = container;
    this.root.innerHTML = `
      <div class="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4">
        <div class="space-y-4">
          <div class="ssf-card">
            <h3 class="ssf-card-title" data-i18n="assets.uploadAtlas">${i18n.t("assets.uploadAtlas")}</h3>
            <p class="text-sm text-ink-muted mb-3" data-i18n="assets.uploadHint">${i18n.t("assets.uploadHint")}</p>
            <label class="ssf-dropzone">
              <input type="file" accept="image/png,image/*" multiple class="hidden" data-role="file-input" />
              <span data-i18n="assets.chooseFiles">${i18n.t("assets.chooseFiles")}</span>
            </label>
            <div data-role="queue-list" class="mt-3 flex flex-wrap gap-2"></div>
          </div>
          <div data-role="active-atlas-panel"></div>
        </div>
        <div class="ssf-card flex flex-col min-h-[420px]">
          <div class="flex items-center justify-between mb-3">
            <h3 class="ssf-card-title mb-0" data-i18n="assets.gallery">${i18n.t("assets.gallery")}</h3>
            <select data-role="gallery-filter" class="ssf-select text-xs"></select>
          </div>
          <div data-role="gallery-grid" class="ssf-gallery-grid flex-1"></div>
        </div>
      </div>
      <div data-role="editor-modal"></div>
    `;

    this.root.querySelector('[data-role="file-input"]').addEventListener("change", (e) => {
      this._enqueueFiles(e.target.files);
      e.target.value = "";
    });
    const dropzone = this.root.querySelector(".ssf-dropzone");
    ["dragover", "dragenter"].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("ssf-dropzone-active"); }));
    ["dragleave", "drop"].forEach((evt) => dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("ssf-dropzone-active"); }));
    dropzone.addEventListener("drop", (e) => this._enqueueFiles(e.dataTransfer.files));

    this.root.addEventListener("click", (e) => this._onRootClick(e));
    this.root.addEventListener("change", (e) => this._onRootChange(e));

    this.unsub.push(this.store.subscribe("assets", () => this._renderGallery()));
    this._renderGallery();
    this._renderQueue();
  }

  refreshLocale() {
    // Full remount is simplest & safe: rebuilds all text via i18n & preserves store data.
    if (this.root) this.mount(this.root);
  }

  destroy() {
    this.unsub.forEach((fn) => fn());
  }

  // ---------------------------------------------------------------- queue

  async _enqueueFiles(fileList) {
    const files = Array.from(fileList || []);
    for (const file of files) {
      try {
        const image = await loadImageFromFile(file);
        const grid = detectGrid(image.naturalWidth, image.naturalHeight);
        const item = {
          id: uid(), file, filename: file.name, image,
          cellW: grid ? grid.cellW : 16, cellH: grid ? grid.cellH : 16,
          detected: !!grid, category: guessCategory(file.name),
          sourceLabel: file.name,
        };
        this.queue.push(item);
        if (!this.activeQueueId) this.activeQueueId = item.id;
      } catch (err) {
        console.error("Failed to load atlas file", file.name, err);
      }
    }
    this._renderQueue();
    this._renderActiveAtlas();
  }

  get activeItem() {
    return this.queue.find((q) => q.id === this.activeQueueId) || null;
  }

  _renderQueue() {
    const list = this.root.querySelector('[data-role="queue-list"]');
    if (!list) return;
    if (!this.queue.length) { list.innerHTML = ""; return; }
    list.innerHTML = `
      <div class="text-xs uppercase tracking-wide text-ink-dim w-full mb-1">${i18n.t("assets.atlasQueue")}</div>
      ${this.queue.map((q) => `
        <button data-action="select-queue" data-id="${q.id}"
          class="ssf-chip ${q.id === this.activeQueueId ? "ssf-chip-active" : ""}">
          ${q.filename}${!q.detected ? " ⚠" : ""}
        </button>`).join("")}
      ${this.queue.length > 1 ? `<button data-action="slice-all" class="ssf-btn ssf-btn-primary text-xs">${i18n.t("assets.processAll")}</button>` : ""}
    `;
  }

  _renderActiveAtlas() {
    const panel = this.root.querySelector('[data-role="active-atlas-panel"]');
    const item = this.activeItem;
    if (!item) { panel.innerHTML = ""; return; }
    panel.innerHTML = `
      <div class="ssf-card">
        <div class="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label class="ssf-label">${i18n.t("assets.category")}</label>
            <select data-role="atlas-category" class="ssf-select">${categoryOptionsHTML(item.category)}</select>
          </div>
          <div>
            <label class="ssf-label">${i18n.t("assets.cellWidth")}</label>
            <input type="number" min="1" data-role="cell-w" value="${item.cellW}" class="ssf-input w-20" />
          </div>
          <div>
            <label class="ssf-label">${i18n.t("assets.cellHeight")}</label>
            <input type="number" min="1" data-role="cell-h" value="${item.cellH}" class="ssf-input w-20" />
          </div>
          <label class="flex items-center gap-2 text-sm text-ink-muted pb-2">
            <input type="checkbox" data-role="skip-transparent" ${this.skipTransparent ? "checked" : ""}/> skip empty cells
          </label>
        </div>
        ${!item.detected ? `<p class="text-berry text-xs mb-2">${i18n.t("assets.detectFailed")}</p>` : `<p class="text-moss text-xs mb-2">${i18n.t("assets.detectedGrid")}: ${item.cellW}×${item.cellH}</p>`}
        <div class="ssf-checkerboard inline-block border border-line rounded" data-role="preview-wrap">
          <canvas data-role="atlas-preview" class="pixelated block cursor-crosshair"></canvas>
        </div>
        <div class="flex flex-wrap gap-2 mt-3">
          <button data-action="toggle-manual" class="ssf-btn ${this.manualMode ? "ssf-btn-primary" : ""} text-xs">${i18n.t("assets.manualRegion")}</button>
          <button data-action="auto-slice" class="ssf-btn ssf-btn-primary text-xs">${i18n.t("assets.autoSlice")}</button>
          ${this.manualRegions.length ? `<button data-action="slice-manual" class="ssf-btn ssf-btn-primary text-xs">${i18n.t("assets.manualRegion")} (${this.manualRegions.length})</button>` : ""}
        </div>
        ${this.manualMode ? `<p class="text-xs text-ink-muted mt-2">${i18n.t("assets.manualRegionHint")}</p>` : ""}
      </div>
    `;
    this._setupPreviewCanvas();
  }

  _setupPreviewCanvas() {
    const item = this.activeItem;
    const canvas = this.root.querySelector('[data-role="atlas-preview"]');
    if (!item || !canvas) return;
    const scale = Math.min(1, MAX_PREVIEW_WIDTH / item.image.naturalWidth);
    canvas.width = Math.round(item.image.naturalWidth * scale);
    canvas.height = Math.round(item.image.naturalHeight * scale);
    canvas.dataset.scale = scale;
    this._drawPreview();

    canvas.onpointerdown = (e) => {
      if (!this.manualMode) return;
      const rect = canvas.getBoundingClientRect();
      this.dragStart = { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
    };
    canvas.onpointermove = (e) => {
      if (!this.manualMode || !this.dragStart) return;
      const rect = canvas.getBoundingClientRect();
      const cur = { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
      this._drawPreview(this._rectFrom(this.dragStart, cur));
    };
    canvas.onpointerup = (e) => {
      if (!this.manualMode || !this.dragStart) return;
      const rect = canvas.getBoundingClientRect();
      const cur = { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
      const r = this._rectFrom(this.dragStart, cur);
      this.dragStart = null;
      if (r.w > 2 && r.h > 2) { this.manualRegions.push(r); this._renderActiveAtlas(); }
      else this._drawPreview();
    };
  }

  _rectFrom(a, b) {
    return { x: Math.round(Math.min(a.x, b.x)), y: Math.round(Math.min(a.y, b.y)), w: Math.round(Math.abs(b.x - a.x)), h: Math.round(Math.abs(b.y - a.y)) };
  }

  _drawPreview(liveRect) {
    const item = this.activeItem;
    const canvas = this.root.querySelector('[data-role="atlas-preview"]');
    if (!item || !canvas) return;
    const scale = parseFloat(canvas.dataset.scale);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(item.image, 0, 0, canvas.width, canvas.height);
    if (!this.manualMode) {
      ctx.strokeStyle = "rgba(232,162,61,0.35)";
      ctx.lineWidth = 1;
      const cw = item.cellW * scale, ch = item.cellH * scale;
      for (let x = 0; x <= canvas.width; x += cw) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, canvas.height); ctx.stroke(); }
      for (let y = 0; y <= canvas.height; y += ch) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(canvas.width, y + 0.5); ctx.stroke(); }
    } else {
      ctx.strokeStyle = "#E8A23D";
      ctx.lineWidth = 2;
      this.manualRegions.forEach((r) => ctx.strokeRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale));
      if (liveRect) { ctx.strokeStyle = "#6FA96B"; ctx.strokeRect(liveRect.x * scale, liveRect.y * scale, liveRect.w * scale, liveRect.h * scale); }
    }
  }

  // ------------------------------------------------------------ slicing

  _nextIndexForCategory(category, alreadyAddedThisBatch) {
    const existing = Object.values(this.store.state.assets).filter((a) => a.category === category).length;
    return existing + alreadyAddedThisBatch + 1;
  }

  _buildAssetRecord(cellCanvas, { category, sourceAtlas, gridX, gridY, indexInCategory }) {
    const label = categoryLabel(category);
    const w = cellCanvas.width, h = cellCanvas.height;
    return {
      id: `${category}_${String(indexInCategory).padStart(3, "0")}_${uid().slice(-4)}`,
      name: `${label} ${indexInCategory}`,
      category, sourceAtlas,
      gridX, gridY, width: w, height: h,
      anchor: { x: Math.round(w / 2), y: Math.round(h / 4) },
      zIndex: defaultZIndex(category),
      compatibleWith: [],
      colorRegions: [{ x: 0, y: 0, w, h }],
      edited: false, editHistory: [],
      originalDataURL: canvasToDataURL(cellCanvas),
      currentDataURL: canvasToDataURL(cellCanvas),
    };
  }

  _isCellEmpty(ctx, x, y, w, h) {
    const data = ctx.getImageData(x, y, w, h).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
    return true;
  }

  async _autoSliceItem(item, opts = {}) {
    const skipTransparent = opts.skipTransparent ?? this.skipTransparent;
    const src = document.createElement("canvas");
    src.width = item.image.naturalWidth; src.height = item.image.naturalHeight;
    const sctx = src.getContext("2d");
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(item.image, 0, 0);

    const cols = Math.floor(src.width / item.cellW);
    const rows = Math.floor(src.height / item.cellH);
    const newRecords = {};
    let addedCount = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * item.cellW, y = row * item.cellH;
        if (skipTransparent && this._isCellEmpty(sctx, x, y, item.cellW, item.cellH)) continue;
        const cell = document.createElement("canvas");
        cell.width = item.cellW; cell.height = item.cellH;
        const cctx = cell.getContext("2d");
        cctx.imageSmoothingEnabled = false;
        cctx.drawImage(src, x, y, item.cellW, item.cellH, 0, 0, item.cellW, item.cellH);
        addedCount += 1;
        const record = this._buildAssetRecord(cell, {
          category: item.category, sourceAtlas: item.filename,
          gridX: col, gridY: row,
          indexInCategory: this._nextIndexForCategory(item.category, addedCount - 1),
        });
        newRecords[record.id] = record;
      }
    }
    this.store.state.assets = { ...this.store.state.assets, ...newRecords };
    await this.database.saveAssets(Object.values(newRecords));
    return Object.keys(newRecords).length;
  }

  async _sliceManualRegions(item) {
    const src = document.createElement("canvas");
    src.width = item.image.naturalWidth; src.height = item.image.naturalHeight;
    const sctx = src.getContext("2d");
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(item.image, 0, 0);

    const newRecords = {};
    this.manualRegions.forEach((r, i) => {
      const cell = document.createElement("canvas");
      cell.width = r.w; cell.height = r.h;
      const cctx = cell.getContext("2d");
      cctx.imageSmoothingEnabled = false;
      cctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      const record = this._buildAssetRecord(cell, {
        category: item.category, sourceAtlas: item.filename,
        gridX: r.x, gridY: r.y,
        indexInCategory: this._nextIndexForCategory(item.category, i),
      });
      newRecords[record.id] = record;
    });
    this.store.state.assets = { ...this.store.state.assets, ...newRecords };
    await this.database.saveAssets(Object.values(newRecords));
    this.manualRegions = [];
    return Object.keys(newRecords).length;
  }

  // ------------------------------------------------------------ events

  async _onRootClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "select-queue") {
      this.activeQueueId = btn.dataset.id;
      this.manualRegions = []; this.manualMode = false;
      this._renderQueue(); this._renderActiveAtlas();
    } else if (action === "toggle-manual") {
      this.manualMode = !this.manualMode;
      this._renderActiveAtlas();
    } else if (action === "auto-slice") {
      const item = this.activeItem;
      if (!item) { this.store.setStatus(i18n.t("messages.selectAtlasFirst"), "warn"); return; }
      const count = await this._autoSliceItem(item);
      this.store.setStatus(`${count} ${i18n.t("messages.slicedCount")}`, "success");
    } else if (action === "slice-manual") {
      const item = this.activeItem;
      if (!item) return;
      const count = await this._sliceManualRegions(item);
      this.store.setStatus(`${count} ${i18n.t("messages.slicedCount")}`, "success");
      this._renderActiveAtlas();
    } else if (action === "slice-all") {
      let total = 0;
      for (const q of this.queue) total += await this._autoSliceItem(q, { skipTransparent: this.skipTransparent });
      this.store.setStatus(`${total} ${i18n.t("messages.slicedCount")}`, "success");
    } else if (action === "open-editor") {
      this._openEditor(btn.dataset.id);
    } else if (action === "delete-asset") {
      if (!confirm(i18n.t("messages.confirmDeleteAsset"))) return;
      const copy = { ...this.store.state.assets };
      delete copy[btn.dataset.id];
      this.store.state.assets = copy;
      await this.database.deleteAsset(btn.dataset.id);
    } else if (action === "editor-tool") {
      if (this.editing) { this.editing.tool = btn.dataset.tool; this._renderEditorToolbar(); }
    } else if (action === "editor-flip-x") {
      this._editorApplyCanvasOp((c) => flipCanvas(c, "x"), "flip_x");
    } else if (action === "editor-flip-y") {
      this._editorApplyCanvasOp((c) => flipCanvas(c, "y"), "flip_y");
    } else if (action === "editor-rotate") {
      this._editorApplyCanvasOp((c) => rotateCanvas90(c), "rotate_90");
    } else if (action === "editor-palette-lock") {
      this._editorApplyInPlace((c) => applyPaletteLock(c, EXAMPLE_PALETTE), "palette_lock");
    } else if (action === "editor-reset") {
      this._editorReset();
    } else if (action === "editor-close") {
      this._closeEditor();
    } else if (action === "editor-set-anchor") {
      if (this.editing) { this.editing.settingAnchor = !this.editing.settingAnchor; this._renderEditorToolbar(); }
    }
  }

  _onRootChange(e) {
    const el = e.target;
    if (el.dataset.role === "atlas-category" && this.activeItem) {
      this.activeItem.category = el.value;
    } else if (el.dataset.role === "cell-w" && this.activeItem) {
      this.activeItem.cellW = Math.max(1, parseInt(el.value, 10) || 16);
      this._drawPreview();
    } else if (el.dataset.role === "cell-h" && this.activeItem) {
      this.activeItem.cellH = Math.max(1, parseInt(el.value, 10) || 16);
      this._drawPreview();
    } else if (el.dataset.role === "skip-transparent") {
      this.skipTransparent = el.checked;
    } else if (el.dataset.role === "gallery-filter") {
      this.galleryFilter = el.value;
      this._renderGallery();
    } else if (el.dataset.role === "editor-name" && this.editing) {
      this._updateAssetField(this.editing.assetId, { name: el.value });
    } else if (el.dataset.role === "editor-category" && this.editing) {
      this._updateAssetField(this.editing.assetId, { category: el.value, zIndex: defaultZIndex(el.value) });
      this._renderEditorMeta();
    } else if (el.dataset.role === "editor-zindex" && this.editing) {
      this._updateAssetField(this.editing.assetId, { zIndex: parseInt(el.value, 10) || 0 });
    } else if (el.dataset.role === "editor-anchor-x" && this.editing) {
      const a = this.store.state.assets[this.editing.assetId].anchor;
      this._updateAssetField(this.editing.assetId, { anchor: { x: parseInt(el.value, 10) || 0, y: a.y } });
    } else if (el.dataset.role === "editor-anchor-y" && this.editing) {
      const a = this.store.state.assets[this.editing.assetId].anchor;
      this._updateAssetField(this.editing.assetId, { anchor: { x: a.x, y: parseInt(el.value, 10) || 0 } });
    } else if (el.dataset.role === "editor-compat" && this.editing) {
      const tags = el.value.split(",").map((s) => s.trim()).filter(Boolean);
      this._updateAssetField(this.editing.assetId, { compatibleWith: tags });
    } else if (el.dataset.role?.startsWith("editor-adjust-")) {
      this._editorLiveAdjust();
    }
  }

  // ------------------------------------------------------------ gallery

  _renderGallery() {
    const filterSelect = this.root?.querySelector('[data-role="gallery-filter"]');
    const grid = this.root?.querySelector('[data-role="gallery-grid"]');
    if (!grid) return;
    const assets = Object.values(this.store.state.assets);
    const cats = ["all", ...new Set(assets.map((a) => a.category))];
    if (filterSelect) {
      filterSelect.innerHTML = cats.map((c) => `<option value="${c}" ${c === this.galleryFilter ? "selected" : ""}>${c === "all" ? i18n.t("assets.allCategories") : categoryLabel(c)}</option>`).join("");
    }
    const filtered = this.galleryFilter === "all" ? assets : assets.filter((a) => a.category === this.galleryFilter);
    if (!filtered.length) {
      grid.innerHTML = `<p class="text-sm text-ink-muted">${i18n.t("assets.emptyGallery")}</p>`;
      return;
    }
    grid.innerHTML = filtered.map((a) => `
      <div class="ssf-thumb" data-action="open-editor" data-id="${a.id}" title="${a.name}">
        <div class="ssf-checkerboard">
          <img src="${a.currentDataURL}" class="pixelated" alt="${a.name}" />
        </div>
        <div class="ssf-thumb-label">${a.name}${a.edited ? " ●" : ""}</div>
        <button class="ssf-thumb-delete" data-action="delete-asset" data-id="${a.id}" data-i18n-title="common.delete" title="${i18n.t("common.delete")}">×</button>
      </div>
    `).join("");
  }

  // -------------------------------------------------------- mini editor

  _openEditor(assetId) {
    const asset = this.store.state.assets[assetId];
    if (!asset) return;
    const canvas = document.createElement("canvas");
    canvas.width = asset.width; canvas.height = asset.height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0); this._renderEditorCanvas(); };
    img.src = asset.currentDataURL;
    this.editing = { assetId, canvas, ctx, tool: "brush", brushColor: "#3d2b2a", brushSize: 1, settingAnchor: false, painting: false, adjust: { hue: 0, saturation: 0, brightness: 0, contrast: 0 } };
    this._renderEditorModal();
  }

  _closeEditor() {
    this.editing = null;
    window.onpointerup = null;
    const modal = this.root.querySelector('[data-role="editor-modal"]');
    if (modal) modal.innerHTML = "";
  }

  _updateAssetField(assetId, patch) {
    const current = this.store.state.assets[assetId];
    const updated = { ...current, ...patch };
    this.store.state.assets = { ...this.store.state.assets, [assetId]: updated };
    this.database.saveAsset(updated);
  }

  _commitEditorCanvas(historyLabel) {
    if (!this.editing) return;
    const asset = this.store.state.assets[this.editing.assetId];
    const dataUrl = canvasToDataURL(this.editing.canvas);
    const updated = { ...asset, currentDataURL: dataUrl, edited: true, editHistory: [...asset.editHistory, historyLabel] };
    this.store.state.assets = { ...this.store.state.assets, [this.editing.assetId]: updated };
    this.database.saveAsset(updated);
    this._renderEditorMeta();
  }

  _editorApplyCanvasOp(fn, label) {
    if (!this.editing) return;
    const out = fn(this.editing.canvas);
    this.editing.canvas = out;
    this.editing.ctx = out.getContext("2d");
    this.editing.ctx.imageSmoothingEnabled = false;
    this._commitEditorCanvas(label);
    this._renderEditorCanvas();
  }

  _editorApplyInPlace(fn, label) {
    if (!this.editing) return;
    fn(this.editing.canvas);
    this._commitEditorCanvas(label);
    this._renderEditorCanvas();
  }

  _editorLiveAdjust() {
    if (!this.editing || !this.root) return;
    const read = (role) => parseInt(this.root.querySelector(`[data-role="${role}"]`)?.value || "0", 10);
    this.editing.adjust = {
      hue: read("editor-adjust-hue"), saturation: read("editor-adjust-saturation"),
      brightness: read("editor-adjust-brightness"), contrast: read("editor-adjust-contrast"),
    };
    // Live preview is rebuilt from the asset's CURRENT (pre-slider) pixels each time,
    // so repeated slider drags don't compound. Commit happens on 'change' (pointer release).
    const asset = this.store.state.assets[this.editing.assetId];
    const img = new Image();
    img.onload = () => {
      const base = document.createElement("canvas");
      base.width = asset.width; base.height = asset.height;
      const bctx = base.getContext("2d");
      bctx.imageSmoothingEnabled = false;
      bctx.drawImage(img, 0, 0);
      applyColorAdjustments(base, this.editing.adjust);
      this.editing.canvas = base;
      this.editing.ctx = base.getContext("2d");
      this._renderEditorCanvas();
    };
    img.src = asset.currentDataURL;
  }

  _editorCommitAdjust() {
    if (!this.editing) return;
    const { hue, saturation, brightness, contrast } = this.editing.adjust;
    const parts = [];
    if (hue) parts.push(`hue_${hue > 0 ? "+" : ""}${hue}`);
    if (saturation) parts.push(`saturation_${saturation > 0 ? "+" : ""}${saturation}`);
    if (brightness) parts.push(`brightness_${brightness > 0 ? "+" : ""}${brightness}`);
    if (contrast) parts.push(`contrast_${contrast > 0 ? "+" : ""}${contrast}`);
    if (!parts.length) return;
    this._commitEditorCanvas(parts.join(","));
    this.editing.adjust = { hue: 0, saturation: 0, brightness: 0, contrast: 0 };
    ["hue", "saturation", "brightness", "contrast"].forEach((k) => {
      const input = this.root.querySelector(`[data-role="editor-adjust-${k}"]`);
      if (input) input.value = 0;
    });
  }

  _editorReset() {
    if (!this.editing) return;
    if (!confirm(i18n.t("messages.confirmResetAsset"))) return;
    const asset = this.store.state.assets[this.editing.assetId];
    const updated = { ...asset, currentDataURL: asset.originalDataURL, edited: false, editHistory: [] };
    this.store.state.assets = { ...this.store.state.assets, [this.editing.assetId]: updated };
    this.database.saveAsset(updated);
    const img = new Image();
    img.onload = () => {
      this.editing.canvas.width = asset.width; this.editing.canvas.height = asset.height;
      const ctx = this.editing.canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, this.editing.canvas.width, this.editing.canvas.height);
      ctx.drawImage(img, 0, 0);
      this._renderEditorCanvas();
      this._renderEditorMeta();
    };
    img.src = asset.originalDataURL;
  }

  _renderEditorModal() {
    const modal = this.root.querySelector('[data-role="editor-modal"]');
    modal.innerHTML = `
      <div class="ssf-modal-backdrop" data-action="editor-close">
        <div class="ssf-modal" data-role="editor-window">
          <div class="flex items-center justify-between mb-3">
            <h3 class="ssf-card-title mb-0">${i18n.t("assets.editAsset")}</h3>
            <button class="ssf-btn text-xs" data-action="editor-close">${i18n.t("common.close")}</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4">
            <div>
              <div class="ssf-checkerboard border border-line rounded inline-block" data-role="editor-canvas-wrap"></div>
              <div class="flex flex-wrap gap-1 mt-2" data-role="editor-toolbar"></div>
            </div>
            <div data-role="editor-meta" class="space-y-2 text-sm"></div>
          </div>
        </div>
      </div>
    `;
    modal.querySelector(".ssf-modal-backdrop").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) this._closeEditor();
    });
    this._renderEditorCanvas();
    this._renderEditorToolbar();
    this._renderEditorMeta();
  }

  _renderEditorCanvas() {
    if (!this.editing) return;
    const wrap = this.root.querySelector('[data-role="editor-canvas-wrap"]');
    if (!wrap) return;
    const zoom = Math.max(4, Math.min(16, Math.round(320 / this.editing.canvas.width)));
    let display = wrap.querySelector("canvas");
    if (!display) {
      display = document.createElement("canvas");
      display.className = "pixelated block cursor-crosshair";
      wrap.appendChild(display);
    }
    display.width = this.editing.canvas.width * zoom;
    display.height = this.editing.canvas.height * zoom;
    const dctx = display.getContext("2d");
    dctx.imageSmoothingEnabled = false;
    dctx.clearRect(0, 0, display.width, display.height);
    dctx.drawImage(this.editing.canvas, 0, 0, display.width, display.height);
    if (this.editing.settingAnchor) {
      const asset = this.store.state.assets[this.editing.assetId];
      dctx.strokeStyle = "#E8A23D"; dctx.lineWidth = 2;
      const ax = asset.anchor.x * zoom, ay = asset.anchor.y * zoom;
      dctx.beginPath(); dctx.moveTo(ax - 6, ay); dctx.lineTo(ax + 6, ay); dctx.moveTo(ax, ay - 6); dctx.lineTo(ax, ay + 6); dctx.stroke();
    }

    const toImgCoords = (e) => {
      const rect = display.getBoundingClientRect();
      return { x: Math.floor((e.clientX - rect.left) / zoom), y: Math.floor((e.clientY - rect.top) / zoom) };
    };
    display.onpointerdown = (e) => {
      const { x, y } = toImgCoords(e);
      if (this.editing.settingAnchor) {
        this._updateAssetField(this.editing.assetId, { anchor: { x, y } });
        this._renderEditorCanvas(); this._renderEditorMeta();
        return;
      }
      if (this.editing.tool === "fill") {
        const hex = this.editing.brushColor;
        const rgba = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
        floodFill(this.editing.canvas, x, y, rgba);
        this._commitEditorCanvas("fill");
        this._renderEditorCanvas();
        return;
      }
      this.editing.painting = true;
      this._paintAt(x, y);
    };
    display.onpointermove = (e) => { if (this.editing.painting) { const { x, y } = toImgCoords(e); this._paintAt(x, y); } };
    // Property-style assignment (not addEventListener) so this always replaces
    // the previous handler instead of piling up a new one on every repaint.
    window.onpointerup = () => {
      if (this.editing && this.editing.painting) {
        this.editing.painting = false;
        this._commitEditorCanvas(this.editing.tool === "eraser" ? "eraser_stroke" : "brush_stroke");
      }
    };
  }

  _paintAt(x, y) {
    const ctx = this.editing.ctx;
    if (this.editing.tool === "eraser") {
      ctx.clearRect(x, y, this.editing.brushSize, this.editing.brushSize);
    } else if (this.editing.tool === "brush") {
      ctx.fillStyle = this.editing.brushColor;
      ctx.fillRect(x, y, this.editing.brushSize, this.editing.brushSize);
    }
    this._renderEditorCanvas();
  }

  _renderEditorToolbar() {
    if (!this.editing) return;
    const bar = this.root.querySelector('[data-role="editor-toolbar"]');
    if (!bar) return;
    const tool = (name, icon, labelKey) => `<button data-action="editor-tool" data-tool="${name}" class="ssf-btn text-xs ${this.editing.tool === name ? "ssf-btn-primary" : ""}">${icon} ${i18n.t(labelKey)}</button>`;
    bar.innerHTML = `
      ${tool("brush", "✏️", "assets.brush")}
      ${tool("eraser", "🧹", "assets.eraser")}
      ${tool("fill", "🪣", "assets.fill")}
      <input type="color" data-role="brush-color" value="${this.editing.brushColor}" class="w-8 h-8 rounded border border-line bg-transparent" />
      <input type="range" min="1" max="4" data-role="brush-size" value="${this.editing.brushSize}" class="ssf-slider w-16" title="${i18n.t("assets.brushSize")}" />
      <button data-action="editor-flip-x" class="ssf-btn text-xs">${i18n.t("assets.flipX")}</button>
      <button data-action="editor-flip-y" class="ssf-btn text-xs">${i18n.t("assets.flipY")}</button>
      <button data-action="editor-rotate" class="ssf-btn text-xs">${i18n.t("assets.rotate")}</button>
      <button data-action="editor-palette-lock" class="ssf-btn text-xs">${i18n.t("layers.paletteLock")}</button>
      <button data-action="editor-set-anchor" class="ssf-btn text-xs ${this.editing.settingAnchor ? "ssf-btn-primary" : ""}">${i18n.t("assets.setAnchor")}</button>
      <button data-action="editor-reset" class="ssf-btn text-xs text-berry">${i18n.t("assets.resetOriginal")}</button>
      ${this.editing.settingAnchor ? `<p class="text-xs text-ink-muted w-full mt-1">${i18n.t("assets.setAnchorHint")}</p>` : ""}
    `;
    bar.querySelector('[data-role="brush-color"]').addEventListener("input", (e) => { this.editing.brushColor = e.target.value; });
    bar.querySelector('[data-role="brush-size"]').addEventListener("input", (e) => { this.editing.brushSize = parseInt(e.target.value, 10); });
  }

  _renderEditorMeta() {
    if (!this.editing) return;
    const meta = this.root.querySelector('[data-role="editor-meta"]');
    const asset = this.store.state.assets[this.editing.assetId];
    if (!meta || !asset) return;
    meta.innerHTML = `
      <div>
        <label class="ssf-label">${i18n.t("common.name")}</label>
        <input type="text" data-role="editor-name" value="${asset.name}" class="ssf-input w-full" />
      </div>
      <div>
        <label class="ssf-label">${i18n.t("assets.category")}</label>
        <select data-role="editor-category" class="ssf-select w-full">${categoryOptionsHTML(asset.category)}</select>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="ssf-label">${i18n.t("assets.anchor")} X</label><input type="number" data-role="editor-anchor-x" value="${asset.anchor.x}" class="ssf-input w-full" /></div>
        <div><label class="ssf-label">${i18n.t("assets.anchor")} Y</label><input type="number" data-role="editor-anchor-y" value="${asset.anchor.y}" class="ssf-input w-full" /></div>
      </div>
      <div>
        <label class="ssf-label">${i18n.t("assets.zIndex")}</label>
        <input type="number" data-role="editor-zindex" value="${asset.zIndex}" class="ssf-input w-full" />
      </div>
      <div>
        <label class="ssf-label">${i18n.t("assets.compatibleWith")}</label>
        <input type="text" data-role="editor-compat" value="${asset.compatibleWith.join(", ")}" class="ssf-input w-full" placeholder="hair_short, hair_long" />
      </div>
      <div class="border-t border-line pt-2 space-y-1">
        <div class="ssf-label mb-1">${i18n.t("layers.hue")}/${i18n.t("layers.saturation")}/${i18n.t("layers.brightness")}/${i18n.t("layers.contrast")}</div>
        ${["hue", "saturation", "brightness", "contrast"].map((k) => `
          <div class="flex items-center gap-2">
            <span class="w-20 text-xs text-ink-muted">${i18n.t(`layers.${k}`)}</span>
            <input type="range" min="-100" max="100" value="0" data-role="editor-adjust-${k}" class="ssf-slider flex-1" />
          </div>
        `).join("")}
      </div>
      <div class="text-xs text-ink-dim">
        <span>${asset.sourceAtlas ? `${i18n.t("assets.atlasSource")}: ${asset.sourceAtlas}` : ""}</span><br/>
        <span>${i18n.t("assets.editHistory")}: ${asset.editHistory.length ? asset.editHistory.join(", ") : i18n.t("assets.original")}</span>
      </div>
    `;
    ["hue", "saturation", "brightness", "contrast"].forEach((k) => {
      meta.querySelector(`[data-role="editor-adjust-${k}"]`).addEventListener("change", () => this._editorCommitAdjust());
    });
  }

  // ------------------------------------------------------------ picker

  openPicker(category, onSelect) {
    const modal = document.querySelector('[data-role="picker-modal"]');
    if (!modal) return;
    const assets = Object.values(this.store.state.assets).filter((a) => !category || a.category === category);
    modal.innerHTML = `
      <div class="ssf-modal-backdrop" data-action="close-picker">
        <div class="ssf-modal" data-role="picker-window">
          <div class="flex items-center justify-between mb-3">
            <h3 class="ssf-card-title mb-0">${i18n.t("assets.pickerTitle")}</h3>
            <button class="ssf-btn text-xs" data-action="close-picker">${i18n.t("common.close")}</button>
          </div>
          ${assets.length ? `<div class="ssf-gallery-grid">
            <div class="ssf-thumb" data-picker-select="">
              <div class="ssf-checkerboard flex items-center justify-center text-ink-dim text-xs" style="aspect-ratio:1">${i18n.t("common.none")}</div>
            </div>
            ${assets.map((a) => `
              <div class="ssf-thumb" data-picker-select="${a.id}">
                <div class="ssf-checkerboard"><img src="${a.currentDataURL}" class="pixelated" alt="${a.name}" /></div>
                <div class="ssf-thumb-label">${a.name}</div>
              </div>`).join("")}
          </div>` : `<p class="text-sm text-ink-muted">${i18n.t("assets.noMatches")}</p>`}
        </div>
      </div>
    `;
    modal.querySelector(".ssf-modal-backdrop").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) this._closePicker();
    });
    modal.querySelectorAll('[data-action="close-picker"]').forEach((elm) => {
      elm.addEventListener("click", () => this._closePicker());
    });
    modal.querySelectorAll("[data-picker-select]").forEach((elm) => {
      elm.addEventListener("click", () => {
        const id = elm.dataset.pickerSelect;
        onSelect(id || null);
        this._closePicker();
      });
    });
  }

  _closePicker() {
    const modal = document.querySelector('[data-role="picker-modal"]');
    if (modal) modal.innerHTML = "";
  }

  // ------------------------------------------------------------ helpers used by other modules

  getAsset(id) {
    return this.store.state.assets[id] || null;
  }

  getAssetsByCategory(category) {
    return Object.values(this.store.state.assets).filter((a) => a.category === category);
  }

  /** Saves an arbitrary canvas as a brand-new asset that inherits category/
   *  anchor/z-index from `sourceAsset` — used by e.g. the Object Editor's
   *  recolor tool to turn a hue/brightness tweak into its own gallery entry
   *  instead of overwriting the original. */
  async createDerivedAsset(sourceAsset, canvas, { nameSuffix = "Variant", historyLabel = "derived" } = {}) {
    const record = {
      id: `${sourceAsset.category}_${uid()}`,
      name: `${sourceAsset.name} (${nameSuffix})`,
      category: sourceAsset.category, sourceAtlas: sourceAsset.sourceAtlas,
      gridX: sourceAsset.gridX, gridY: sourceAsset.gridY, width: canvas.width, height: canvas.height,
      anchor: { ...sourceAsset.anchor }, zIndex: sourceAsset.zIndex,
      compatibleWith: [...sourceAsset.compatibleWith], colorRegions: [{ x: 0, y: 0, w: canvas.width, h: canvas.height }],
      edited: true, editHistory: [historyLabel],
      originalDataURL: canvasToDataURL(canvas), currentDataURL: canvasToDataURL(canvas),
    };
    this.store.state.assets = { ...this.store.state.assets, [record.id]: record };
    await this.database.saveAsset(record);
    return record;
  }

  getExportData() {
    const assets = Object.values(this.store.state.assets);
    return {
      folder: "assets",
      dataUrls: assets.map((a) => ({ name: a.id, dataUrl: a.currentDataURL })),
      json: [{ name: "assets_metadata", data: assets.map((a) => ({
        id: a.id, name: a.name, source_atlas: a.sourceAtlas, grid_x: a.gridX, grid_y: a.gridY,
        anchor: a.anchor, category: a.category, z_index: a.zIndex, compatible_with: a.compatibleWith,
        color_regions: a.colorRegions, edited: a.edited, edit_history: a.editHistory,
      })) }],
    };
  }
}
