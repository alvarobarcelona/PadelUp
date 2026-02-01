-- Enable RLS
ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;

-- 1. IMPROVED ADMIN POLICY
-- Replace explicit subquery with check_is_admin() for consistency and performance
-- Grant ALL privileges (Select, Insert, Update, Delete) to Admins
DROP POLICY IF EXISTS "Admins view all logs" ON "public"."activity_logs";
DROP POLICY IF EXISTS "Admins full access" ON "public"."activity_logs";

CREATE POLICY "Admins full access" ON "public"."activity_logs"
AS PERMISSIVE FOR ALL
TO authenticated
USING (auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true));
-- Note: Using subquery since check_is_admin might not be available in all contexts or strictly required here, 
-- but consistent with previous 'Admins view all logs'. 
-- If check_is_admin() is preferred: USING (check_is_admin());

-- 2. IMPROVED USER POLICY (INSERT)
-- Ensure users can insert their own logs
DROP POLICY IF EXISTS "Users insert own logs" ON "public"."activity_logs";

CREATE POLICY "Users insert own logs" ON "public"."activity_logs"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = actor_id);

-- 3. NEW USER POLICY (SELECT)
-- Allow users to see their own logs (was missing in backup)
DROP POLICY IF EXISTS "Users view own logs" ON "public"."activity_logs";

CREATE POLICY "Users view own logs" ON "public"."activity_logs"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (auth.uid() = actor_id);
