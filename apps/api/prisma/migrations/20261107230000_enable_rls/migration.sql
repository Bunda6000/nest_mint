-- Block Supabase's public data API from all tables. The app connects as the
-- table owner, which RLS does not restrict. Every new table must do the same
-- (enforced by src/prisma/rls.e2e.spec.ts).
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
