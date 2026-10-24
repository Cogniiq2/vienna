import { useEffect, useRef, useState } from 'react';
import type { ChapterDefinition } from '../config/chapters';
import { useLanguage } from '../i18n/context';
import { useOnline, usePhotoUrl } from '../lib/hooks';
import { ImageError, processPhoto, type ProcessedImage } from '../lib/image';
import { useTripState, useTripStore } from '../state/context';
import type { PhotoEntry } from '../state/tripStore';
import { CameraIcon, CheckIcon, ImageIcon } from './Icons';

type Step =
  | { kind: 'idle' }
  | { kind: 'processing' }
  | { kind: 'preview'; image: ProcessedImage; url: string }
  | { kind: 'saving'; url: string }
  | { kind: 'saved' };

type ErrorKey = 'invalidFile' | 'fileTooLarge' | 'processingFailed' | 'storageFull' | 'cameraUnavailable';

interface Props {
  chapter: ChapterDefinition;
  title: string;
  prompt: { title: string; text: string };
  savedText: string;
  /** current = Teil des Ablaufs, review = bereits abgeschlossenes Kapitel ansehen */
  mode: 'current' | 'review';
  onSaved?: () => void;
}

function errorKeyFor(error: unknown): ErrorKey {
  if (error instanceof ImageError) {
    if (error.code === 'invalid-file') return 'invalidFile';
    if (error.code === 'too-large') return 'fileTooLarge';
    return 'processingFailed';
  }
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'storageFull';
  return 'processingFailed';
}

export function SyncStatus({ entry }: { entry: PhotoEntry }) {
  const { t } = useLanguage();
  const online = useOnline();
  const { connection } = useTripState();
  let text: string;
  let tone: 'ok' | 'wait' = 'ok';
  if (entry.status === 'synced' || entry.status === 'remote') text = t.photo.synced;
  else if (entry.status === 'local') text = t.photo.localOnly;
  else {
    tone = 'wait';
    if (!online) text = t.photo.pending;
    else if (connection === 'unreachable') text = t.errors.uploadFailed;
    else text = t.common.syncing;
  }
  return (
    <p className="sync-status small-text" data-tone={tone} role="status" aria-live="polite">
      <span className="sync-status__dot" aria-hidden="true" />
      {text}
    </p>
  );
}

export function PhotoCapture({ chapter, title, prompt, savedText, mode, onSaved }: Props) {
  const { t } = useLanguage();
  const store = useTripStore();
  const { photos } = useTripState();
  const entry = photos[chapter.id];
  const saved = usePhotoUrl(store, chapter.id, entry);

  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [error, setError] = useState<ErrorKey | null>(null);
  const [showPrivacy] = useState(() => !store.getFlag('privacy'));
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const previewUrl = step.kind === 'preview' || step.kind === 'saving' ? step.url : null;

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Kamera abgebrochen / nicht verfügbar → sanfter Hinweis auf die Galerie.
  useEffect(() => {
    const input = cameraRef.current;
    if (!input) return;
    const onCancel = () => setError('cameraUnavailable');
    input.addEventListener('cancel', onCancel);
    return () => input.removeEventListener('cancel', onCancel);
  }, []);

  const open = (which: 'camera' | 'gallery') => {
    setError(null);
    const input = which === 'camera' ? cameraRef.current : galleryRef.current;
    try {
      input?.click();
    } catch {
      setError('cameraUnavailable');
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setStep({ kind: 'processing' });
    try {
      const image = await processPhoto(file);
      setStep({ kind: 'preview', image, url: URL.createObjectURL(image.blob) });
    } catch (e) {
      setError(errorKeyFor(e));
      setStep({ kind: 'idle' });
    }
  };

  const confirmPhoto = async () => {
    if (step.kind !== 'preview') return;
    const { image, url } = step;
    setStep({ kind: 'saving', url });
    try {
      await store.savePhoto(chapter.id, image);
      store.setFlag('privacy');
      setStep({ kind: 'saved' });
      onSaved?.();
    } catch (e) {
      setError(errorKeyFor(e));
      setStep({ kind: 'preview', image, url });
    }
  };

  const inputs = (
    <>
      <input
        ref={cameraRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        capture={chapter.capture}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void handleFile(file);
        }}
      />
      <input
        ref={galleryRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void handleFile(file);
        }}
      />
    </>
  );

  const errorMessage = error && (
    <p className="photo__error small-text" role="alert">
      {t.errors[error]}
    </p>
  );

  // --- Vorschau / Speichern --------------------------------------------------
  if (step.kind === 'preview' || step.kind === 'saving') {
    const busy = step.kind === 'saving';
    return (
      <section className="photo" aria-label={t.photo.heading}>
        {inputs}
        <figure className="photo__frame reveal-fade">
          <img src={step.url} alt={t.photo.previewAlt(title)} />
        </figure>
        {errorMessage}
        <div className="photo__actions">
          <button type="button" className="btn btn--primary btn--large" onClick={() => void confirmPhoto()} disabled={busy}>
            {busy ? t.photo.saving : t.photo.use}
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => open('camera')} disabled={busy}>
            {t.photo.retake}
          </button>
        </div>
      </section>
    );
  }

  // --- Gerade gespeichert (Abschlussmoment) ----------------------------------
  if (step.kind === 'saved' && mode === 'current') {
    return (
      <section className="photo" aria-label={t.photo.heading}>
        {saved.url && (
          <figure className="photo__frame">
            <img src={saved.url} alt={t.photo.savedAlt(title)} />
          </figure>
        )}
        <div className="saved-moment" role="status" aria-live="polite">
          <span className="saved-moment__check" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="48" height="48">
              <circle cx="24" cy="24" r="22" />
              <path d="M15 24.5l6.2 6.2L33.5 18" />
            </svg>
          </span>
          <p className="serif-quote">{savedText}</p>
        </div>
      </section>
    );
  }

  // --- Vorhandenes Foto -------------------------------------------------------
  if (entry) {
    return (
      <section className="photo" aria-label={t.photo.heading}>
        {inputs}
        <figure className="photo__frame" data-loading={saved.loading ? 'true' : undefined}>
          {saved.url ? (
            <img src={saved.url} alt={t.photo.savedAlt(title)} />
          ) : (
            <figcaption className="photo__placeholder small-text">{saved.loading ? t.photo.loading : t.photo.synced}</figcaption>
          )}
        </figure>
        <SyncStatus entry={entry} />
        {errorMessage}
        {step.kind === 'processing' ? (
          <p className="small-text" role="status">
            {t.photo.preparing}
          </p>
        ) : (
          <button type="button" className="text-link" onClick={() => open('camera')}>
            {t.photo.replace}
          </button>
        )}
      </section>
    );
  }

  // --- Noch kein Foto ----------------------------------------------------------
  return (
    <section className="photo" aria-labelledby={`photo-${chapter.id}`}>
      {inputs}
      <div className="photo__prompt">
        <p className="eyebrow eyebrow--accent">
          {t.photo.heading}
          {!chapter.photoRequired && <span className="challenge__optional"> · {t.common.optional}</span>}
        </p>
        <h2 id={`photo-${chapter.id}`} className="serif-quote">
          {prompt.title}
        </h2>
        <p className="body-text">{prompt.text}</p>
      </div>

      <figure className="photo__frame photo__frame--empty" aria-hidden="true">
        <span className="photo__corner photo__corner--tl" />
        <span className="photo__corner photo__corner--br" />
        {step.kind === 'processing' ? <span className="loader-line" /> : <CameraIcon size={28} />}
      </figure>

      {errorMessage}
      {step.kind === 'processing' && (
        <p className="small-text photo__status" role="status">
          {t.photo.preparing}
        </p>
      )}

      <div className="photo__actions">
        <button
          type="button"
          className={`btn ${chapter.photoRequired ? 'btn--primary' : 'btn--secondary'} btn--large`}
          onClick={() => open('camera')}
          disabled={step.kind === 'processing'}
        >
          <CameraIcon size={19} />
          <span>{t.photo.capture}</span>
        </button>
        <button type="button" className="text-link" onClick={() => open('gallery')} disabled={step.kind === 'processing'}>
          <ImageIcon size={16} />
          <span>{t.photo.gallery}</span>
        </button>
      </div>

      {showPrivacy && (
        <p className="privacy-note small-text">
          <CheckIcon size={14} aria-hidden="true" />
          <span>{t.photo.privacy}</span>
        </p>
      )}
    </section>
  );
}
