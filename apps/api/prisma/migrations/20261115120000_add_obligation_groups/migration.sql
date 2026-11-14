-- A group of obligations that belong together (NM-17): "Streaming" with Netflix and Disney,
-- "Hyundai Tucson" with fuel and insurance. Each line is an ordinary obligation with its own
-- amount, category and bills; the group only ties them together for display and totals.
CREATE TABLE "obligation_groups" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obligation_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "obligation_groups_user_id_idx" ON "obligation_groups"("user_id");
CREATE UNIQUE INDEX "obligation_groups_id_user_id_key" ON "obligation_groups"("id", "user_id");
-- One group name per user (the service also refuses a name that differs only in letter case).
CREATE UNIQUE INDEX "obligation_groups_user_id_name_key" ON "obligation_groups"("user_id", "name");

ALTER TABLE "obligation_groups" ADD CONSTRAINT "obligation_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "obligation_groups" ADD CONSTRAINT "obligation_groups_name_check" CHECK (LENGTH(BTRIM("name")) BETWEEN 1 AND 60);

ALTER TABLE "obligations" ADD COLUMN "group_id" UUID;
CREATE INDEX "obligations_group_id_idx" ON "obligations"("group_id");

-- A line can only join a group of the same user (ADR-006). NoAction: a group with lines cannot be deleted.
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_group_id_user_id_fkey" FOREIGN KEY ("group_id", "user_id") REFERENCES "obligation_groups"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Row level security, like every table (see docs/adr/006-user-data-isolation.md).
ALTER TABLE "obligation_groups" ENABLE ROW LEVEL SECURITY;
