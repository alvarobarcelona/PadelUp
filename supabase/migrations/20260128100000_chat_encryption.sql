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
RETURNS text AS $$
    -- Esta es tu Master Key generada. GUÁRDALA EN UN LUGAR SEGURO si alguna vez necesitas recuperarla.
    RETURN 'x8zP!k9L#m2N$v4Q@j5R&t7W*y1B^c3D'; 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. Migration Function: Encrypt existing messages
DO $$
DECLARE
    r RECORD;
    key text;
BEGIN
    key := get_chat_encryption_key(); 
    
    -- Only update rows where content is present and content_encrypted is null
    FOR r IN SELECT id, content FROM messages WHERE content IS NOT NULL AND content_encrypted IS NULL LOOP
        UPDATE messages 
        SET content_encrypted = extensions.pgp_sym_encrypt(r.content, key, 'compress-algo=1, cipher-algo=aes256')
        WHERE id = r.id;
    END LOOP;
END $$;


-- 4. RPC to Send Message (Encrypted Insert)
CREATE OR REPLACE FUNCTION send_chat_message(
    receiver_id uuid,
    content text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

    INSERT INTO messages (sender_id, receiver_id, content_encrypted, content)
    VALUES (
        current_user_id, 
        receiver_id, 
        extensions.pgp_sym_encrypt(content, encryption_key, 'compress-algo=1, cipher-algo=aes256'),
        NULL -- We insert NULL into the plain text column mostly, or we could leave it out if allowed
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 5. RPC to Fetch Messages (Decrypted Select)
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
    deleted_by_receiver boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
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
        extensions.pgp_sym_decrypt(m.content_encrypted::bytea, encryption_key)::text as content,
        m.is_read,
        m.deleted_by_sender,
        m.deleted_by_receiver
    FROM messages m
    WHERE 
        (m.sender_id = current_user_id AND m.receiver_id = other_user_id)
        OR 
        (m.sender_id = other_user_id AND m.receiver_id = current_user_id)
    ORDER BY m.created_at ASC

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. RPC to Fetch Single Message (For Realtime updates)
CREATE OR REPLACE FUNCTION get_message_by_id(
    message_id uuid
)
RETURNS TABLE (
    id uuid,
    created_at timestamptz,
    sender_id uuid,
    receiver_id uuid,
    content text,
    is_read boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
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
        extensions.pgp_sym_decrypt(m.content_encrypted::bytea, encryption_key)::text as content,
        m.is_read
    FROM messages m
    WHERE m.id = message_id
    AND (m.sender_id = current_user_id OR m.receiver_id = current_user_id); -- Security check
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
