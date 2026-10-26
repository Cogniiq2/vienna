import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { family, type ChildMessage } from '../config/family';
import { localize, useLanguage } from '../i18n/context';
import { useAssetUrl } from '../lib/hooks';
import { useTripStore } from '../state/context';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function Transcript({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <details className="transcript">
      <summary>{label}</summary>
      <p className="body-text">{text}</p>
    </details>
  );
}

/** Familienvideo: kein Autoplay, eigenes ruhiges „Пусти.“, danach native Steuerung (iOS-tauglich). */
export function FamilyVideo() {
  const { t, lang } = useLanguage();
  const store = useTripStore();
  const video = useAssetUrl(store, 'familyVideo');
  const poster = useAssetUrl(store, 'videoPoster');
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!video.url) return null;
  const captions = family.familyVideo.captionsSrc;
  const transcript = family.familyVideo.transcript ? localize(family.familyVideo.transcript, lang) : null;

  const play = () => {
    setStarted(true);
    ref.current?.play().catch(() => setFailed(true));
  };

  return (
    <section className="film" aria-label={t.familyStory.video.title}>
      <p className="serif-lead">{t.familyStory.video.title}</p>
      <div className="film__frame">
        <video
          ref={ref}
          src={video.url}
          poster={poster.url ?? undefined}
          controls={started}
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
        >
          {captions && <track kind="captions" src={captions} srcLang={lang === 'sr' ? 'sr' : 'de'} default />}
        </video>
        {!started && (
          <button type="button" className="film__play" onClick={play}>
            <span className="film__play-icon" aria-hidden="true" />
            <span>{t.familyStory.video.play}</span>
          </button>
        )}
      </div>
      {failed && (
        <p className="small-text" role="alert">
          {t.errors.mediaFailed}
        </p>
      )}
      <Transcript label={t.familyStory.video.transcript} text={transcript} />
    </section>
  );
}

function Voice({ message }: { message: ChildMessage }) {
  const { t, lang } = useLanguage();
  const store = useTripStore();
  const { url } = useAssetUrl(store, message.slot);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = ref.current;
    return () => audio?.pause();
  }, []);

  if (!url) return null;
  const label = localize(message.label, lang);

  const toggle = () => {
    const audio = ref.current;
    if (!audio) return;
    if (audio.paused) {
      // Nur eine Stimme gleichzeitig.
      document.querySelectorAll('audio').forEach((a) => a !== audio && a.pause());
      audio.play().catch(() => setFailed(true));
    } else audio.pause();
  };

  return (
    <div className="voice">
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
      />
      <button
        type="button"
        className="voice__button"
        aria-label={`${playing ? t.familyStory.voices.pause : t.familyStory.voices.play}: ${label}`}
        onClick={toggle}
        data-playing={playing ? 'true' : 'false'}
      >
        <span className="voice__icon" aria-hidden="true" />
      </button>
      <div className="voice__body">
        <p className="voice__label">{label}</p>
        <input
          className="voice__progress"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(time, duration || 0)}
          aria-label={`${t.familyStory.voices.progress}: ${label}`}
          aria-valuetext={`${formatTime(time)} / ${formatTime(duration)}`}
          onChange={(e) => {
            if (ref.current) ref.current.currentTime = Number(e.target.value);
          }}
          style={{ '--p': duration ? `${(time / duration) * 100}%` : '0%' } as CSSProperties}
        />
        <p className="voice__time small-text">
          {formatTime(time)}
          {duration > 0 && ` / ${formatTime(duration)}`}
        </p>
        {failed && (
          <p className="small-text" role="alert">
            {t.errors.mediaFailed}
          </p>
        )}
        <Transcript label={t.familyStory.voices.transcript} text={message.transcript ? localize(message.transcript, lang) : null} />
      </div>
    </div>
  );
}

export function ChildrenVoices() {
  const { t } = useLanguage();
  const store = useTripStore();
  const available = family.familyMessages.filter((m) => store.hasAsset(m.slot));
  if (available.length === 0) return null;
  return (
    <section className="voices" aria-label={t.familyStory.voices.title}>
      <p className="serif-lead">{t.familyStory.voices.title}</p>
      {available.map((m) => (
        <Voice key={m.slot} message={m} />
      ))}
    </section>
  );
}
