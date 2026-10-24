import type { ReactNode } from 'react';
import type { InfoCardKind } from '../config/chapters';
import { trip, type LocalizedOrPlain } from '../config/trip';
import { localize, useLanguage } from '../i18n/context';
import { mapsSearchUrl, navigationHref, routeUrl, safeHref } from '../lib/links';
import { ArrowIcon, PinIcon, TicketIcon } from './Icons';

interface Row {
  label: string;
  value: string | null;
  /** Fehlender Wert → „wird ergänzt“ anzeigen statt ausblenden. */
  required?: boolean;
}

/** Praktische Infos – bewusst als ruhige Liste wie im Reisejournal, nicht als App-Karte. */
function InfoList({ title, rows, actions, hint }: { title: string; rows: Row[]; actions: ReactNode; hint?: string }) {
  const { t } = useLanguage();
  const visible = rows.filter((r) => r.value || r.required);
  return (
    <section className="info" aria-label={title}>
      <h2 className="eyebrow">{title}</h2>
      {hint && <p className="small-text info__hint">{hint}</p>}
      {visible.length > 0 && (
        <dl className="info__rows">
          {visible.map((row) => (
            <div key={row.label} className="info__row">
              <dt>{row.label}</dt>
              <dd data-empty={row.value ? undefined : 'true'}>{row.value ?? t.common.tbd}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions && <div className="info__actions">{actions}</div>}
    </section>
  );
}

function LinkButton({ href, icon, children, primary }: { href: string; icon: ReactNode; children: ReactNode; primary?: boolean }) {
  const external = /^https?:/.test(href);
  return (
    <a
      className={`btn ${primary ? 'btn--primary' : 'btn--secondary'} btn--link`}
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {icon}
      <span>{children}</span>
      <ArrowIcon size={16} className="btn__trail" />
    </a>
  );
}

function useLoc() {
  const { lang } = useLanguage();
  return (v: LocalizedOrPlain | null) => (v ? localize(v, lang) : null);
}

function TicketInfo() {
  const { t } = useLanguage();
  const loc = useLoc();
  const v = trip.viennaOpen;
  const ticket = safeHref(v.ticketUrl);
  const ticketPdf = safeHref(v.ticketPdf);
  const nav = navigationHref(v.navigationUrl, v.venueAddress ?? v.venue);
  const venue = [v.venue, v.venueAddress].filter(Boolean).join(', ') || null;
  return (
    <InfoList
      title={t.info.ticketTitle}
      rows={[
        { label: t.info.event, value: v.eventName, required: true },
        { label: t.info.venue, value: venue, required: true },
        { label: t.info.session, value: loc(v.session) },
        { label: t.info.departure, value: v.departureTime },
        { label: t.info.entry, value: v.entryTime },
        { label: t.info.start, value: v.startTime },
        { label: t.info.seats, value: loc(v.seatInfo), required: true },
        { label: t.info.notes, value: loc(v.notes) },
      ]}
      actions={
        ticket || ticketPdf || nav ? (
          <>
            {ticket && (
              <LinkButton href={ticket} icon={<TicketIcon size={18} />} primary>
                {t.info.openTicket}
              </LinkButton>
            )}
            {ticketPdf && (
              <LinkButton href={ticketPdf} icon={<TicketIcon size={18} />}>
                {t.info.openTicketPdf}
              </LinkButton>
            )}
            {nav && (
              <LinkButton href={nav} icon={<PinIcon size={18} />}>
                {t.info.navigate}
              </LinkButton>
            )}
          </>
        ) : null
      }
    />
  );
}

function RestaurantInfo() {
  const { t } = useLanguage();
  const loc = useLoc();
  const r = trip.restaurant;
  const nav = navigationHref(r.navigationUrl, r.address ?? r.name);
  return (
    <InfoList
      title={t.info.restaurantTitle}
      rows={[
        { label: t.info.restaurant, value: r.name, required: true },
        { label: t.info.address, value: r.address, required: true },
        { label: t.info.reservation, value: r.reservationTime, required: true },
        { label: t.info.reservationName, value: r.reservationName },
        { label: t.info.notes, value: loc(r.notes) },
      ]}
      actions={
        nav ? (
          <LinkButton href={nav} icon={<PinIcon size={18} />}>
            {t.info.navigate}
          </LinkButton>
        ) : null
      }
    />
  );
}

function HotelInfo({ kind }: { kind: 'hotel-gym' | 'hotel-spa' }) {
  const { t } = useLanguage();
  const loc = useLoc();
  const h = trip.hotel;
  if (kind === 'hotel-gym') {
    const note = loc(h.gymNotes);
    return note ? <InfoList title={t.info.hotelTitle} rows={[{ label: t.info.notes, value: note }]} actions={null} /> : null;
  }
  const nav = navigationHref(h.mapsUrl, h.address ?? h.name);
  return (
    <InfoList
      title={t.info.hotelTitle}
      rows={[
        { label: t.info.hotel, value: h.name },
        { label: t.info.room, value: loc(h.room) },
        { label: t.info.stay, value: loc(h.stay) },
        { label: t.info.notes, value: loc(h.spaNotes) },
      ]}
      actions={
        nav ? (
          <LinkButton href={nav} icon={<PinIcon size={18} />}>
            {t.info.openMaps}
          </LinkButton>
        ) : null
      }
    />
  );
}

function RouteInfo() {
  const { t } = useLanguage();
  const w = trip.viennaWalk;
  const href = routeUrl() ?? mapsSearchUrl(w.destination.name);
  return (
    <InfoList
      title={t.info.routeTitle}
      hint={t.info.routeHint}
      rows={[{ label: t.info.address, value: [w.destination.name, w.destination.address].filter(Boolean).join(', ') }]}
      actions={
        href ? (
          <LinkButton href={href} icon={<PinIcon size={18} />} primary>
            {t.info.showWay}
          </LinkButton>
        ) : null
      }
    />
  );
}

export function ChapterInfo({ kind }: { kind: InfoCardKind }) {
  switch (kind) {
    case 'ticket':
      return <TicketInfo />;
    case 'restaurant':
      return <RestaurantInfo />;
    case 'route':
      return <RouteInfo />;
    case 'hotel-gym':
    case 'hotel-spa':
      return <HotelInfo kind={kind} />;
  }
}
