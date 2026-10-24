import { seenKey, type FinaleStage } from '../config/chapters';
import { family, type AssetSlot } from '../config/family';
import type { FrameAsset, StoryFrame } from '../content';
import type { TripState } from '../state/tripStore';

/** Alte Familienfotos bekommen eine wärmere, filmische Darstellung (nur CSS, Dateien bleiben unverändert). */
export const ARCHIVAL_SLOTS: ReadonlySet<AssetSlot> = new Set(['gradskiKlub', 'wedding', 'familyEarly']);

/** Welches heutige Foto steht für „ihr seid Milica und Miloš“? parentsNow → Dinner → Frühstück. */
export function resolveTodaySource(
  state: Pick<TripState, 'photos'>,
  hasAsset: (slot: AssetSlot) => boolean,
): { kind: 'asset'; slot: AssetSlot } | { kind: 'photo'; chapterId: 'dinner' | 'morning' } | null {
  if (hasAsset('parentsNow')) return { kind: 'asset', slot: 'parentsNow' };
  if (state.photos.dinner) return { kind: 'photo', chapterId: 'dinner' };
  if (state.photos.morning) return { kind: 'photo', chapterId: 'morning' };
  return null;
}

export function isFrameAssetAvailable(
  asset: FrameAsset,
  state: Pick<TripState, 'photos'>,
  hasAsset: (slot: AssetSlot) => boolean,
): boolean {
  return asset === 'parentsToday' ? resolveTodaySource(state, hasAsset) !== null : hasAsset(asset);
}

/**
 * Entfernt Frames, die nur aus einem fehlenden Foto bestehen. Fehlt bei einem Frame mit Text das Foto,
 * bleibt der Text – nie ein leerer Bilderrahmen.
 */
export function visibleFrames(
  frames: StoryFrame[],
  state: Pick<TripState, 'photos'>,
  hasAsset: (slot: AssetSlot) => boolean,
): StoryFrame[] {
  return frames
    .map((frame) =>
      frame.asset && !isFrameAssetAvailable(frame.asset, state, hasAsset) ? { ...frame, asset: undefined } : frame,
    )
    .filter((frame) => frame.signature || frame.lines.length > 0 || frame.asset || frame.small);
}

/** Gibt es überhaupt Video oder Stimmen? Sonst wird die Station im Finale übersprungen. */
export function hasFamilyMedia(hasAsset: (slot: AssetSlot) => boolean): boolean {
  return hasAsset('familyVideo') || family.familyMessages.some((m) => hasAsset(m.slot));
}

/** Nächste Finale-Station: Brief → (Video & Stimmen, falls vorhanden) → Bonus → null (= „Ваш дан.“). */
export function nextFinaleStage(seen: readonly string[], mediaAvailable: boolean): FinaleStage | null {
  const has = (stage: FinaleStage) => seen.includes(seenKey.finale(stage));
  if (!has('more')) return 'more';
  if (!has('messages') && mediaAvailable) return 'messages';
  if (!has('bonus')) return 'bonus';
  return null;
}
