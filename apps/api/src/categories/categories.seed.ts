export interface SeedGroup {
  name: string;
  /** The group's name in Budget.xlsx (sheet "Буџет"); the spreadsheet importer maps by it. */
  spreadsheetName?: string;
  categories: string[];
}

/**
 * Default categories for every new user, in display order. The first seven groups come from the
 * "Буџет" sheet of Budget.xlsx; the rest cover daily spending that the spreadsheet never tracked.
 * Users can rename, add and remove categories afterwards (NM-10).
 */
export const DEFAULT_CATEGORY_GROUPS: readonly SeedGroup[] = [
  {
    name: 'Banks',
    spreadsheetName: 'Банки',
    categories: ['Mortgage', 'Consumer loan', 'Cash withdrawal'],
  },
  {
    name: 'Home',
    spreadsheetName: 'Дома',
    categories: [
      'Electricity',
      'Water',
      'Heating',
      'Phone & internet',
      'Building maintenance',
      'Installments',
      'Insurance',
      'Miscellaneous',
    ],
  },
  {
    name: 'Child',
    spreadsheetName: 'Дете',
    categories: ['Kindergarten', 'Other'],
  },
  {
    name: 'Transport',
    spreadsheetName: 'Транспорт',
    categories: [
      'Fuel',
      'Registration',
      'Insurance',
      'Green card',
      'Comprehensive insurance',
      'Tyres',
    ],
  },
  {
    name: 'Entertainment',
    spreadsheetName: 'Забава',
    categories: ['Streaming', 'Subscriptions'],
  },
  {
    name: 'Online',
    spreadsheetName: 'Online',
    categories: ['Courses', 'Online shopping'],
  },
  {
    name: 'Other',
    spreadsheetName: 'Останато',
    categories: ['Clothing', 'Other'],
  },
  { name: 'Food', categories: ['Groceries', 'Restaurants'] },
  { name: 'Household', categories: ['Household goods'] },
  { name: 'Health', categories: ['Doctor', 'Pharmacy'] },
];
