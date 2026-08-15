/**
 * Cálculo de horarios disponibles para el nodo Agendar cita.
 * Respeta el horario laboral y la zona horaria de la organización, y evita
 * traslapes con los eventos ocupados (freebusy) del calendario.
 */
import type { BusyInterval } from "./google";

const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Convierte una hora de pared (local a `tz`) en un instante UTC. */
export function zonedWallTimeToUtc(y: number, mo1: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = new Date(Date.UTC(y, mo1 - 1, d, hh, mm, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(guess);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour % 24, +m.minute, +m.second);
  const offset = asUTC - guess.getTime();
  return new Date(guess.getTime() - offset);
}

/** Partes de fecha (año/mes/día) de un instante, en la zona horaria dada. */
function ymdInTz(instant: Date, tz: string): { y: number; mo1: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return { y: +m.year, mo1: +m.month, d: +m.day };
}

export interface Slot { startISO: string; endISO: string; label: string }

interface BusinessDay { enabled?: boolean; open?: string; close?: string }

export function computeSlots(opts: {
  businessHours: Record<string, BusinessDay>;
  timeZone: string;
  durationMin: number;
  busy: BusyInterval[];
  now?: Date;
  days?: number;
  maxSlots?: number;
  stepMin?: number;
}): Slot[] {
  const {
    businessHours, timeZone, durationMin, busy,
    now = new Date(), days = 14, maxSlots = 6,
  } = opts;
  const step = opts.stepMin ?? durationMin;
  const busyRanges = busy.map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()] as [number, number]);
  const overlapsBusy = (s: number, e: number) => busyRanges.some(([bs, be]) => s < be && e > bs);

  const labelFmt = new Intl.DateTimeFormat("es-MX", {
    timeZone, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });

  const base = ymdInTz(now, timeZone);
  const slots: Slot[] = [];

  for (let offset = 0; offset < days && slots.length < maxSlots; offset++) {
    // Fecha calendario para (base + offset) usando ancla de mediodía UTC
    const anchor = new Date(Date.UTC(base.y, base.mo1 - 1, base.d + offset, 12));
    const { y, mo1, d } = ymdInTz(anchor, timeZone);
    const dow = new Date(Date.UTC(y, mo1 - 1, d)).getUTCDay();
    const day = businessHours[DOW_KEYS[dow]];
    if (!day?.enabled) continue;

    const [oh, om] = (day.open ?? "09:00").split(":").map(Number);
    const [ch, cm] = (day.close ?? "18:00").split(":").map(Number);
    const closeUtc = zonedWallTimeToUtc(y, mo1, d, ch, cm, timeZone).getTime();

    let mins = oh * 60 + om;
    const closeMins = ch * 60 + cm;
    while (mins + durationMin <= closeMins && slots.length < maxSlots) {
      const startUtc = zonedWallTimeToUtc(y, mo1, d, Math.floor(mins / 60), mins % 60, timeZone).getTime();
      const endUtc = startUtc + durationMin * 60_000;
      mins += step;
      if (startUtc <= now.getTime() + 60_000) continue; // no en el pasado
      if (endUtc > closeUtc) continue;
      if (overlapsBusy(startUtc, endUtc)) continue;
      slots.push({
        startISO: new Date(startUtc).toISOString(),
        endISO: new Date(endUtc).toISOString(),
        label: labelFmt.format(new Date(startUtc)),
      });
    }
  }
  return slots;
}
