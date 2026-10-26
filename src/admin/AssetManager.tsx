import { useState } from 'react';
import { ASSET_SLOTS, slotKind, type AssetSlot } from '../config/family';
import { acceptFor } from './api';
import type { AdminApi, AdminAsset, AdminTrip, AssetMetaInput } from './types';

const SLOT_LABELS: Record<AssetSlot, { title: string; hint: string }> = {
  familyCurrent: { title: 'Aktuelles Familienfoto', hint: 'Mama, Tata, Đorđe, Bogdana und Lazar – erscheint dezent am Ende des Dienstags und im PDF.' },
  parentsCurrent: { title: 'Mama & Tata heute', hint: 'Für „ви сте Милица и Милош.“ – ohne dieses Foto wird das heutige Dinner-Foto genommen.' },
  gradskiKlub: { title: 'Gradski Klub', hint: 'Jung zusammen. Familiengeschichte & PDF.' },
  wedding: { title: 'Hochzeit', hint: 'Familiengeschichte & PDF.' },
  familyEarly: { title: 'Kinder klein / Urlaub', hint: 'Familiengeschichte & PDF.' },
  familyVideo: { title: 'Familienvideo', hint: 'mp4/mov. Größe ≤ Datei-Limit des Supabase-Projekts.' },
  videoPoster: { title: 'Video-Vorschaubild', hint: 'Optional. Standbild vor dem Abspielen.' },
  audioDjordje: { title: 'Sprachnachricht Đorđe', hint: 'm4a/mp3' },
  audioBogdana: { title: 'Sprachnachricht Bogdana', hint: 'm4a/mp3' },
  audioLazar: { title: 'Sprachnachricht Lazar', hint: 'm4a/mp3' },
};

function Preview({ asset, url, slot }: { asset: AdminAsset | undefined; url: string | undefined; slot: AssetSlot }) {
  if (!asset?.path) return <div className="asset__preview asset__preview--empty" aria-hidden="true" />;
  if (!url) return <div className="asset__preview" aria-label="Vorschau lädt" />;
  const kind = slotKind(slot);
  if (kind === 'audio') return <audio className="asset__audio" src={url} controls preload="none" />;
  if (kind === 'video') return <video className="asset__preview" src={url} controls preload="metadata" playsInline />;
  return <img className="asset__preview" src={url} alt={SLOT_LABELS[slot].title} loading="lazy" />;
}

function MetaForm({ asset, onSave }: { asset: AdminAsset | undefined; onSave: (meta: AssetMetaInput) => Promise<void> }) {
  const [meta, setMeta] = useState<AssetMetaInput>({
    captionSr: asset?.caption_sr ?? '',
    captionDe: asset?.caption_de ?? '',
    year: asset?.year ?? '',
    location: asset?.location ?? '',
    note: asset?.note ?? '',
  });
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const field = (key: keyof AssetMetaInput, label: string, max: number) => (
    <label>
      {label}
      <input
        type="text"
        maxLength={max}
        value={meta[key]}
        onChange={(e) => {
          setMeta({ ...meta, [key]: e.target.value });
          setState('idle');
        }}
      />
    </label>
  );
  return (
    <details className="asset__meta">
      <summary>Details (optional): Bildunterschrift, Jahr, Ort, Notiz</summary>
      <div className="asset__meta-grid">
        {field('captionSr', 'Bildunterschrift SR (kyrillisch)', 200)}
        {field('captionDe', 'Bildunterschrift DE', 200)}
        {field('year', 'Jahr', 20)}
        {field('location', 'Ort', 120)}
        {field('note', 'Notiz (nur intern)', 500)}
      </div>
      <button
        type="button"
        className="admin__btn"
        disabled={state === 'saving'}
        onClick={() => {
          setState('saving');
          onSave(meta).then(
            () => setState('saved'),
            () => setState('error'),
          );
        }}
      >
        {state === 'saving' ? 'speichert…' : state === 'saved' ? '✓ gespeichert' : 'Details speichern'}
      </button>
      {state === 'error' && <p className="admin__error">Speichern fehlgeschlagen.</p>}
    </details>
  );
}

/**
 * Familien-Assets: hochladen, ansehen/anhören, ersetzen, löschen, beschriften.
 * Alles landet privat im Bucket `vienna-memories` und erscheint ohne Code-Änderung in der App und im PDF.
 */
export function AssetManager({
  trip,
  api,
  urls,
  onChanged,
}: {
  trip: AdminTrip;
  api: AdminApi;
  urls: Record<string, string>;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<AssetSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assets = new Map((trip.assets ?? []).map((a) => [a.slot, a]));

  const run = async (slot: AssetSlot, action: () => Promise<void>) => {
    setBusy(slot);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(`${SLOT_LABELS[slot].title}: ${e instanceof Error ? e.message : 'fehlgeschlagen'}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="admin__card admin__assets-card">
      <h3>Familien-Assets</h3>
      <p className="admin__note">
        Privat im Bucket <code>vienna-memories</code>. Mama & Tata sehen nur, was hochgeladen ist – fehlende Slots bleiben
        für sie unsichtbar.
      </p>
      <ul className="asset-list">
        {ASSET_SLOTS.map((slot) => {
          const asset = assets.get(slot);
          const present = Boolean(asset?.path);
          const label = SLOT_LABELS[slot];
          return (
            <li key={slot} className="asset" data-present={present ? 'true' : 'false'}>
              <Preview asset={asset} url={asset?.path ? urls[asset.path] : undefined} slot={slot} />
              <div className="asset__body">
                <p className="asset__title">
                  {label.title} <small data-ok={present ? 'true' : 'false'}>{present ? '✓ vorhanden' : 'noch leer'}</small>
                </p>
                <p className="admin__note">{label.hint}</p>
                <div className="admin__asset-actions">
                  <label className="admin__btn admin__btn--primary">
                    {busy === slot ? 'lädt…' : present ? 'Ersetzen' : 'Hochladen'}
                    <input
                      type="file"
                      accept={acceptFor(slot)}
                      hidden
                      disabled={busy !== null}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void run(slot, () => api.uploadAsset(trip.trip_id, slot, file));
                      }}
                    />
                  </label>
                  {present && (
                    <button
                      type="button"
                      className="admin__btn"
                      disabled={busy !== null}
                      onClick={() => {
                        if (window.confirm(`„${label.title}“ wirklich löschen?`)) void run(slot, () => api.removeAsset(trip.trip_id, slot));
                      }}
                    >
                      Löschen
                    </button>
                  )}
                </div>
                <MetaForm
                  key={asset?.updated_at ?? 'new'}
                  asset={asset}
                  onSave={(meta) => api.updateAssetMeta(trip.trip_id, slot, meta).then(onChanged)}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="admin__error">{error}</p>}
    </div>
  );
}
