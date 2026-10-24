import { useLanguage } from '../i18n/context';
import { formatClock } from '../lib/format';
import { trip } from '../config/trip';
import { useTripState, useTripStore } from '../state/context';
import { HeartIcon } from './Icons';

/** Kleine Nachricht der Kinder aus dem Dashboard. Erscheint beim nächsten Sync – keine Push-Notification. */
export function MessageCard() {
  const { t } = useLanguage();
  const store = useTripStore();
  const { messages } = useTripState();
  const message = messages.find((m) => !m.readAt);
  if (!message) return null;
  const time = formatClock(message.createdAt, trip.timeZone);
  return (
    <aside className="live-message" role="status" aria-live="polite">
      <p className="eyebrow eyebrow--accent">
        {t.messages.eyebrow}
        {time && <span className="live-message__time"> · {time}</span>}
      </p>
      <p className="live-message__body hand">
        {message.body}
        {message.heart && <HeartIcon size={18} className="live-message__heart" />}
      </p>
      <button type="button" className="text-link text-link--quiet" onClick={() => store.markMessageRead(message.id)}>
        {t.messages.dismiss}
      </button>
    </aside>
  );
}
