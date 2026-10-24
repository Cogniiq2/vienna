import type { MusicSlot } from '../config/chapters';
import { family, hasMusicLinks } from '../config/family';
import { useLanguage } from '../i18n/context';
import { safeHref } from '../lib/links';

/** Optionaler Musiktipp als Streaming-Link. Kein Autoplay, keine gebündelten Audiodateien. */
export function MusicCard({ slot }: { slot: MusicSlot }) {
  const { t } = useLanguage();
  const track = family.music[slot];
  if (!hasMusicLinks(track)) return null;
  const links = [
    { href: safeHref(track.spotifyUrl), label: t.music.spotify },
    { href: safeHref(track.appleMusicUrl), label: t.music.apple },
    { href: safeHref(track.youtubeUrl), label: t.music.youtube },
  ].filter((l): l is { href: string; label: string } => Boolean(l.href));
  if (links.length === 0) return null;
  return (
    <aside className="music" aria-label={t.music.title}>
      <p className="eyebrow">{t.music.title}</p>
      <p className="music__track">
        <span className="music__title">{track.title}</span>
        <span className="music__artist">{track.artist}</span>
      </p>
      <p className="music__links">
        {links.map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="text-link">
            {l.label}
          </a>
        ))}
      </p>
      <p className="small-text">{t.music.hint}</p>
    </aside>
  );
}
