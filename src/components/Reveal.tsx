import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Blendet Inhalt sanft ein, sobald er in den sichtbaren Bereich scrollt.
 * Ohne IntersectionObserver (oder bei reduzierter Bewegung) sofort sichtbar.
 */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      className={`scroll-reveal ${className}`}
      data-visible={visible ? 'true' : 'false'}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}
