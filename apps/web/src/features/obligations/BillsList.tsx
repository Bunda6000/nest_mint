import type { BillResponse } from '@nestmint/shared';
import { BillRow } from './BillRow';
import type { BillDetailsValues } from './BillDetailsForm';
import type { PaymentValues } from './BillPayForm';

interface BillsListProps {
  bills: BillResponse[];
  today: string;
  selected: ReadonlySet<string>;
  /** Something is open (a bill's form, or paying several), so every row waits. */
  locked: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onOpen: (open: boolean) => void;
  onPay: (id: string, values: PaymentValues) => Promise<void>;
  onSaveDetails: (id: string, values: BillDetailsValues) => Promise<void>;
  onUndo: (id: string) => Promise<void>;
}

/** The bills of one inbox tab, in the order the server gave them. */
export function BillsList(props: BillsListProps) {
  return (
    <ul className="mt-3 flex flex-col divide-y rounded-lg border">
      {props.bills.map((bill) => (
        <BillRow
          key={bill.id}
          bill={bill}
          today={props.today}
          selected={props.selected.has(bill.id)}
          locked={props.locked}
          onSelect={(value) => props.onSelect(bill.id, value)}
          onOpen={props.onOpen}
          onPay={(values) => props.onPay(bill.id, values)}
          onSaveDetails={(values) => props.onSaveDetails(bill.id, values)}
          onUndo={() => props.onUndo(bill.id)}
        />
      ))}
    </ul>
  );
}
