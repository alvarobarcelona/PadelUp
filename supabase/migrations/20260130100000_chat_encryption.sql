-- Enable pgcrypto extension for encryption functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Add column for encrypted content
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS content_encrypted TEXT;

-- 1b. Make content nullable (since we will store encrypted content instead)
ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;

-- 2. Define our encryption key (HARDCODED for this implementation as discussed)
-- NOTE: In a production enterprise env, this should be a secret or fetched from Vault.
-- We wrap this in a function so we can change the method later if needed.
CREATE OR REPLACE FUNCTION get_chat_encryption_key() 
RETURNS text 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Esta es tu Master Key generada. GUÁRDALA EN UN LUGAR SEGURO si alguna vez necesitas recuperarla.
    RETURN 'x8zP!k9L#m2N$v4Q@j5R&t7W*y1B^c3D'; 
END;
$$;

-- Helper: Safe Decrypt (Returns fallback text if key is wrong/data corrupt)
-- UPDATED: Uses Base64 decoding for robustness
CREATE OR REPLACE FUNCTION safe_decrypt(encrypted_data_base64 text, key text) 
RETURNS text 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF encrypted_data_base64 IS NULL THEN
        RETURN NULL;
    END IF;
    -- Decode Base64 -> Bytea, then Decrypt
    RETURN extensions.pgp_sym_decrypt(decode(encrypted_data_base64, 'base64'), key)::text;
EXCEPTION WHEN OTHERS THEN
    RETURN '[Mensaje encriptado/Error clave]'; -- Fallback text
END;
$$;


-- 3. Migration (Optional/Dev): Encrypt existing messages
-- (Skipped for fresh installs or handled by manual scripts if needed, avoiding complex migration logic here)


-- 4. RPC to Send Message (Encrypted Insert)
-- UPDATED: Uses Base64 encoding + Explicit columns
CREATE OR REPLACE FUNCTION send_chat_message(
    receiver_id uuid,
    content text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
    encryption_key text;
BEGIN
    current_user_id := auth.uid();
    encryption_key := get_chat_encryption_key();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- EXPLICITLY insert into content_encrypted with Base64 and set content to NULL
    INSERT INTO messages (sender_id, receiver_id, content, content_encrypted, type)
    VALUES (
        current_user_id, 
        receiver_id, 
        NULL, -- content is NULL
        encode(extensions.pgp_sym_encrypt(content, encryption_key, 'compress-algo=1, cipher-algo=aes256'), 'base64'),
        'chat' -- Default type
    );
END;
$$;


-- 5. RPC to Fetch Messages (Decrypted Select)
-- UPDATED: Returns 'type' column
CREATE OR REPLACE FUNCTION get_chat_messages(
    other_user_id uuid
)
RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    sender_id uuid,
    receiver_id uuid,
    content text,
    is_read boolean,
    deleted_by_sender boolean,
    deleted_by_receiver boolean,
    type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
    encryption_key text;
BEGIN
    current_user_id := auth.uid();
    encryption_key := get_chat_encryption_key();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    SELECT 
        m.id,
        m.created_at,
        m.sender_id,
        m.receiver_id,
        -- Try to decrypt. If decrypt fails (bad key?), return error text or raw
        safe_decrypt(m.content_encrypted, encryption_key) as content,
        m.is_read,
        m.deleted_by_sender,
        m.deleted_by_receiver,
        m.type
    FROM messages m
    WHERE 
        (m.sender_id = current_user_id AND m.receiver_id = other_user_id)
        OR 
        (m.sender_id = other_user_id AND m.receiver_id = current_user_id)
    ORDER BY m.created_at ASC;

END;
$$;

-- 6. RPC to Fetch Single Message (For Realtime updates)
-- UPDATED: Returns 'type' column
CREATE OR REPLACE FUNCTION get_message_by_id(
    message_id uuid
)
RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    sender_id uuid,
    receiver_id uuid,
    content text,
    is_read boolean,
    type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
    encryption_key text;
BEGIN
    current_user_id := auth.uid();
    encryption_key := get_chat_encryption_key();

    RETURN QUERY
    SELECT 
        m.id,
        m.created_at,
        m.sender_id,
        m.receiver_id,
        safe_decrypt(m.content_encrypted, encryption_key) as content,
        m.is_read,
        m.type
    FROM messages m
    WHERE m.id = message_id
    AND (m.sender_id = current_user_id OR m.receiver_id = current_user_id); -- Security check
END;
$$;

-- 7. RPC to Fetch Conversations (Decrypted Last Message + Profile)
CREATE OR REPLACE FUNCTION get_my_conversations()
RETURNS TABLE (
    user_id uuid,
    username text,
    avatar_url text,
    last_message text,
    last_message_time timestamptz,
    has_unread boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
    encryption_key text;
BEGIN
    current_user_id := auth.uid();
    encryption_key := get_chat_encryption_key();

    RETURN QUERY
    WITH valid_messages AS (
        SELECT 
            m.id,
            m.sender_id,
            m.receiver_id,
            m.content_encrypted,
            m.created_at,
            m.is_read
        FROM messages m
        WHERE 
            (m.sender_id = current_user_id AND m.deleted_by_sender IS NOT TRUE) 
            OR 
            (m.receiver_id = current_user_id AND m.deleted_by_receiver IS NOT TRUE)
    ),
    ranked_messages AS (
        SELECT 
            vm.*,
            ROW_NUMBER() OVER (
                PARTITION BY 
                    CASE WHEN vm.sender_id = current_user_id THEN vm.receiver_id ELSE vm.sender_id END 
                ORDER BY vm.created_at DESC
            ) as rn
        FROM valid_messages vm
    )
    SELECT 
        p.id as user_id,
        p.username,
        p.avatar_url,
        safe_decrypt(rm.content_encrypted, encryption_key) as last_message,
        rm.created_at as last_message_time,
        EXISTS (
            SELECT 1 FROM messages m2 
            WHERE m2.sender_id = p.id 
            AND m2.receiver_id = current_user_id 
            AND m2.is_read = false
        ) as has_unread
    FROM ranked_messages rm
    JOIN profiles p ON p.id = (CASE WHEN rm.sender_id = current_user_id THEN rm.receiver_id ELSE rm.sender_id END)
    WHERE rm.rn = 1
    ORDER BY rm.created_at DESC;
END;
$$;

-- Grant execute permission for the new function
GRANT EXECUTE ON FUNCTION get_my_conversations() TO authenticated, service_role;
