-- Force Secure Broadcast Message Encryption
-- This uses a new name to ensure we bypass any potential stale caching or overloading issues.

CREATE OR REPLACE FUNCTION broadcast_secure_message(
    recipient_ids uuid[],
    message_content text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
    encryption_key text;
    r_id uuid;
BEGIN
    current_user_id := auth.uid();
    encryption_key := get_chat_encryption_key();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if user is admin
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = current_user_id AND is_admin = true) THEN
        RAISE EXCEPTION 'Only admins can broadcast messages';
    END IF;

    -- Loop through recipients and insert encrypted messages
    FOREACH r_id IN ARRAY recipient_ids
    LOOP
        INSERT INTO messages (sender_id, receiver_id, content, content_encrypted, type)
        VALUES (
            current_user_id, 
            r_id, 
            NULL, -- content is NULL per user request
            encode(extensions.pgp_sym_encrypt(message_content, encryption_key, 'compress-algo=1, cipher-algo=aes256'), 'base64'),
            'chat'
        );
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION broadcast_secure_message(uuid[], text) TO authenticated;
