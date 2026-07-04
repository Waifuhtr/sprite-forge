// canvasEngine.js — Multi-canvas compositing engine.
// Each layer lives in its own offscreen <canvas> (created but never attached
// to the DOM); the visible "stage" canvas only composites them together in
// z-index order with the requested blend mode. Editing one layer's color
// never touches any other layer's pixels, and re-compositing is cheap.

const BLEND_TO_COMPOSITE = {
  normal: "source-over",
  multiply: "multiply",
  overlay: "overlay",
  screen: "screen",
};

export class LayerCanvas {
  constructor(key, width, height) {
    this.key = key;
    this.canvas = document.createElement("canvas"); // intentionally never appended to the DOM
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.visible = true;
    this.opacity = 1;
    this.blendMode = "normal";
    this.zIndex = 0;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Replaces this layer's pixels with `sourceCanvasOrImage`, drawn at (offsetX, offsetY). */
  setContent(sourceCanvasOrImage, offsetX = 0, offsetY = 0) {
    this.clear();
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    if (sourceCanvasOrImage) {
      this.ctx.drawImage(sourceCanvasOrImage, Math.round(offsetX), Math.round(offsetY));
    }
  }
}

export class CompositeRenderer {
  constructor(stageCanvas, width, height) {
    this.stageCanvas = stageCanvas;
    this.width = width;
    this.height = height;
    this.stageCanvas.width = width;
    this.stageCanvas.height = height;
    this.ctx = this.stageCanvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.layers = new Map(); // key -> LayerCanvas
  }

  getOrCreateLayer(key) {
    if (!this.layers.has(key)) {
      this.layers.set(key, new LayerCanvas(key, this.width, this.height));
    }
    return this.layers.get(key);
  }

  removeLayer(key) {
    this.layers.delete(key);
  }

  render() {
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, this.width, this.height);
    const ordered = [...this.layers.values()]
      .filter((l) => l.visible && l.opacity > 0)
      .sort((a, b) => a.zIndex - b.zIndex);
    for (const layer of ordered) {
      this.ctx.globalAlpha = layer.opacity;
      this.ctx.globalCompositeOperation = BLEND_TO_COMPOSITE[layer.blendMode] || "source-over";
      this.ctx.drawImage(layer.canvas, 0, 0);
    }
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = "source-over";
  }

  /** Flattens the current composite into a brand-new canvas (for export /
   *  thumbnails / animation frames), independent of the live stage canvas. */
  snapshotCanvas() {
    const out = document.createElement("canvas");
    out.width = this.width;
    out.height = this.height;
    const ctx = out.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.stageCanvas, 0, 0);
    return out;
  }
}

/** Lazily loads & caches <img> elements keyed by their dataURL/src, since
 *  Image loading is async but canvas compositing needs to run synchronously
 *  on every state change. `get()` returns null if the image isn't ready yet;
 *  `onReady` fires once it is, so callers should just re-run their render
 *  pass from there (the next `get()` call for that src returns instantly). */
export class ImageCache {
  constructor(maxEntries = 400) {
    this._map = new Map();
    this.maxEntries = maxEntries;
  }

  get(src, onReady) {
    if (!src) return null;
    let entry = this._map.get(src);
    if (!entry) {
      const img = new Image();
      entry = { img, ready: false };
      this._map.set(src, entry);
      if (this._map.size > this.maxEntries) {
        const oldestKey = this._map.keys().next().value;
        if (oldestKey !== src) this._map.delete(oldestKey);
      }
      img.onload = () => { entry.ready = true; if (onReady) onReady(); };
      img.src = src;
    }
    return entry.ready ? entry.img : null;
  }
}

/** "Smart anchoring": given a shared reference anchor point and an asset's
 *  own anchor metadata, returns the (x, y) draw offset that lines the
 *  asset's anchor up with the reference point (e.g. a shirt's collar
 *  lining up with the body's shoulder point). */
export function resolveAnchorOffset(referenceAnchor, assetAnchor) {
  const ref = referenceAnchor || { x: 0, y: 0 };
  const own = assetAnchor || { x: 0, y: 0 };
  return { x: ref.x - own.x, y: ref.y - own.y };
}
