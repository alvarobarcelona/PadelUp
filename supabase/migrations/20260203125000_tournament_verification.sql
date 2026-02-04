-- Tournament Verification System

-- Add reported_issues field to store participant issue reports
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS reported_issues JSONB DEFAULT '[]'::jsonb;

-- Ensure messages table has type column
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'chat';

-- Update status constraint to include new verification states
ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_status_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_status_check 
  CHECK (status IN ('setup', 'playing', 'pending_verification', 'completed', 'rejected'));

-- Add comment
COMMENT ON COLUMN public.tournaments.reported_issues IS 'Array of issue reports from participants';

-- ============================================================================
-- FUNCTION: finish_tournament_with_verification
-- Handles tournament completion with verification workflow for public tournaments
-- ============================================================================

CREATE OR REPLACE FUNCTION finish_tournament_with_verification(
  tournament_id_param bigint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tournament_record RECORD;
  admin_ids uuid[];
  admin_id uuid;
  result json;
  encryption_key text;
  msg_content text;
BEGIN
  -- Get encryption key
  encryption_key := get_chat_encryption_key();

  -- Get tournament details
  SELECT * INTO tournament_record
  FROM tournaments
  WHERE id = tournament_id_param;

  IF tournament_record IS NULL THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  -- Determine final status based on visibility
  IF tournament_record.visibility = 'public' THEN
    -- Public tournaments need verification
    UPDATE tournaments
    SET status = 'pending_verification'
    WHERE id = tournament_id_param;

    -- Get all admin user IDs
    SELECT array_agg(id) INTO admin_ids
    FROM profiles
    WHERE is_admin = true;

    -- Send notification to each admin via messages table
    -- ONLY if creator exists (to use as sender)
    IF admin_ids IS NOT NULL AND tournament_record.created_by IS NOT NULL THEN
      -- User requested custom text:
      msg_content := format('🏆 Tournament "%s" needs verification for a admin. You will notified per chat when it is verified.', tournament_record.name);
      
      FOREACH admin_id IN ARRAY admin_ids
      LOOP
        -- EXPLICITLY insert into content_encrypted with Base64 and set content to NULL
        INSERT INTO messages (sender_id, receiver_id, content, content_encrypted, type)
        VALUES (
          tournament_record.created_by,
          admin_id,
          NULL, -- content is NULL
          encode(extensions.pgp_sym_encrypt(msg_content, encryption_key, 'compress-algo=1, cipher-algo=aes256'), 'base64'),
          'system'
        );
      END LOOP;
    END IF;

    result := json_build_object(
      'status', 'pending_verification',
      'message', 'Tournament submitted for admin verification'
    );
  ELSE
    -- Friends/Private tournaments complete immediately
    UPDATE tournaments
    SET status = 'completed'
    WHERE id = tournament_id_param;

    result := json_build_object(
      'status', 'completed',
      'message', 'Tournament completed'
    );
  END IF;

  RETURN result;
END;
$$;

-- ============================================================================
-- FUNCTION: report_tournament_issue
-- Allows participants to report issues with tournament results
-- ============================================================================

CREATE OR REPLACE FUNCTION report_tournament_issue(
  tournament_id_param bigint,
  reporter_id_param uuid,
  issue_text text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tournament_record RECORD;
  reporter_name text;
  admin_ids uuid[];
  admin_id uuid;
  new_issue jsonb;
  is_participant boolean;
  encryption_key text;
  msg_content text;
BEGIN
  -- Get encryption key
  encryption_key := get_chat_encryption_key();

  -- Get tournament
  SELECT * INTO tournament_record FROM tournaments WHERE id = tournament_id_param;
  
  IF tournament_record IS NULL THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  -- Verify reporter is a participant
  SELECT EXISTS (
    SELECT 1 FROM tournament_participants
    WHERE tournament_id = tournament_id_param
    AND player_id = reporter_id_param
  ) INTO is_participant;

  IF NOT is_participant THEN
    RAISE EXCEPTION 'Only tournament participants can report issues';
  END IF;

  -- Get reporter info
  SELECT username INTO reporter_name FROM profiles WHERE id = reporter_id_param;

  -- Build issue object
  new_issue := jsonb_build_object(
    'reporter_id', reporter_id_param,
    'reporter_name', reporter_name,
    'issue', issue_text,
    'reported_at', now()
  );

  -- Append to reported_issues array
  UPDATE tournaments
  SET reported_issues = reported_issues || new_issue
  WHERE id = tournament_id_param;

  -- Get all admin user IDs
  SELECT array_agg(id) INTO admin_ids FROM profiles WHERE is_admin = true;

  -- Send notification to each admin
  IF admin_ids IS NOT NULL THEN
    msg_content := format('⚠️ Issue reported in tournament "%s" by %s: %s', 
          tournament_record.name, reporter_name, issue_text);

    FOREACH admin_id IN ARRAY admin_ids
    LOOP
      INSERT INTO messages (sender_id, receiver_id, content, content_encrypted, type)
      VALUES (
        reporter_id_param,
        admin_id,
        NULL, -- content is NULL
        encode(extensions.pgp_sym_encrypt(msg_content, encryption_key, 'compress-algo=1, cipher-algo=aes256'), 'base64'),
        'system'
      );
    END LOOP;
  END IF;
END;
$$;

-- ============================================================================
-- FUNCTION: verify_tournament
-- Allows admins to approve or reject tournaments
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_tournament(
  tournament_id_param bigint,
  admin_id_param uuid,
  approved boolean,
  admin_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tournament_record RECORD;
  encryption_key text;
  msg_content text;
BEGIN
  -- Get encryption key
  encryption_key := get_chat_encryption_key();

  -- Verify admin permissions
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = admin_id_param AND is_admin = true) THEN
    RAISE EXCEPTION 'Only admins can verify tournaments';
  END IF;

  -- Get tournament
  SELECT * INTO tournament_record FROM tournaments WHERE id = tournament_id_param;
  
  IF tournament_record IS NULL THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF approved THEN
    -- Approve tournament
    UPDATE tournaments
    SET status = 'completed'
    WHERE id = tournament_id_param;

    -- Notify creator (if exists)
    IF tournament_record.created_by IS NOT NULL THEN
        msg_content := format('✅ Your tournament "%s" has been verified and approved!', tournament_record.name);
        
        INSERT INTO messages (sender_id, receiver_id, content, content_encrypted, type)
        VALUES (
          admin_id_param,
          tournament_record.created_by,
          NULL, -- content is NULL
          encode(extensions.pgp_sym_encrypt(msg_content, encryption_key, 'compress-algo=1, cipher-algo=aes256'), 'base64'),
          'system'
        );
    END IF;
  ELSE
    -- Reject tournament
    UPDATE tournaments
    SET status = 'rejected'
    WHERE id = tournament_id_param;

    -- Notify creator with reason (if exists)
    IF tournament_record.created_by IS NOT NULL THEN
        msg_content := format('❌ Your tournament "%s" was rejected. Reason: %s', 
            tournament_record.name, COALESCE(admin_notes, 'No reason provided'));
            
        INSERT INTO messages (sender_id, receiver_id, content, content_encrypted, type)
        VALUES (
          admin_id_param,
          tournament_record.created_by,
          NULL, -- content is NULL
          encode(extensions.pgp_sym_encrypt(msg_content, encryption_key, 'compress-algo=1, cipher-algo=aes256'), 'base64'),
          'system'
        );
    END IF;
  END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION finish_tournament_with_verification TO authenticated;
GRANT EXECUTE ON FUNCTION report_tournament_issue TO authenticated;
GRANT EXECUTE ON FUNCTION verify_tournament TO authenticated;
