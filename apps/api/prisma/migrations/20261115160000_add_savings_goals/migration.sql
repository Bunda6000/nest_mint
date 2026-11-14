-- Savings goals and the money put into them (NM-50).
CREATE TABLE "savings_goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target_mkd" INTEGER,
    "target_month" DATE,
    "monthly_mkd" INTEGER,
    "priority" SMALLINT NOT NULL DEFAULT 2,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "goal_contributions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "amount_mkd" INTEGER NOT NULL,
    "occurred_on" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_contributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "savings_goals_id_user_id_key" ON "savings_goals"("id", "user_id");
CREATE INDEX "savings_goals_user_id_idx" ON "savings_goals"("user_id");
CREATE INDEX "goal_contributions_user_id_idx" ON "goal_contributions"("user_id");
CREATE INDEX "goal_contributions_goal_id_idx" ON "goal_contributions"("goal_id");

ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_user_id_fkey" FOREIGN KEY ("goal_id", "user_id") REFERENCES "savings_goals"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the application also checks; the database refuses bad data even if a bug slips through.
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_kind_check" CHECK ("kind" IN ('target', 'target_date', 'monthly'));
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_priority_check" CHECK ("priority" BETWEEN 1 AND 3);
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_target_check" CHECK ("target_mkd" IS NULL OR "target_mkd" BETWEEN 1 AND 1000000000);
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_monthly_check" CHECK ("monthly_mkd" IS NULL OR "monthly_mkd" BETWEEN 1 AND 1000000000);
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_month_start_check" CHECK ("target_month" IS NULL OR EXTRACT(DAY FROM "target_month") = 1);
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_kind_fields_check" CHECK (
  ("kind" = 'target' AND "target_mkd" IS NOT NULL AND "target_month" IS NULL)
  OR ("kind" = 'target_date' AND "target_mkd" IS NOT NULL AND "target_month" IS NOT NULL)
  OR ("kind" = 'monthly' AND "target_mkd" IS NULL AND "target_month" IS NULL AND "monthly_mkd" IS NOT NULL)
);
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_amount_check" CHECK ("amount_mkd" <> 0 AND "amount_mkd" BETWEEN -1000000000 AND 1000000000);

-- Row level security, like every table (see docs/adr/006-user-data-isolation.md).
ALTER TABLE "savings_goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goal_contributions" ENABLE ROW LEVEL SECURITY;
