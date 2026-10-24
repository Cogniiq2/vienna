import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../lib/hooks';

/** Spielt eine sanfte Ausblendung ab und ruft danach `onDone` auf. */
export function useLeaveTransition(onDone: () => void, duration = 620) {
  const [leaving, setLeaving] = useState(false);
  const reduced = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const leave = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    timer.current = setTimeout(
      () => {
        window.scrollTo({ top: 0 });
        onDone();
      },
      reduced ? 0 : duration,
    );
  }, [leaving, onDone, reduced, duration]);

  return { leaving, leave };
}
