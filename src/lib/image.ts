/**
 * Clientseitige Bildverarbeitung: Fotos werden vor dem Speichern auf max. 2000 px Kantenlänge
 * und JPEG ~86 % reduziert (typisch 350–700 KB) – genug Qualität für das PDF.
 */

export type ImageErrorCode = 'invalid-file' | 'too-large' | 'processing-failed';

export class ImageError extends Error {
  constructor(public readonly code: ImageErrorCode) {
    super(code);
    this.name = 'ImageError';
  }
}

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
}

export const MAX_INPUT_BYTES = 40 * 1024 * 1024;
export const MAX_EDGE = 2000;
export const JPEG_QUALITY = 0.86;

const IMAGE_EXTENSIONS = /\.(jpe?g|png|heic|heif|webp|gif|avif|bmp|tiff?)$/i;

export function isProbablyImage(file: Pick<File, 'type' | 'name'>): boolean {
  if (file.type) return file.type.startsWith('image/');
  return IMAGE_EXTENSIONS.test(file.name);
}

/** Skaliert (w, h) proportional, sodass die längere Kante <= maxEdge ist. Vergrößert nie. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Ausschnitt (object-fit: cover) für ein Zielseitenverhältnis (Breite / Höhe), leicht nach oben gewichtet für Porträts. */
export function coverCrop(
  srcWidth: number,
  srcHeight: number,
  targetAspect: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const srcAspect = srcWidth / srcHeight;
  if (srcAspect > targetAspect) {
    const sw = srcHeight * targetAspect;
    return { sx: (srcWidth - sw) / 2, sy: 0, sw, sh: srcHeight };
  }
  const sh = srcWidth / targetAspect;
  // Gesichter sitzen meist im oberen Drittel – Ausschnitt etwas nach oben verschieben.
  return { sx: 0, sy: (srcHeight - sh) * 0.38, sw: srcWidth, sh };
}

type Drawable = { source: CanvasImageSource; width: number; height: number; release: () => void };

/**
 * Dekodiert über <img>: respektiert die EXIF-Orientierung in allen aktuellen Browsern
 * (createImageBitmap ignorierte sie in älteren Safari-Versionen) und kann HEIC in Safari.
 * createImageBitmap dient nur als Fallback.
 */
async function decode(blob: Blob): Promise<Drawable> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty image');
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
  }
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      /* fällt durch */
    }
  }
  throw new ImageError('processing-failed');
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageError('processing-failed'))),
      'image/jpeg',
      quality,
    );
  });
}

function drawToCanvas(
  drawable: Drawable,
  width: number,
  height: number,
  crop?: { sx: number; sy: number; sw: number; sh: number },
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('processing-failed');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (crop) ctx.drawImage(drawable.source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  else ctx.drawImage(drawable.source, 0, 0, width, height);
  return canvas;
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  // iOS Safari hält Canvas-Speicher sonst lange fest.
  canvas.width = 0;
  canvas.height = 0;
}

export async function processPhoto(file: File): Promise<ProcessedImage> {
  if (!isProbablyImage(file)) throw new ImageError('invalid-file');
  if (file.size > MAX_INPUT_BYTES) throw new ImageError('too-large');
  if (file.size === 0) throw new ImageError('invalid-file');

  const drawable = await decode(file);
  try {
    if (!drawable.width || !drawable.height) throw new ImageError('processing-failed');
    const { width, height } = fitWithin(drawable.width, drawable.height, MAX_EDGE);
    const canvas = drawToCanvas(drawable, width, height);
    try {
      const blob = await canvasToBlob(canvas, JPEG_QUALITY);
      return { blob, width, height };
    } finally {
      releaseCanvas(canvas);
    }
  } catch (error) {
    if (error instanceof ImageError) throw error;
    throw new ImageError('processing-failed');
  } finally {
    drawable.release();
  }
}

/**
 * Schneidet ein Foto für einen PDF-Rahmen zu und liefert JPEG-Bytes.
 * `archival`: alte Familienfotos bekommen nur im Album eine leichte Wärme und Vignette
 * (die Originaldatei bleibt unverändert).
 */
export async function cropForFrame(
  blob: Blob,
  aspect: number,
  maxEdge: number,
  options: { archival?: boolean; fit?: 'cover' | 'contain' } = {},
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const drawable = await decode(blob);
  try {
    const crop =
      options.fit === 'contain'
        ? { sx: 0, sy: 0, sw: drawable.width, sh: drawable.height }
        : coverCrop(drawable.width, drawable.height, aspect);
    const target = fitWithin(crop.sw, crop.sh, maxEdge);
    const canvas = drawToCanvas(drawable, target.width, target.height, crop);
    try {
      if (options.archival) warmAndVignette(canvas);
      const out = await canvasToBlob(canvas, 0.9);
      return { bytes: new Uint8Array(await out.arrayBuffer()), width: target.width, height: target.height };
    } finally {
      releaseCanvas(canvas);
    }
  } finally {
    drawable.release();
  }
}

function warmAndVignette(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(232, 214, 186, 0.28)';
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.75);
  vignette.addColorStop(0, 'rgba(40, 30, 20, 0)');
  vignette.addColorStop(1, 'rgba(40, 30, 20, 0.22)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/** Debug: erzeugt ein ruhiges Platzhalter-Foto. */
export async function createPlaceholderPhoto(label: string, seed: number): Promise<ProcessedImage> {
  const width = 1500;
  const height = 2000;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('processing-failed');
  const palettes: Array<[string, string]> = [
    ['#d9cbb4', '#8c7a5f'],
    ['#c9c3b8', '#5f5a52'],
    ['#d6c2a5', '#7d6448'],
    ['#cfd0c8', '#6b6e66'],
    ['#e0d3c0', '#9b8160'],
    ['#c8b9a6', '#4c4239'],
  ];
  const [from, to] = palettes[seed % palettes.length] ?? palettes[0]!;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '300 120px "Cormorant Garamond", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, width / 2, height / 2);
  const blob = await canvasToBlob(canvas, 0.86);
  releaseCanvas(canvas);
  return { blob, width, height };
}
