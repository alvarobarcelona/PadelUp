-- Limit Admin Notifications to Single Admin

-- ============================================================================
-- FUNCTION: finish_tournament_with_verification
-- Handles tournament completion with verification workflow for public tournaments
-- MODIFIED: Sends notification only to the FIRST admin found, not all.
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

    -- Get SINGLE admin user ID (First found)
    SELECT id INTO admin_id
    FROM profiles
    WHERE is_admin = true
    LIMIT 1;

    -- Send notification to ONLY ONE admin via messages table
    -- ONLY if creator exists (to use as sender)
    IF admin_id IS NOT NULL AND tournament_record.created_by IS NOT NULL THEN
      -- User requested custom text:
      msg_content := format('🏆 Tournament "%s" needs verification for a admin. You will notified per chat when it is verified.', tournament_record.name);
      
      -- EXPLICITLY insert into content_encrypted with Base64 and set content to NULL
      INSERT INTO messages (sender_id, receiver_id, content, content_encrypted, type)
      VALUES (
        tournament_record.created_by,
        admin_id,
        NULL, -- content is NULL
        encode(extensions.pgp_sym_encrypt(msg_content, encryption_key, 'compress-algo=1, cipher-algo=aes256'), 'base64'),
        'system'
      );
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
