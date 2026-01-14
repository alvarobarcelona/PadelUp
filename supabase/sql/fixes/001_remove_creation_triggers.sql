-- This script ensures that no triggers update ELO/Stats immediately upon match creation.
-- We only want updates to happen via the 'confirm_match' RPC.

-- 1. Drop potential triggers on 'matches' table
DROP TRIGGER IF EXISTS "on_match_created" ON "public"."matches";
DROP TRIGGER IF EXISTS "match_insert_trigger" ON "public"."matches";
DROP TRIGGER IF EXISTS "handle_new_match" ON "public"."matches";
DROP TRIGGER IF EXISTS "update_elo_on_insert" ON "public"."matches";

-- 2. Drop potential functions associated with those triggers
-- (Be careful not to drop functions used by confirm_match, but usually confirm_match is its own function)
DROP FUNCTION IF EXISTS "public"."handle_new_match"();
DROP FUNCTION IF EXISTS "public"."process_new_match"();

-- 3. Verify that we still have 'confirm_match' (we don't drop it here, just a comment)
-- The confirm_match function is what SHOULD update the stats.

-- NOTE: If you see "Trigger not found" errors, that is GOOD. It means it's already gone.
