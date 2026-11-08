export type ParsedAmount =
  { status: 'empty' } | { status: 'invalid'; message: string } | { status: 'ok'; value: number };

/**
 * Reads what was typed into the amount box as whole denars. Spaces and commas are accepted as
 * thousands separators ("1,250", "1 250"). A dot is refused: in Macedonian it separates thousands,
 * in English decimals, and guessing wrong would silently turn 1.250 into 1.
 */
export function parseAmount(text: string): ParsedAmount {
  const cleaned = text.replace(/[\s,]/g, '');
  if (cleaned === '') return { status: 'empty' };
  if (/^\d+$/.test(cleaned)) return { status: 'ok', value: Number(cleaned) };
  if (/^\d+[.]\d*$/.test(cleaned) || /^[.]\d+$/.test(cleaned)) {
    return { status: 'invalid', message: 'Enter whole denars, for example 1250' };
  }
  return { status: 'invalid', message: 'Use digits only, for example 1250' };
}
