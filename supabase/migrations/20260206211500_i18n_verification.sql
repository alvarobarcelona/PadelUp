-- Internationalize finish_tournament_with_verification and verify_tournament
-- Drops the old function signatures and creates new ones that look up language from profiles

-- ============================================================================
-- 1. finish_tournament_with_verification
-- ============================================================================

DROP FUNCTION IF EXISTS public.finish_tournament_with_verification(bigint);
DROP FUNCTION IF EXISTS public.finish_tournament_with_verification(bigint, text);

CREATE OR REPLACE FUNCTION public.finish_tournament_with_verification(
  tournament_id_param bigint
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    -- Select ONLY ONE admin to notify
    SELECT id INTO admin_id
    FROM profiles
    WHERE is_admin = true
    LIMIT 1;

    -- Send notification to the admin
    IF admin_id IS NOT NULL AND tournament_record.created_by IS NOT NULL THEN
      
      -- Construct JSON for dynamic translation
      msg_content := json_build_object(
        'key', 'chat.system_messages.verify_request',
        'params', json_build_object('name', tournament_record.name)
      )::text;
      
      INSERT INTO messages (sender_id, receiver_id, content, content_encrypted, type)
      VALUES (
        tournament_record.created_by,
        admin_id,
        NULL,
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


-- ============================================================================
-- 2. verify_tournament
-- ============================================================================

DROP FUNCTION IF EXISTS public.verify_tournament(bigint, uuid, boolean, text);
DROP FUNCTION IF EXISTS public.verify_tournament(bigint, uuid, boolean, text, text);

CREATE OR REPLACE FUNCTION public.verify_tournament(
  tournament_id_param bigint,
  admin_id_param uuid,
  approved boolean,
  admin_notes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        -- Construct JSON string
        msg_content := json_build_object(
            'key', 'chat.system_messages.verified_approved',
            'params', json_build_object('name', tournament_record.name)
        )::text;
        
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
        -- Construct JSON string
        msg_content := json_build_object(
            'key', 'chat.system_messages.verified_rejected',
            'params', json_build_object(
                'name', tournament_record.name,
                'reason', COALESCE(admin_notes, 'No reason provided')
            )
        )::text;

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
