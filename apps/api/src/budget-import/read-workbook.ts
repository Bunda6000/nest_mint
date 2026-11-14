import ExcelJS from 'exceljs';
import type { Grid } from './budget-sheet.js';

export const BUDGET_SHEET_NAME = 'Буџет';

export class WorkbookReadError extends Error {}

/** A cell's value as the sheet shows it: formulas give their last calculated result. */
function plain(value: ExcelJS.CellValue): unknown {
  if (value && typeof value === 'object') {
    if ('result' in value) return plain(value.result as ExcelJS.CellValue);
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('error' in value) return { error: String(value.error) };
    if (value instanceof Date) return value;
    return null;
  }
  return value;
}

/** The Буџет sheet of an .xlsx file as a grid. Throws `WorkbookReadError` for anything else. */
export async function readBudgetSheet(file: Buffer): Promise<Grid> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
  } catch {
    throw new WorkbookReadError('That file is not a readable .xlsx workbook.');
  }
  const sheet = workbook.getWorksheet(BUDGET_SHEET_NAME);
  if (!sheet)
    throw new WorkbookReadError(`The workbook has no sheet named "${BUDGET_SHEET_NAME}".`);
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      values[columnNumber - 1] = plain(cell.value);
    });
    rows[rowNumber - 1] = values;
  });
  return Array.from(rows, (row) => row ?? []);
}
