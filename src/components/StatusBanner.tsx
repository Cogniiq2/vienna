import { useLanguage } from '../i18n/context';
import { useOnline } from '../lib/hooks';
import { useTripState } from '../state/context';

/** Dezenter Hinweis bei Offline / nicht erreichbarem Server. Blockiert nichts. */
export function StatusBanner() {
  const { t } = useLanguage();
  const online = useOnline();
  const { connection, pending } = useTripState();

  let message: string | null = null;
  if (!online) message = t.common.offline;
  else if (connection === 'unreachable' && pending) message = t.errors.backendUnreachable;

  return (
    <div className="status-banner" role="status" aria-live="polite" data-visible={message ? 'true' : 'false'}>
      {message && (
        <p>
          <span className="status-banner__dot" aria-hidden="true" />
          {message}
        </p>
      )}
    </div>
  );
}
