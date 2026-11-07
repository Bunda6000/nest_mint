/** Amount in whole denars (MKD has no practical sub-unit). Always an integer. */
export type Money = number;

export function assertMoney(value: number, field = 'amount'): Money {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${field} must be an integer amount, got ${value}`);
  }
  return value;
}
