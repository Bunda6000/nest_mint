import ExcelJS from 'exceljs';
import type { Grid } from './budget-sheet.js';

const MONTHS = [
  'Јануари',
  'Февруари',
  'Март',
  'Април',
  'Мај',
  'Јуни',
  'Јули',
  'Август',
  'Септември',
  'Октомври',
  'Ноември',
  'Декември',
];

/** Cells are written as [row, column] pairs from B2, like the real Буџет sheet (a short excerpt). */
function sheetGrid(): unknown[][] {
  const g: unknown[][] = [];
  const set = (row: number, values: unknown[]) => {
    g[row - 1] = [undefined, ...values];
  };
  const header = (row: number, label: string) => set(row, [label, ...MONTHS]);
  set(2, ['Приходи']);
  header(3, 'Прилив');
  set(4, ['Плата', 127_088, 127_088, 127_088]);
  set(5, ['Друго', 19_220]);
  set(6, ['Вкупно', 146_308, 127_088, 127_088]);
  set(8, ['Расходи']);
  header(9, 'Банки');
  set(10, ['Станбен', 15_437, null, 15_500]);
  set(11, ['Потрошувачки']);
  set(12, ['Кеш', 1_900]);
  set(13, ['Вкупно', 17_337, 0, 15_500]);
  header(30, 'Транспорт');
  set(31, ['Tucson']);
  set(32, ['Гориво', 4_200, { error: '#REF!' }]);
  set(33, ['Вкупно', 4_200, 0, 0]);
  return g;
}

export const sampleGrid = (): Grid => Array.from(sheetGrid(), (row) => row ?? []);

/** The same excerpt as a real .xlsx file, with the totals as formulas. */
export async function sampleWorkbook(sheetName = 'Буџет'): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheetGrid().forEach((row, index) => {
    if (!row) return;
    row.forEach((value, column) => {
      if (value !== undefined && value !== null)
        sheet.getCell(index + 1, column + 1).value = value as ExcelJS.CellValue;
    });
  });
  sheet.getCell('C6').value = { formula: 'SUM(C4:C5)', result: 146_308 };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
