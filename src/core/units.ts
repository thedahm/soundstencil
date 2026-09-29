// Display units. Everything physical is mm internally; the UI shows cm or
// inches and converts at its edge.

export type Unit = 'cm' | 'in';

const MM_PER: Record<Unit, number> = { cm: 10, in: 25.4 };

export const fromMm = (mm: number, unit: Unit) => mm / MM_PER[unit];
export const toMm = (value: number, unit: Unit) => value * MM_PER[unit];

/** A length in the unit to `places` decimals, without trailing zeros: "3.15 in". */
export const formatLength = (mm: number, unit: Unit, places = 2) =>
  `${roundTo(fromMm(mm, unit), places)} ${unit}`;

export const roundTo = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

/** The preview's scale bar: 1 cm, or half an inch. */
export const scaleBarMm = (unit: Unit) => (unit === 'cm' ? 10 : 12.7);

/**
 * Inches for a US locale, cm for everyone else. Only the most preferred locale
 * counts; a bare language is read as its most likely region ("en" is US).
 */
export function defaultUnit(locales: readonly string[]): Unit {
  const [first] = locales;
  if (!first) return 'cm';
  try {
    return new Intl.Locale(first).maximize().region === 'US' ? 'in' : 'cm';
  } catch {
    return 'cm';
  }
}
