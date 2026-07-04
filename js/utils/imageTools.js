// imageTools.js — Pixel-level manipulation shared by the character layer
// color controls and the in-asset mini editor. Everything here works on
// <canvas> / ImageData directly and never smooths pixels.

export function cloneCanvas(sourceCanvas) {
  const c = document.createElement("canvas");
  c.width = sourceCanvas.width;
  c.height = sourceCanvas.height;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, 0, 0);
  return c;
}

export function canvasFromImage(image) {
  const c = document.createElement("canvas");
  c.width = image.naturalWidth || image.width;
  c.height = image.naturalHeight || image.height;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  return c;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => loadImage(reader.result).then(resolve).catch(reject);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- Color adjustment ---------------------------------------------------

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r * 255, g * 255, b * 255];
}

function clamp255(v) {
  return Math.min(255, Math.max(0, Math.round(v)));
}

/** Applies hue (-180..180), saturation/brightness/contrast (-100..100) to a
 *  canvas in place. Alpha untouched. Fully transparent pixels are skipped. */
export function applyColorAdjustments(canvas, { hue = 0, saturation = 0, brightness = 0, contrast = 0 } = {}) {
  if (!hue && !saturation && !brightness && !contrast) return canvas;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    if (hue) h = (h + hue + 360) % 360;
    if (saturation) s = Math.min(100, Math.max(0, s + saturation));
    if (brightness) l = Math.min(100, Math.max(0, l + brightness / 2));
    let [r, g, b] = hslToRgb(h, s, l);
    if (contrast) {
      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (b - 128) + 128;
    }
    d[i] = clamp255(r);
    d[i + 1] = clamp255(g);
    d[i + 2] = clamp255(b);
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

function nearestPaletteColor(r, g, b, palette) {
  let best = palette[0], bestDist = Infinity;
  for (const [pr, pg, pb] of palette) {
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < bestDist) { bestDist = dist; best = [pr, pg, pb]; }
  }
  return best;
}

/** Snaps every opaque pixel to the closest color in `palette` ([r,g,b][]).
 *  Used by Palette Lock Mode. */
export function applyPaletteLock(canvas, palette) {
  if (!palette || !palette.length) return canvas;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const [nr, ng, nb] = nearestPaletteColor(d[i], d[i + 1], d[i + 2], palette);
    d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

// Curated example palette — warm, muted, low-saturation pixel-art tones in
// the spirit of a cozy farm-life aesthetic. This is an original palette for
// demonstrating Palette Lock Mode, NOT extracted from any game's files; swap
// in your own extracted palette for exact per-game accuracy.
export const EXAMPLE_PALETTE = [
  [30, 24, 24], [61, 43, 42], [98, 65, 57], [148, 105, 73], [206, 158, 110],
  [237, 205, 148], [250, 235, 200], [41, 54, 45], [66, 89, 58], [100, 130, 76],
  [147, 172, 90], [199, 207, 130], [46, 61, 74], [66, 99, 116], [113, 151, 158],
  [163, 201, 168], [122, 53, 60], [176, 84, 84], [212, 133, 106], [96, 68, 105],
  [140, 105, 148], [186, 152, 176], [56, 43, 79], [40, 40, 56], [230, 220, 199],
];

// --- Pixel tools: brush / eraser / fill / flip / rotate -----------------

export function paintPixel(ctx, x, y, color, size = 1) {
  ctx.fillStyle = color;
  const half = Math.floor(size / 2);
  ctx.fillRect(Math.round(x) - half, Math.round(y) - half, size, size);
}

export function erasePixel(ctx, x, y, size = 1) {
  const half = Math.floor(size / 2);
  ctx.clearRect(Math.round(x) - half, Math.round(y) - half, size, size);
}

/** Classic stack-based 4-directional flood fill on raw ImageData. */
export function floodFill(canvas, x, y, fillColorRgba) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;
  const idx = (px, py) => (py * width + px) * 4;
  const startIdx = idx(x, y);
  const target = [d[startIdx], d[startIdx + 1], d[startIdx + 2], d[startIdx + 3]];
  if (target.every((v, i) => v === fillColorRgba[i])) return;

  const matches = (i) =>
    d[i] === target[0] && d[i + 1] === target[1] && d[i + 2] === target[2] && d[i + 3] === target[3];
  const stack = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop();
    if (px < 0 || py < 0 || px >= width || py >= height) continue;
    const i = idx(px, py);
    if (!matches(i)) continue;
    d[i] = fillColorRgba[0]; d[i + 1] = fillColorRgba[1]; d[i + 2] = fillColorRgba[2]; d[i + 3] = fillColorRgba[3];
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  ctx.putImageData(imgData, 0, 0);
}

export function flipCanvas(canvas, axis = "x") {
  const out = document.createElement("canvas");
  out.width = canvas.width; out.height = canvas.height;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  if (axis === "x") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
  else { ctx.translate(0, canvas.height); ctx.scale(1, -1); }
  ctx.drawImage(canvas, 0, 0);
  return out;
}

export function rotateCanvas90(canvas) {
  const out = document.createElement("canvas");
  out.width = canvas.height; out.height = canvas.width;
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

export function canvasToDataURL(canvas) {
  return canvas.toDataURL("image/png");
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
