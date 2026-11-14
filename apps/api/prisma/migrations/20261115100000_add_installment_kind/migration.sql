-- A purchase paid in installments to the seller (NM-13). The new value gets its own migration
-- because PostgreSQL does not let a value be used in the transaction that adds it.
ALTER TYPE "obligation_kind" ADD VALUE 'installment';
