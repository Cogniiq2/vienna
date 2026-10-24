import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  rgb,
  setCharacterSpacing,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from 'pdf-lib';
import { CHAPTER_IDS, type ChapterId, type QuestionId } from '../config/chapters';
import { trip } from '../config/trip';
import type { Dictionary, Language } from '../content';
import { formatClock, toRoman } from '../lib/format';
import { cropForFrame } from '../lib/image';
import { clampLines, sanitizeForFont, wrapText } from './layout';

/**
 * Erzeugt das Erinnerungs-PDF komplett im Browser:
 * echtes Buchlayout (200 × 250 mm), eingebettete Schriften mit kyrillischen Glyphen (subsetted),
 * Fotos passend zugeschnitten. Keine Screenshots, kein Browser-Print.
 */

export interface MemoryPhoto {
  chapterId: ChapterId;
  blob: Blob;
  capturedAt: string;
}

export interface MemoryInput {
  lang: Language;
  t: Dictionary;
  photos: Partial<Record<ChapterId, MemoryPhoto>>;
  responses: Partial<Record<QuestionId, string>>;
  /** Chapters, die abgeschlossen wurden (auch ohne Foto). */
  completed: ChapterId[];
}

// --- Maße (pt) -----------------------------------------------------------------
const MM = 72 / 25.4;
const PAGE_W = 200 * MM;
const PAGE_H = 250 * MM;
const MARGIN_X = 50;
const MARGIN_TOP = 54;
const MARGIN_BOTTOM = 58;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
/** Zielauflösung der Fotos (Pixel pro pt) – ~250 dpi im Druck. */
const PX_PER_PT = 3.4;

// --- Farben --------------------------------------------------------------------
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const C = {
  paper: hex('#f7f4ee'),
  ink: hex('#171714'),
  ink2: hex('#34322d'),
  muted: hex('#6d685f'),
  accent: hex('#b39a72'),
  line: hex('#ddd6ca'),
  frame: hex('#e9e2d5'),
};

const HEART_PATH =
  'M12 19.5s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.2-7 9.6-7 9.6z';

interface Fonts {
  display: PDFFont; // Cormorant Garamond Light
  serif: PDFFont; // Cormorant Garamond Regular
  sans: PDFFont; // Manrope Regular
  sansMedium: PDFFont; // Manrope SemiBold (Eyebrows)
}

const FONT_FILES = {
  display: '/fonts/pdf/CormorantGaramond_300Light.ttf',
  serif: '/fonts/pdf/CormorantGaramond_400Regular.ttf',
  sans: '/fonts/pdf/Manrope_400Regular.ttf',
  sansMedium: '/fonts/pdf/Manrope_600SemiBold.ttf',
} as const;

const fontCache = new Map<string, Promise<ArrayBuffer>>();

function loadFont(url: string): Promise<ArrayBuffer> {
  let cached = fontCache.get(url);
  if (!cached) {
    cached = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`font ${url}: ${res.status}`);
      return res.arrayBuffer();
    });
    cached.catch(() => fontCache.delete(url));
    fontCache.set(url, cached);
  }
  return cached;
}

/** Schriften vorab laden (z. B. während das Finale eingeblendet wird). */
export async function preloadPdfAssets(): Promise<void> {
  await Promise.all(Object.values(FONT_FILES).map(loadFont));
}

// --- Text-Helfer ---------------------------------------------------------------

interface TextStyle {
  font: PDFFont;
  size: number;
  color?: RGB;
  /** Laufweite in pt (für Versal-Eyebrows) */
  tracking?: number;
  lineHeight?: number;
}

class Typesetter {
  private glyphs = new Map<PDFFont, Set<number>>();

  constructor(private readonly page: PDFPage) {}

  private clean(text: string, font: PDFFont): string {
    let set = this.glyphs.get(font);
    if (!set) {
      set = new Set(font.getCharacterSet());
      this.glyphs.set(font, set);
    }
    const glyphs = set;
    return sanitizeForFont(text, (cp) => glyphs.has(cp));
  }

  width(text: string, style: TextStyle): number {
    const clean = this.clean(text, style.font);
    const tracking = style.tracking ?? 0;
    return style.font.widthOfTextAtSize(clean, style.size) + tracking * Math.max(0, [...clean].length - 1);
  }

  lines(text: string, style: TextStyle, maxWidth: number, maxLines = Infinity): string[] {
    const measure = (s: string) => this.width(s, style);
    const wrapped = wrapText(this.clean(text, style.font), measure, maxWidth);
    return Number.isFinite(maxLines) ? clampLines(wrapped, maxLines, measure, maxWidth) : wrapped;
  }

  /** Zeichnet eine Zeile; y = Grundlinie (von unten). */
  line(text: string, x: number, y: number, style: TextStyle, align: 'left' | 'center' | 'right' = 'left') {
    const clean = this.clean(text, style.font);
    if (!clean) return;
    const w = this.width(clean, style);
    const dx = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
    const tracking = style.tracking ?? 0;
    if (tracking) this.page.pushOperators(setCharacterSpacing(tracking));
    this.page.drawText(clean, { x: x + dx, y, font: style.font, size: style.size, color: style.color ?? C.ink });
    if (tracking) this.page.pushOperators(setCharacterSpacing(0));
  }

  /**
   * Absatz ab `top` (Abstand von oben). Gibt die neue Oberkante unter dem Absatz zurück.
   */
  paragraph(
    text: string,
    top: number,
    style: TextStyle,
    opts: { x?: number; width?: number; align?: 'left' | 'center' | 'right'; maxLines?: number } = {},
  ): number {
    const x = opts.x ?? MARGIN_X;
    const width = opts.width ?? CONTENT_W;
    const lh = style.size * (style.lineHeight ?? 1.4);
    const lines = this.lines(text, style, width, opts.maxLines);
    const anchorX = opts.align === 'center' ? x + width / 2 : opts.align === 'right' ? x + width : x;
    lines.forEach((ln, i) => {
      const baseline = PAGE_H - top - style.size * 0.92 - i * lh;
      this.line(ln, anchorX, baseline, style, opts.align);
    });
    return top + (lines.length - 1) * lh + style.size * 1.15;
  }

  paragraphHeight(text: string, style: TextStyle, width = CONTENT_W, maxLines = Infinity): number {
    const lh = style.size * (style.lineHeight ?? 1.4);
    const n = this.lines(text, style, width, maxLines).length;
    return n === 0 ? 0 : (n - 1) * lh + style.size * 1.15;
  }
}

// --- Seiten-Bausteine ----------------------------------------------------------

function newPage(doc: PDFDocument): { page: PDFPage; ts: Typesetter } {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: C.paper });
  return { page, ts: new Typesetter(page) };
}

function rule(page: PDFPage, x: number, top: number, width: number, color = C.accent, thickness = 0.6) {
  page.drawLine({
    start: { x, y: PAGE_H - top },
    end: { x: x + width, y: PAGE_H - top },
    thickness,
    color,
  });
}

function heart(page: PDFPage, cx: number, top: number, size = 11) {
  const scale = size / 24;
  page.drawSvgPath(HEART_PATH, {
    x: cx - 12 * scale,
    y: PAGE_H - top + 2 * scale,
    scale,
    borderColor: C.accent,
    borderWidth: 0.8 / scale,
  });
}

function folio(ts: Typesetter, fonts: Fonts, t: Dictionary, pageNumber: number) {
  const style: TextStyle = { font: fonts.sans, size: 6.8, color: C.muted, tracking: 1.1 };
  const y = MARGIN_BOTTOM / 2 - 2;
  ts.line(t.pdf.colophon.toUpperCase(), MARGIN_X, y, style);
  ts.line(String(pageNumber), PAGE_W - MARGIN_X, y, style, 'right');
}

async function embedPhoto(
  doc: PDFDocument,
  photo: MemoryPhoto,
  widthPt: number,
  heightPt: number,
): Promise<PDFImage | null> {
  try {
    const bytes = await cropForFrame(photo.blob, widthPt / heightPt, Math.round(Math.max(widthPt, heightPt) * PX_PER_PT));
    return await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

function drawPhoto(page: PDFPage, image: PDFImage, x: number, top: number, w: number, h: number) {
  page.drawRectangle({ x, y: PAGE_H - top - h, width: w, height: h, color: C.frame });
  page.drawImage(image, { x, y: PAGE_H - top - h, width: w, height: h });
}

// --- Hauptfunktion -------------------------------------------------------------

export async function generateMemoryPdf(input: MemoryInput): Promise<Blob> {
  const { t, lang } = input;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const [display, serif, sans, sansMedium] = await Promise.all([
    loadFont(FONT_FILES.display),
    loadFont(FONT_FILES.serif),
    loadFont(FONT_FILES.sans),
    loadFont(FONT_FILES.sansMedium),
  ]);
  // Kein Subsetting: pdf-lib/fontkit beschädigt beim Subsetten zusammengesetzte Glyphen (Cormorant).
  // Die Schriften sind bereits auf Latein + Kyrillisch reduziert (~480 KB gesamt).
  const fonts: Fonts = {
    display: await doc.embedFont(display, { subset: false }),
    serif: await doc.embedFont(serif, { subset: false }),
    sans: await doc.embedFont(sans, { subset: false }),
    sansMedium: await doc.embedFont(sansMedium, { subset: false }),
  };

  const S = {
    eyebrow: { font: fonts.sansMedium, size: 7.2, color: C.muted, tracking: 1.7 } satisfies TextStyle,
    eyebrowAccent: { font: fonts.sansMedium, size: 7.2, color: hex('#7f6643'), tracking: 1.7 } satisfies TextStyle,
    title: { font: fonts.display, size: 34, color: C.ink, lineHeight: 1.05 } satisfies TextStyle,
    body: { font: fonts.serif, size: 13.5, color: C.ink2, lineHeight: 1.42 } satisfies TextStyle,
    quote: { font: fonts.serif, size: 15, color: C.ink, lineHeight: 1.38 } satisfies TextStyle,
    meta: { font: fonts.sans, size: 7.5, color: C.muted, tracking: 0.6 } satisfies TextStyle,
  };

  const children = trip.family.children.map((c) => c[lang]).filter(Boolean).join(' · ');
  let pageNo = 0;

  // ---------------------------------------------------------------------------
  // 1. Cover
  // ---------------------------------------------------------------------------
  {
    const { page, ts } = newPage(doc);
    pageNo++;
    const coverPhoto = CHAPTER_IDS.map((id) => input.photos[id]).find(Boolean);
    const photoH = 392;
    let image: PDFImage | null = null;
    if (coverPhoto) image = await embedPhoto(doc, coverPhoto, CONTENT_W, photoH);

    if (image) {
      drawPhoto(page, image, MARGIN_X, MARGIN_TOP, CONTENT_W, photoH);
      let top = MARGIN_TOP + photoH + 40;
      ts.line(t.pdf.coverDedication.toUpperCase(), MARGIN_X, PAGE_H - top - 7, S.eyebrowAccent);
      top += 22;
      top = ts.paragraph(t.pdf.coverTitle, top, { font: fonts.display, size: 66, color: C.ink, lineHeight: 1 });
      top += 6;
      top = ts.paragraph(t.pdf.coverDate, top, { font: fonts.serif, size: 17, color: C.ink2 });
      rule(page, MARGIN_X, top + 18, 34);
      ts.paragraph(t.pdf.coverSubline, top + 30, { font: fonts.sans, size: 9, color: C.muted, lineHeight: 1.5 });
    } else {
      const cx = PAGE_W / 2;
      let top = PAGE_H * 0.34;
      ts.line(t.pdf.coverDedication.toUpperCase(), cx, PAGE_H - top, S.eyebrowAccent, 'center');
      top += 26;
      top = ts.paragraph(t.pdf.coverTitle, top, { font: fonts.display, size: 92, color: C.ink, lineHeight: 1 }, { align: 'center' });
      top += 10;
      top = ts.paragraph(t.pdf.coverDate, top, { font: fonts.serif, size: 19, color: C.ink2 }, { align: 'center' });
      rule(page, cx - 17, top + 22, 34);
      ts.paragraph(t.pdf.coverSubline, top + 36, { font: fonts.sans, size: 9.5, color: C.muted }, { align: 'center' });
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Brief der Kinder
  // ---------------------------------------------------------------------------
  {
    const { page, ts } = newPage(doc);
    pageNo++;
    const x = MARGIN_X + 26;
    const width = CONTENT_W - 52;
    let top = 150;
    ts.line(t.pdf.letterEyebrow.toUpperCase(), x, PAGE_H - top, S.eyebrowAccent);
    rule(page, x, top + 18, 34);
    top += 52;
    top = ts.paragraph(t.pdf.letterSalutation, top, { font: fonts.display, size: 24, color: C.ink, lineHeight: 1.2 }, { x, width });
    top += 18;
    for (const p of t.pdf.letter) {
      top = ts.paragraph(p, top, { font: fonts.serif, size: 14.5, color: C.ink2, lineHeight: 1.5 }, { x, width });
      top += 12;
    }
    top += 14;
    top = ts.paragraph(t.pdf.letterSignoff, top, { font: fonts.display, size: 20, color: C.ink }, { x, width });
    if (children) top = ts.paragraph(children, top + 6, S.meta, { x, width });
    heart(page, x + 6, top + 18);
    folio(ts, fonts, t, pageNo);
  }

  // ---------------------------------------------------------------------------
  // 3. Kapitel
  // ---------------------------------------------------------------------------
  let photoSide = 0;
  for (const [index, id] of CHAPTER_IDS.entries()) {
    const photo = input.photos[id];
    if (!photo && !input.completed.includes(id)) continue;
    const { page, ts } = newPage(doc);
    pageNo++;
    const content = t.chapters[id];
    const eyebrow = `${t.pdf.chapterEyebrow(toRoman(index + 1))} · ${content.eyebrow}`.toUpperCase();
    const clock = photo ? formatClock(photo.capturedAt, trip.timeZone) : null;

    // Antworten
    const answers: Array<{ label: string; lines: string[] }> = [];
    if (id === 'tennis') {
      const mother = input.responses['tennis.winner.mother']?.trim();
      const father = input.responses['tennis.winner.father']?.trim();
      const rows = [
        mother ? `${trip.family.mother[lang]} — ${mother}` : null,
        father ? `${trip.family.father[lang]} — ${father}` : null,
      ].filter((r): r is string => Boolean(r));
      if (rows.length) answers.push({ label: t.pdf.predictionTitle, lines: rows });
    }
    if (id === 'dinner') {
      const moment = input.responses['dinner.moment']?.trim();
      if (moment) answers.push({ label: t.pdf.momentTitle, lines: [`„${moment}“`] });
    }

    // Höhe des Textblocks berechnen, damit das Foto den Rest füllt.
    const titleH = ts.paragraphHeight(content.pdf.title, S.title, CONTENT_W, 2);
    const bodyH = ts.paragraphHeight(content.pdf.text, S.body, CONTENT_W, 4);
    let answersH = 0;
    for (const a of answers) {
      answersH += 26;
      for (const l of a.lines) answersH += ts.paragraphHeight(l, S.quote, CONTENT_W, 7) + 4;
    }
    const textH = 12 + 20 + titleH + 12 + bodyH + (answers.length ? 18 + answersH : 0);

    const drawText = (startTop: number) => {
      let top = startTop;
      ts.line(eyebrow, MARGIN_X, PAGE_H - top - 7, S.eyebrowAccent);
      if (clock) ts.line(t.pdf.capturedAt(clock), PAGE_W - MARGIN_X, PAGE_H - top - 7, S.meta, 'right');
      top += 22;
      top = ts.paragraph(content.pdf.title, top, S.title, { maxLines: 2 });
      top += 12;
      top = ts.paragraph(content.pdf.text, top, S.body, { maxLines: 4 });
      if (answers.length) {
        top += 18;
        for (const a of answers) {
          rule(page, MARGIN_X, top, 24);
          top += 12;
          ts.line(a.label.toUpperCase(), MARGIN_X, PAGE_H - top - 7, S.eyebrow);
          top += 14;
          for (const l of a.lines) top = ts.paragraph(l, top, S.quote, { maxLines: 7 }) + 4;
        }
      }
      return top;
    };

    const available = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM;
    const image = photo ? await embedPhotoForPage(doc, photo, available - textH - 30) : null;

    if (image) {
      const { img, h } = image;
      const photoFirst = photoSide++ % 2 === 0;
      if (photoFirst) {
        drawPhoto(page, img, MARGIN_X, MARGIN_TOP, CONTENT_W, h);
        drawText(MARGIN_TOP + h + 30);
      } else {
        const end = drawText(MARGIN_TOP + 6);
        drawPhoto(page, img, MARGIN_X, Math.max(end + 24, PAGE_H - MARGIN_BOTTOM - h), CONTENT_W, h);
      }
    } else {
      // Typografische Seite (Kapitel ohne Foto)
      const startTop = MARGIN_TOP + Math.max(60, (available - textH) / 2.4);
      rule(page, MARGIN_X, startTop - 28, 34);
      drawText(startTop);
    }
    folio(ts, fonts, t, pageNo);
  }

  // ---------------------------------------------------------------------------
  // 4. Abschluss
  // ---------------------------------------------------------------------------
  {
    const { page, ts } = newPage(doc);
    pageNo++;
    const cx = PAGE_W / 2;
    const width = CONTENT_W - 60;
    const x = MARGIN_X + 30;
    const style: TextStyle = { font: fonts.display, size: 23, color: C.ink, lineHeight: 1.25 };
    const blockH =
      t.pdf.closing.reduce((sum, l) => sum + ts.paragraphHeight(l, style, width) + 18, 0) + 80;
    let top = Math.max(120, (PAGE_H - blockH) / 2 - 20);
    rule(page, cx - 17, top - 30, 34);
    for (const line of t.pdf.closing) {
      top = ts.paragraph(line, top, style, { x, width, align: 'center' }) + 18;
    }
    top += 16;
    top = ts.paragraph(t.pdf.closingSignature, top, { font: fonts.serif, size: 15, color: C.ink2 }, { x, width, align: 'center' });
    if (children) top = ts.paragraph(children, top + 6, S.meta, { x, width, align: 'center' });
    heart(page, cx, top + 20);
    ts.line(t.pdf.colophon.toUpperCase(), cx, MARGIN_BOTTOM / 2 - 2, { ...S.meta, size: 6.8, tracking: 1.1 }, 'center');
  }

  doc.setTitle(t.pdf.documentTitle);
  doc.setAuthor(t.pdf.closingSignature);
  doc.setSubject(t.pdf.coverSubline);
  doc.setCreator(t.pdf.coverDedication);
  doc.setProducer(t.pdf.coverDedication);
  doc.setLanguage(t.meta.htmlLang);
  doc.setCreationDate(new Date());

  const bytes = await doc.save({ useObjectStreams: true });
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

async function embedPhotoForPage(
  doc: PDFDocument,
  photo: MemoryPhoto,
  maxHeight: number,
): Promise<{ img: PDFImage; h: number } | null> {
  const h = Math.max(230, Math.min(430, maxHeight));
  const img = await embedPhoto(doc, photo, CONTENT_W, h);
  return img ? { img, h } : null;
}
