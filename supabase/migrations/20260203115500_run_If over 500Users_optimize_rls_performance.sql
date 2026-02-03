-- Optimize RLS Performance by using (SELECT auth.uid()) instead of auth.uid()
-- This prevents re-evaluation of auth.uid() for each row, improving query performance

-- ============================================================================
-- TOURNAMENTS TABLE
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert their own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can update their own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Users can delete their own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Admins can delete any tournament" ON public.tournaments;
DROP POLICY IF EXISTS "Admins can update any tournament" ON public.tournaments;

-- Recreate with optimized auth.uid() calls
CREATE POLICY "Users can insert their own tournaments"
  ON public.tournaments FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = created_by);

CREATE POLICY "Users can update their own tournaments"
  ON public.tournaments FOR UPDATE
  USING ((SELECT auth.uid()) = created_by);

CREATE POLICY "Users can delete their own tournaments"
  ON public.tournaments FOR DELETE
  USING ((SELECT auth.uid()) = created_by);

CREATE POLICY "Admins can delete any tournament"
  ON public.tournaments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND is_admin = true
    )
  );

CREATE POLICY "Admins can update any tournament"
  ON public.tournaments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND is_admin = true
    )
  );

-- ============================================================================
-- TOURNAMENT_PARTICIPANTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Tournament creators can manage participants" ON public.tournament_participants;
DROP POLICY IF EXISTS "Admins can update tournament participants" ON public.tournament_participants;

CREATE POLICY "Tournament creators can manage participants"
  ON public.tournament_participants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments
      WHERE id = tournament_participants.tournament_id
      AND created_by = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can update tournament participants"
  ON public.tournament_participants FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND is_admin = true
    )
  );

-- ============================================================================
-- TOURNAMENT_MATCHES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Tournament creators can manage matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Admins can update tournament matches" ON public.tournament_matches;

CREATE POLICY "Tournament creators can manage matches"
  ON public.tournament_matches FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments
      WHERE id = tournament_matches.tournament_id
      AND created_by = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can update tournament matches"
  ON public.tournament_matches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND is_admin = true
    )
  );

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles delete" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update anyone" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete users" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Public profiles delete"
  ON public.profiles FOR DELETE
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Admins can update anyone"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
      AND p.is_admin = true
    )
  );

CREATE POLICY "Admins can delete users"
  ON public.profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
      AND p.is_admin = true
    )
  );

-- ============================================================================
-- CLUBS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage clubs" ON public.clubs;

CREATE POLICY "Admins can manage clubs"
  ON public.clubs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND is_admin = true
    )
  );

-- ============================================================================
-- ACTIVITY_LOGS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users view own logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users insert own logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Admins full access" ON public.activity_logs;

CREATE POLICY "Users view own logs"
  ON public.activity_logs FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users insert own logs"
  ON public.activity_logs FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Admins full access"
  ON public.activity_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND is_admin = true
    )
  );

-- ============================================================================
-- USER_ACHIEVEMENTS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Public user_achievements insert" ON public.user_achievements;
DROP POLICY IF EXISTS "Admins can manage all user_achievements" ON public.user_achievements;

CREATE POLICY "Public user_achievements insert"
  ON public.user_achievements FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Admins can manage all user_achievements"
  ON public.user_achievements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND is_admin = true
    )
  );

-- ============================================================================
-- FRIENDSHIPS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own friendships" ON public.friendships;
DROP POLICY IF EXISTS "Users can insert friend requests" ON public.friendships;
DROP POLICY IF EXISTS "Users can update their friendships" ON public.friendships;
DROP POLICY IF EXISTS "Users can delete their friendships" ON public.friendships;

CREATE POLICY "Users can view their own friendships"
  ON public.friendships FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id_1 
    OR (SELECT auth.uid()) = user_id_2
  );

CREATE POLICY "Users can insert friend requests"
  ON public.friendships FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id_1);

CREATE POLICY "Users can update their friendships"
  ON public.friendships FOR UPDATE
  USING (
    (SELECT auth.uid()) = user_id_1 
    OR (SELECT auth.uid()) = user_id_2
  );

CREATE POLICY "Users can delete their friendships"
  ON public.friendships FOR DELETE
  USING (
    (SELECT auth.uid()) = user_id_1 
    OR (SELECT auth.uid()) = user_id_2
  );

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Receivers can update entries to mark as read" ON public.messages;
DROP POLICY IF EXISTS "Senders can mark messages as deleted" ON public.messages;
DROP POLICY IF EXISTS "Receivers can mark messages as deleted" ON public.messages;

CREATE POLICY "Users can view their own messages"
  ON public.messages FOR SELECT
  USING (
    (SELECT auth.uid()) = sender_id 
    OR (SELECT auth.uid()) = receiver_id
  );

CREATE POLICY "Authenticated users can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = sender_id);

CREATE POLICY "Receivers can update entries to mark as read"
  ON public.messages FOR UPDATE
  USING ((SELECT auth.uid()) = receiver_id)
  WITH CHECK ((SELECT auth.uid()) = receiver_id);

CREATE POLICY "Senders can mark messages as deleted"
  ON public.messages FOR UPDATE
  USING ((SELECT auth.uid()) = sender_id)
  WITH CHECK ((SELECT auth.uid()) = sender_id);

CREATE POLICY "Receivers can mark messages as deleted"
  ON public.messages FOR UPDATE
  USING ((SELECT auth.uid()) = receiver_id)
  WITH CHECK ((SELECT auth.uid()) = receiver_id);

-- ============================================================================
-- MATCHES TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated matches insert" ON public.matches;

CREATE POLICY "Authenticated matches insert"
  ON public.matches FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ============================================================================
-- PUSH_SUBSCRIPTIONS TABLE
-- ============================================================================

DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON public.push_subscriptions;

CREATE POLICY "Users can insert their own subscriptions"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can view their own subscriptions"
  ON public.push_subscriptions FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete their own subscriptions"
  ON public.push_subscriptions FOR DELETE
  USING ((SELECT auth.uid()) = user_id);
