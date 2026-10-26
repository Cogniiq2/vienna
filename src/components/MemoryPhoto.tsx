import type { AssetSlot } from '../config/family';
import type { FrameAsset } from '../content';
import { useLanguage } from '../i18n/context';
import { ARCHIVAL_SLOTS, resolveTodaySource } from '../lib/frames';
import { useAssetUrl, usePhotoUrl } from '../lib/hooks';
import { useTripState, useTripStore } from '../state/context';

/** Bildunterschrift: im Admin gepflegt → Default aus family.ts → keine. */
function Caption({ slot }: { slot: AssetSlot }) {
  const { lang } = useLanguage();
  const store = useTripStore();
  useTripState(); // neu rendern, wenn Metadaten vom Server kommen
  const meta = store.getAssetMeta(slot, lang);
  const parts = [meta.caption, meta.location, meta.year].filter(Boolean);
  if (parts.length === 0) return null;
  return <figcaption className="memory-photo__caption hand">{parts.join(' · ')}</figcaption>;
}

function Frame({ url, loading, archival, alt, slot }: { url: string | null; loading: boolean; archival: boolean; alt: string; slot?: AssetSlot }) {
  if (!url && !loading) return null;
  return (
    <figure className="memory-photo" data-archival={archival ? 'true' : 'false'}>
      <div className="memory-photo__print" data-loading={loading ? 'true' : undefined}>
        {url && <img src={url} alt={alt} decoding="async" />}
      </div>
      {slot && <Caption slot={slot} />}
    </figure>
  );
}

function AssetFrame({ slot, alt }: { slot: AssetSlot; alt: string }) {
  const store = useTripStore();
  const { url, loading } = useAssetUrl(store, slot);
  return <Frame url={url} loading={loading} archival={ARCHIVAL_SLOTS.has(slot)} alt={alt} slot={slot} />;
}

function TodayFrame({ chapterId, alt }: { chapterId: 'dinner' | 'morning'; alt: string }) {
  const store = useTripStore();
  const { photos } = useTripState();
  const { url, loading } = usePhotoUrl(store, chapterId, photos[chapterId]);
  return <Frame url={url} loading={loading} archival={false} alt={alt} />;
}

/** Ein Foto für Erinnerungsseiten – alte Familienfotos warm & filmisch, heutige wie ein Abzug. */
export function MemoryPhoto({ asset, alt }: { asset: FrameAsset; alt: string }) {
  const store = useTripStore();
  const state = useTripState();
  if (asset !== 'parentsToday') return <AssetFrame slot={asset} alt={alt} />;
  const source = resolveTodaySource(state, (s) => store.hasAsset(s));
  if (!source) return null;
  return source.kind === 'asset' ? (
    <AssetFrame slot={source.slot} alt={alt} />
  ) : (
    <TodayFrame chapterId={source.chapterId} alt={alt} />
  );
}
