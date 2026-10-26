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
import { family } from '../config/family';
import { trip } from '../config/trip';
import { MOTIF, type Dictionary, type Language } from '../content';
import { formatClock, toRoman } from '../lib/format';
import { cropForFrame } from '../lib/image';
import { clampLines, sanitizeForFont, wrapText } from './layout';
import { planMemoryPages, type MemoryAssetSlot, type PagePlan } from './plan';

export type { MemoryAssetSlot } from './plan';

/**
 * Erzeugt das Erinnerungs-PDF komplett im Browser:
 * ein kleines Familien-Reisejournal (200 × 250 mm) mit eingebetteten Schriften (Kyrillisch),
 * Tagesfotos, alten Familienfotos und euren Antworten als große Zitate. Keine Screenshots.
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
  /** Familienfotos (alte Fotos, Familie heute). Fehlende werden ausgelassen. */
  assets: Partial<Record<MemoryAssetSlot, Blob>>;
  /** Bildunterschriften der Familienfotos (Admin → Default), bereits in der Zielsprache. */
  assetMeta: Partial<Record<MemoryAssetSlot, { caption: string | null; year: string | null; location: string | null }>>;
  /** Antworten in Anzeigeform (Auswahl bereits übersetzt). */
  answers: Partial<Record<QuestionId, string>>;
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
  hand: PDFFont; // Caveat (kleine handschriftliche Notizen)
}

const FONT_FILES = {
  display: '/fonts/pdf/CormorantGaramond_300Light.ttf',
  serif: '/fonts/pdf/CormorantGaramond_400Regular.ttf',
  sans: '/fonts/pdf/Manrope_400Regular.ttf',
  sansMedium: '/fonts/pdf/Manrope_600SemiBold.ttf',
  hand: '/fonts/pdf/Caveat_400Regular.ttf',
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

async function embedImage(
  doc: PDFDocument,
  blob: Blob,
  widthPt: number,
  heightPt: number,
  archival = false,
): Promise<PDFImage | null> {
  try {
    const { bytes } = await cropForFrame(blob, widthPt / heightPt, Math.round(Math.max(widthPt, heightPt) * PX_PER_PT), {
      archival,
    });
    return await doc.embedJpg(bytes);
  } catch {
    return null;
  }
}

/** Altes Foto mit Passepartout: ganzes Motiv (nicht beschnitten), weißer Rand, weicher Schatten. */
async function embedArchival(
  doc: PDFDocument,
  blob: Blob,
  maxW: number,
  maxH: number,
): Promise<{ img: PDFImage; w: number; h: number } | null> {
  try {
    const { bytes, width, height } = await cropForFrame(blob, 1, Math.round(Math.max(maxW, maxH) * PX_PER_PT), {
      archival: true,
      fit: 'contain',
    });
    const scale = Math.min(maxW / width, maxH / height);
    return { img: await doc.embedJpg(bytes), w: width * scale, h: height * scale };
  } catch {
    return null;
  }
}

function drawMatted(page: PDFPage, image: PDFImage, x: number, top: number, w: number, h: number) {
  const mat = 9;
  page.drawRectangle({ x: x - mat + 2, y: PAGE_H - top - h - mat - 3, width: w + mat * 2, height: h + mat * 2, color: hex('#e4ddd0') });
  page.drawRectangle({ x: x - mat, y: PAGE_H - top - h - mat, width: w + mat * 2, height: h + mat * 2, color: hex('#fdfcf9') });
  page.drawImage(image, { x, y: PAGE_H - top - h, width: w, height: h });
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

  const [display, serif, sans, sansMedium, hand] = await Promise.all([
    loadFont(FONT_FILES.display),
    loadFont(FONT_FILES.serif),
    loadFont(FONT_FILES.sans),
    loadFont(FONT_FILES.sansMedium),
    loadFont(FONT_FILES.hand),
  ]);
  // Kein Subsetting: pdf-lib/fontkit beschädigt beim Subsetten zusammengesetzte Glyphen (Cormorant).
  // Die Schriften sind bereits auf Latein + Kyrillisch reduziert.
  const fonts: Fonts = {
    display: await doc.embedFont(display, { subset: false }),
    serif: await doc.embedFont(serif, { subset: false }),
    sans: await doc.embedFont(sans, { subset: false }),
    sansMedium: await doc.embedFont(sansMedium, { subset: false }),
    // Caveat: kontextuelle Varianten (calt) erzeugen in pdf-lib fehlende Glyphen → abschalten.
    hand: await doc.embedFont(hand, { subset: false, features: { calt: false, liga: false, rclt: false } }),
  };

  const S = {
    eyebrow: { font: fonts.sansMedium, size: 7.2, color: C.muted, tracking: 1.7 } satisfies TextStyle,
    eyebrowAccent: { font: fonts.sansMedium, size: 7.2, color: hex('#7f6643'), tracking: 1.7 } satisfies TextStyle,
    title: { font: fonts.display, size: 34, color: C.ink, lineHeight: 1.05 } satisfies TextStyle,
    body: { font: fonts.serif, size: 13.5, color: C.ink2, lineHeight: 1.42 } satisfies TextStyle,
    letter: { font: fonts.serif, size: 14, color: C.ink2, lineHeight: 1.5 } satisfies TextStyle,
    quote: { font: fonts.display, size: 22, color: C.ink, lineHeight: 1.25 } satisfies TextStyle,
    small: { font: fonts.serif, size: 12.5, color: C.ink2, lineHeight: 1.4 } satisfies TextStyle,
    meta: { font: fonts.sans, size: 7.5, color: C.muted, tracking: 0.6 } satisfies TextStyle,
    hand: { font: fonts.hand, size: 15, color: hex('#5f5547'), lineHeight: 1.25 } satisfies TextStyle,
  };

  const parentsNames = `${family.parents.mother.name[lang]} & ${family.parents.father.name[lang]}`;
  const childrenNames = family.children.map((c) => c.name[lang]).join(' · ');
  const plan = planMemoryPages({
    photos: new Set(Object.keys(input.photos) as ChapterId[]),
    assets: new Set(Object.keys(input.assets) as MemoryAssetSlot[]),
    answers: input.answers,
    completed: input.completed,
  });

  let pageNo = 0;
  let photoSide = 0;

  const renderers: { [K in PagePlan['kind']]: (p: Extract<PagePlan, { kind: K }>) => Promise<void> | void } = {
    // -------------------------------------------------------------------------
    cover: async ({ photo }) => {
      const { page, ts } = newPage(doc);
      pageNo++;
      const photoH = 392;
      const source = photo ? input.photos[photo] : undefined;
      const image = source ? await embedImage(doc, source.blob, CONTENT_W, photoH) : null;
      if (image) {
        drawPhoto(page, image, MARGIN_X, MARGIN_TOP, CONTENT_W, photoH);
        let top = MARGIN_TOP + photoH + 34;
        top = ts.paragraph(t.pdf.coverTitle, top, { font: fonts.display, size: 66, color: C.ink, lineHeight: 1 });
        top += 4;
        top = ts.paragraph(t.pdf.coverDate, top, { font: fonts.serif, size: 17, color: C.ink2 });
        rule(page, MARGIN_X, top + 16, 34);
        ts.paragraph(parentsNames, top + 28, { ...S.hand, size: 20 });
      } else {
        const cx = PAGE_W / 2;
        let top = PAGE_H * 0.32;
        top = ts.paragraph(t.pdf.coverTitle, top, { font: fonts.display, size: 96, color: C.ink, lineHeight: 1 }, { align: 'center' });
        top += 10;
        top = ts.paragraph(t.pdf.coverDate, top, { font: fonts.serif, size: 19, color: C.ink2 }, { align: 'center' });
        rule(page, cx - 17, top + 22, 34);
        top = ts.paragraph(parentsNames, top + 38, { ...S.hand, size: 24 }, { align: 'center' });
        ts.paragraph(t.pdf.coverSubline, top + 14, { font: fonts.sans, size: 9.5, color: C.muted }, { align: 'center' });
      }
    },

    // -------------------------------------------------------------------------
    letter: () => {
      const { page, ts } = newPage(doc);
      pageNo++;
      const L = t.finale.letter;
      const x = MARGIN_X + 22;
      const width = CONTENT_W - 44;
      let top = 96;
      ts.line(t.pdf.letterEyebrow.toUpperCase(), x, PAGE_H - top, S.eyebrowAccent);
      rule(page, x, top + 16, 34);
      top += 44;
      top = ts.paragraph(L.salutation, top, { font: fonts.display, size: 24, color: C.ink, lineHeight: 1.2 }, { x, width });
      top += 12;
      for (const p of L.opening) top = ts.paragraph(p, top, S.letter, { x, width }) + 8;
      top = ts.paragraph(L.emphasis, top + 2, { font: fonts.display, size: 22, color: C.ink }, { x, width }) + 10;
      top = ts.paragraph(L.list.join('  ·  '), top, { ...S.letter, color: C.muted, size: 13 }, { x, width }) + 12;
      for (const p of L.after) top = ts.paragraph(p, top, S.letter, { x, width }) + 8;
      top = ts.paragraph(L.closing, top + 4, { font: fonts.display, size: 22, color: C.ink }, { x, width });
      top = ts.paragraph(t.pdf.closingSmall, top + 20, { ...S.hand, size: 20 }, { x, width });
      ts.paragraph(childrenNames, top + 2, { ...S.hand, size: 15 }, { x, width });
      folio(ts, fonts, t, pageNo);
    },

    // -------------------------------------------------------------------------
    memory: async ({ slot }) => {
      const blob = input.assets[slot];
      if (!blob) return;
      const frames = slot === 'gradskiKlub' ? t.interludes.gradskiKlub : slot === 'wedding' ? t.interludes.wedding : t.interludes.family;
      const text = frames.flatMap((f) => f.lines).join(' ');
      const small = frames.map((f) => f.small).find(Boolean) ?? null;
      const archival = await embedArchival(doc, blob, CONTENT_W - 40, 380);
      if (!archival) return;
      const { page, ts } = newPage(doc);
      pageNo++;
      ts.line(t.pdf.memoryEyebrow.toUpperCase(), MARGIN_X, PAGE_H - MARGIN_TOP - 7, S.eyebrowAccent);
      const x = (PAGE_W - archival.w) / 2;
      const photoTop = MARGIN_TOP + 40;
      drawMatted(page, archival.img, x, photoTop, archival.w, archival.h);
      let top = photoTop + archival.h + 22;
      const meta = input.assetMeta[slot];
      const caption = [meta?.caption, meta?.location, meta?.year].filter(Boolean).join(' · ');
      if (caption) top = ts.paragraph(caption, top, { ...S.hand, size: 14 }, { align: 'center' }) + 10;
      top = ts.paragraph(text, top + 10, { font: fonts.display, size: 24, color: C.ink, lineHeight: 1.22 }, { align: 'center', x: MARGIN_X + 20, width: CONTENT_W - 40 });
      if (small) ts.paragraph(small, top + 10, { ...S.small, color: C.muted }, { align: 'center', x: MARGIN_X + 20, width: CONTENT_W - 40 });
      folio(ts, fonts, t, pageNo);
    },

    // -------------------------------------------------------------------------
    story: () => {
      const { page, ts } = newPage(doc);
      pageNo++;
      const lines = t.interludes.work.map((f) => f.lines.join(' '));
      const style: TextStyle = { font: fonts.display, size: 20, color: C.ink, lineHeight: 1.28 };
      const x = MARGIN_X + 24;
      const width = CONTENT_W - 48;
      const blockH = lines.reduce((sum, l) => sum + ts.paragraphHeight(l, style, width) + 16, 0);
      let top = Math.max(MARGIN_TOP + 40, (PAGE_H - blockH) / 2 - 10);
      rule(page, x, top - 26, 34);
      lines.forEach((line, i) => {
        const last = i === lines.length - 1;
        top = ts.paragraph(line, top, last ? { ...style, size: 23 } : style, { x, width }) + 16;
      });
      folio(ts, fonts, t, pageNo);
    },

    // -------------------------------------------------------------------------
    chapter: async ({ id }) => {
      const index = CHAPTER_IDS.indexOf(id);
      const photo = input.photos[id];
      const content = t.chapters[id];
      const { page, ts } = newPage(doc);
      pageNo++;
      const eyebrow = `${t.pdf.chapterEyebrow(toRoman(index + 1))} · ${content.eyebrow}`.toUpperCase();
      const clock = photo ? formatClock(photo.capturedAt, trip.timeZone) : null;

      // Kleine Antworten, die zu diesem Kapitel gehören (große Zitate kommen später).
      const notes = chapterNotes(id, input.answers, t);

      const titleH = ts.paragraphHeight(content.pdf.title, S.title, CONTENT_W, 2);
      const bodyH = ts.paragraphHeight(content.pdf.text, S.body, CONTENT_W, 4);
      const notesH = notes.reduce((sum, n) => sum + 16 + ts.paragraphHeight(n.text, S.hand, CONTENT_W, 2) + 6, 0);
      const textH = 22 + titleH + 12 + bodyH + (notes.length ? 16 + notesH : 0);

      const drawText = (startTop: number) => {
        let top = startTop;
        ts.line(eyebrow, MARGIN_X, PAGE_H - top - 7, S.eyebrowAccent);
        if (clock) ts.line(t.pdf.capturedAt(clock), PAGE_W - MARGIN_X, PAGE_H - top - 7, S.meta, 'right');
        top += 22;
        top = ts.paragraph(content.pdf.title, top, S.title, { maxLines: 2 });
        top += 12;
        top = ts.paragraph(content.pdf.text, top, S.body, { maxLines: 4 });
        if (notes.length) {
          top += 16;
          for (const n of notes) {
            ts.line(n.label.toUpperCase(), MARGIN_X, PAGE_H - top - 7, S.eyebrow);
            top += 14;
            top = ts.paragraph(n.text, top, S.hand, { maxLines: 2 }) + 6;
          }
        }
        return top;
      };

      const available = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM;
      const h = Math.max(230, Math.min(430, available - textH - 30));
      const image = photo ? await embedImage(doc, photo.blob, CONTENT_W, h) : null;
      if (image) {
        if (photoSide++ % 2 === 0) {
          drawPhoto(page, image, MARGIN_X, MARGIN_TOP, CONTENT_W, h);
          drawText(MARGIN_TOP + h + 30);
        } else {
          const end = drawText(MARGIN_TOP + 6);
          drawPhoto(page, image, MARGIN_X, Math.max(end + 24, PAGE_H - MARGIN_BOTTOM - h), CONTENT_W, h);
        }
      } else {
        const startTop = MARGIN_TOP + Math.max(60, (available - textH) / 2.4);
        rule(page, MARGIN_X, startTop - 28, 34);
        drawText(startTop);
      }
      folio(ts, fonts, t, pageNo);
    },

    // -------------------------------------------------------------------------
    answers: ({ questions }) => {
      const { page, ts } = newPage(doc);
      pageNo++;
      let top = MARGIN_TOP + 20;
      ts.line(t.pdf.answersEyebrow.toUpperCase(), MARGIN_X, PAGE_H - top - 7, S.eyebrowAccent);
      top += 22;
      top = ts.paragraph(t.pdf.answersTitle, top, S.title) + 30;
      for (const q of questions) {
        const answer = input.answers[q];
        if (!answer) continue;
        rule(page, MARGIN_X, top, 24);
        top += 14;
        ts.line(t.questions[q].pdfLabel.toUpperCase(), MARGIN_X, PAGE_H - top - 7, S.eyebrow);
        top += 18;
        top = ts.paragraph(`„${answer}“`, top, S.quote, { maxLines: 7 }) + 30;
      }
      folio(ts, fonts, t, pageNo);
    },

    // -------------------------------------------------------------------------
    family: async () => {
      const blob = input.assets.familyCurrent;
      if (!blob) return;
      const image = await embedArchival(doc, blob, CONTENT_W, 400);
      if (!image) return;
      const { page, ts } = newPage(doc);
      pageNo++;
      const top = MARGIN_TOP + 50;
      drawMatted(page, image.img, (PAGE_W - image.w) / 2, top, image.w, image.h);
      const thanks = t.finale.closing.find((f) => f.asset === 'familyCurrent')?.lines.join(' ') ?? '';
      ts.paragraph(thanks, top + image.h + 40, { font: fonts.display, size: 26, color: C.ink }, { align: 'center' });
      folio(ts, fonts, t, pageNo);
    },

    // -------------------------------------------------------------------------
    closing: () => {
      const { page, ts } = newPage(doc);
      pageNo++;
      const cx = PAGE_W / 2;
      let top = PAGE_H * 0.4;
      top = ts.paragraph(MOTIF, top, { font: fonts.display, size: 46, color: C.ink, lineHeight: 1.1 }, { align: 'center' });
      rule(page, cx - 17, top + 30, 34);
      top = ts.paragraph(t.pdf.closingSmall, top + 52, { ...S.hand, size: 22 }, { align: 'center' });
      top = ts.paragraph(childrenNames, top + 4, { ...S.hand, size: 16 }, { align: 'center' });
      heart(page, cx, top + 22, 12);
      ts.line(t.pdf.colophon.toUpperCase(), cx, MARGIN_BOTTOM / 2 - 2, { ...S.meta, size: 6.8, tracking: 1.1 }, 'center');
    },
  };

  for (const p of plan) {
    // Eine fehlerhafte Seite (z. B. defektes Foto) darf nie das ganze Album verhindern.
    try {
      await (renderers[p.kind] as (page: PagePlan) => Promise<void> | void)(p);
    } catch {
      /* Seite überspringen */
    }
  }

  doc.setTitle(t.pdf.documentTitle);
  doc.setAuthor(childrenNames);
  doc.setSubject(t.pdf.coverSubline);
  doc.setCreator(t.pdf.closingSmall);
  doc.setProducer(t.pdf.closingSmall);
  doc.setLanguage(t.meta.htmlLang);
  doc.setCreationDate(new Date());

  const bytes = await doc.save({ useObjectStreams: true });
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** Kleine, persönliche Notizen auf den Kapitelseiten. */
function chapterNotes(id: ChapterId, answers: Partial<Record<QuestionId, string>>, t: Dictionary): Array<{ label: string; text: string }> {
  const byChapter: Partial<Record<ChapterId, QuestionId[]>> = {
    morning: ['morning.firstAwake'],
    tennis: ['tennis.mother.favorite', 'tennis.father.food'],
  };
  return (byChapter[id] ?? [])
    .map((q) => ({ label: t.questions[q].pdfLabel, text: answers[q]?.trim() ?? '' }))
    .filter((n) => n.text);
}
