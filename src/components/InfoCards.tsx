import type { ReactNode } from 'react';
import type { InfoCardKind } from '../config/chapters';
import { trip, type LocalizedOrPlain } from '../config/trip';
import { localize, useLanguage } from '../i18n/context';
import { navigationHref, safeHref } from '../lib/links';
import { ArrowIcon, PinIcon, TicketIcon } from './Icons';

interface Row {
  label: string;
  value: string | null;
  /** Fehlender Wert → „wird ergänzt“ anzeigen statt ausblenden. */
  required?: boolean;
}

function InfoCard({ title, rows, actions }: { title: string; rows: Row[]; actions: ReactNode }) {
  const { t } = useLanguage();
  const visible = rows.filter((r) => r.value || r.required);
  return (
    <section className="info-card" aria-label={title}>
      <h2 className="eyebrow">{title}</h2>
      {visible.length > 0 && (
        <dl className="info-card__rows">
          {visible.map((row) => (
            <div key={row.label} className="info-card__row">
              <dt>{row.label}</dt>
              <dd data-empty={row.value ? undefined : 'true'}>{row.value ?? t.common.tbd}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions && <div className="info-card__actions">{actions}</div>}
    </section>
  );
}

function LinkButton({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  const external = /^https?:/.test(href);
  return (
    <a
      className="btn btn--secondary"
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

function TicketCard() {
  const { t } = useLanguage();
  const loc = useLoc();
  const v = trip.viennaOpen;
  const ticket = safeHref(v.ticketUrl);
  const ticketPdf = safeHref(v.ticketPdf);
  const nav = navigationHref(v.navigationUrl, v.venueAddress);
  const venue = [v.venue, v.venueAddress].filter(Boolean).join(', ') || null;
  return (
    <InfoCard
      title={t.info.ticketTitle}
      rows={[
        { label: t.info.event, value: v.eventName, required: true },
        { label: t.info.venue, value: venue, required: true },
        { label: t.info.session, value: loc(v.session), required: true },
        { label: t.info.departure, value: v.departureTime },
        { label: t.info.entry, value: v.entryTime, required: true },
        { label: t.info.start, value: v.startTime },
        { label: t.info.seats, value: loc(v.seatInfo), required: true },
        { label: t.info.notes, value: loc(v.notes) },
      ]}
      actions={
        ticket || ticketPdf || nav ? (
          <>
            {ticket && (
              <LinkButton href={ticket} icon={<TicketIcon size={18} />}>
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

function RestaurantCard() {
  const { t } = useLanguage();
  const loc = useLoc();
  const r = trip.restaurant;
  const nav = navigationHref(r.navigationUrl, r.address);
  return (
    <InfoCard
      title={t.info.restaurantTitle}
      rows={[
        { label: t.info.restaurant, value: r.name, required: true },
        { label: t.info.address, value: r.address, required: true },
        { label: t.info.reservation, value: r.reservationTime, required: true },
        { label: t.info.reservationName, value: r.reservationName, required: true },
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

function HotelNoteCard({ kind }: { kind: 'hotel-gym' | 'hotel-spa' }) {
  const { t } = useLanguage();
  const loc = useLoc();
  const note = loc(kind === 'hotel-gym' ? trip.hotel.gymNotes : trip.hotel.spaNotes);
  if (!note) return null;
  return <InfoCard title={t.info.hotelTitle} rows={[{ label: t.info.notes, value: note }]} actions={null} />;
}

function HotelCard() {
  const { t } = useLanguage();
  const h = trip.hotel;
  if (!h.name && !h.address) return null;
  const nav = navigationHref(h.mapsUrl, h.address);
  return (
    <InfoCard
      title={t.info.hotelTitle}
      rows={[
        { label: t.info.hotel, value: h.name },
        { label: t.info.address, value: h.address },
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

export function ChapterInfo({ kind }: { kind: InfoCardKind }) {
  switch (kind) {
    case 'ticket':
      return <TicketCard />;
    case 'restaurant':
      return <RestaurantCard />;
    case 'hotel':
      return <HotelCard />;
    case 'hotel-gym':
    case 'hotel-spa':
      return <HotelNoteCard kind={kind} />;
  }
}
