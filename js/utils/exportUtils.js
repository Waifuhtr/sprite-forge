// exportUtils.js — Turns in-memory canvases + JSON metadata into downloadable
// files. JSZip is loaded globally from a CDN <script> tag in index.html.

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadCanvasAsPNG(canvas, filename = "sprite.png") {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  downloadBlob(blob, filename);
}

/** Synchronously turns a base64 data URL into a Blob (no Image/canvas round
 *  trip needed) — used for asset records, which are persisted as dataURLs. */
export function dataURLToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

/**
 * sections: Array<{
 *   folder?: string,
 *   pngs?: Array<{name, canvas}>,        // live canvases, converted via toBlob
 *   dataUrls?: Array<{name, dataUrl}>,   // persisted dataURL strings
 *   json?: Array<{name, data}>,
 * }>
 * Builds one ZIP containing every section's PNGs + JSON metadata, each inside
 * its own `folder/` (or the zip root if no folder is given).
 */
export async function exportProjectAsZip(sections, zipFilename = "stardew-sprite-forge-export.zip") {
  if (typeof JSZip === "undefined") {
    throw new Error("JSZip CDN script failed to load — cannot export ZIP. Check your internet connection.");
  }
  const zip = new JSZip();
  for (const section of sections) {
    const target = section.folder ? zip.folder(section.folder) : zip;
    for (const png of section.pngs || []) {
      const blob = await new Promise((resolve) => png.canvas.toBlob(resolve, "image/png"));
      if (blob) target.file(`${png.name}.png`, blob);
    }
    for (const item of section.dataUrls || []) {
      target.file(`${item.name}.png`, dataURLToBlob(item.dataUrl));
    }
    for (const j of section.json || []) {
      target.file(`${j.name}.json`, JSON.stringify(j.data, null, 2));
    }
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipFilename);
}

/** Lays per-direction frame arrays (canvases, all the same size) out into one
 *  grid sprite sheet: rows = directions (in `directionsOrder`), cols = frame index. */
export function buildSpriteSheet(framesByDirection, directionsOrder, frameW, frameH) {
  const counts = directionsOrder.map((d) => (framesByDirection[d] || []).length);
  const maxFrames = Math.max(1, ...counts);
  const canvas = document.createElement("canvas");
  canvas.width = frameW * maxFrames;
  canvas.height = frameH * directionsOrder.length;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  directionsOrder.forEach((dir, row) => {
    (framesByDirection[dir] || []).forEach((frameCanvas, col) => {
      ctx.drawImage(frameCanvas, col * frameW, row * frameH, frameW, frameH);
    });
  });
  return canvas;
}
