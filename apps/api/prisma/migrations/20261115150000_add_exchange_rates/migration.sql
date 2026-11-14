-- The user's MKD-per-EUR rates, each effective from a day (NM-36). Rates are whole numbers of 1/10,000.
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "rate_x10000" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exchange_rates_user_id_idx" ON "exchange_rates"("user_id");
CREATE UNIQUE INDEX "exchange_rates_user_id_effective_from_key" ON "exchange_rates"("user_id", "effective_from");

ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_rate_check" CHECK ("rate_x10000" BETWEEN 10000 AND 10000000);

ALTER TABLE "exchange_rates" ENABLE ROW LEVEL SECURITY;
