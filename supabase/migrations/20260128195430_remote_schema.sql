


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."are_friends"("u1" "uuid", "u2" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
    and (
      (user_id_1 = u1 and user_id_2 = u2) or
      (user_id_1 = u2 and user_id_2 = u1)
    )
  );
$$;


ALTER FUNCTION "public"."are_friends"("u1" "uuid", "u2" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_expected_score"("rating_a" integer, "rating_b" integer) RETURNS double precision
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  RETURN 1.0 / (1.0 + power(10.0, (rating_b::float - rating_a::float) / 400.0));
END;
$$;


ALTER FUNCTION "public"."calculate_expected_score"("rating_a" integer, "rating_b" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_new_rating"("current_rating" integer, "actual_score" double precision, "expected_score" double precision, "k_factor" integer) RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  RETURN round(current_rating::float + k_factor::float * (actual_score - expected_score))::int;
END;
$$;


ALTER FUNCTION "public"."calculate_new_rating"("current_rating" integer, "actual_score" double precision, "expected_score" double precision, "k_factor" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Check if the current user (auth.uid()) exists in profiles with is_admin = true
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() 
    AND is_admin = true
  );
END;
$$;


ALTER FUNCTION "public"."check_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_match"("match_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  m record;
  confirmator_id uuid;
  
  -- Player Data
  p1_elo int; p2_elo int; p3_elo int; p4_elo int;
  p1_matches int; p2_matches int; p3_matches int; p4_matches int;
  
  -- Calculations
  k1 int; k2 int; k3 int; k4 int;
  t1_avg float; t2_avg float;
  t1_expected float; t2_expected float;
  t1_score float; t2_score float;
  
  -- New Ratings
  new_p1_elo int; new_p2_elo int; new_p3_elo int; new_p4_elo int;
  
  new_snapshot jsonb;
BEGIN
  -- 1. Get match data
  SELECT * INTO m FROM public.matches WHERE id = match_id;
  
  IF m.status != 'pending' THEN
    RAISE EXCEPTION 'Match is not pending.';
  END IF;

  confirmator_id := auth.uid();

  -- 2. Get Current Stats (ELO and Match Counts) for all players
  -- We assume 1150 if e.g. profile missing (shouldn't happen) or elo null
  
  -- Team 1 Player 1
  SELECT elo INTO p1_elo FROM public.profiles WHERE id = m.team1_p1;
  SELECT count(*) INTO p1_matches FROM public.matches 
  WHERE status = 'confirmed' AND (team1_p1 = m.team1_p1 OR team1_p2 = m.team1_p1 OR team2_p1 = m.team1_p1 OR team2_p2 = m.team1_p1);
  
  -- Team 1 Player 2
  SELECT elo INTO p2_elo FROM public.profiles WHERE id = m.team1_p2;
  SELECT count(*) INTO p2_matches FROM public.matches 
  WHERE status = 'confirmed' AND (team1_p1 = m.team1_p2 OR team1_p2 = m.team1_p2 OR team2_p1 = m.team1_p2 OR team2_p2 = m.team1_p2);

  -- Team 2 Player 1
  SELECT elo INTO p3_elo FROM public.profiles WHERE id = m.team2_p1;
  SELECT count(*) INTO p3_matches FROM public.matches 
  WHERE status = 'confirmed' AND (team1_p1 = m.team2_p1 OR team1_p2 = m.team2_p1 OR team2_p1 = m.team2_p1 OR team2_p2 = m.team2_p1);

  -- Team 2 Player 2
  SELECT elo INTO p4_elo FROM public.profiles WHERE id = m.team2_p2;
  SELECT count(*) INTO p4_matches FROM public.matches 
  WHERE status = 'confirmed' AND (team1_p1 = m.team2_p2 OR team1_p2 = m.team2_p2 OR team2_p1 = m.team2_p2 OR team2_p2 = m.team2_p2);

  -- Defaults
  p1_elo := COALESCE(p1_elo, 1150);
  p2_elo := COALESCE(p2_elo, 1150);
  p3_elo := COALESCE(p3_elo, 1150);
  p4_elo := COALESCE(p4_elo, 1150);

  -- 3. Calculate K-Factors
  k1 := public.get_k_factor(p1_matches);
  k2 := public.get_k_factor(p2_matches);
  k3 := public.get_k_factor(p3_matches);
  k4 := public.get_k_factor(p4_matches);

  -- 4. Calculate Averages
  t1_avg := (p1_elo + p2_elo) / 2.0;
  t2_avg := (p3_elo + p4_elo) / 2.0;

  -- 5. Calculate Expected Scores
  t1_expected := public.calculate_expected_score(round(t1_avg)::int, round(t2_avg)::int);
  t2_expected := public.calculate_expected_score(round(t2_avg)::int, round(t1_avg)::int);

  -- 6. Determine Actual Scores based on Winner
  IF m.winner_team = 1 THEN
    t1_score := 1.0;
    t2_score := 0.0;
  ELSE
    t1_score := 0.0;
    t2_score := 1.0;
  END IF;

  -- 7. Calculate New Ratings
  new_p1_elo := public.calculate_new_rating(p1_elo, t1_score, t1_expected, k1);
  new_p2_elo := public.calculate_new_rating(p2_elo, t1_score, t1_expected, k2);
  new_p3_elo := public.calculate_new_rating(p3_elo, t2_score, t2_expected, k3);
  new_p4_elo := public.calculate_new_rating(p4_elo, t2_score, t2_expected, k4);

  -- 8. Prepare Snapshot
  new_snapshot := jsonb_build_object(
    't1p1', new_p1_elo,
    't1p2', new_p2_elo,
    't2p1', new_p3_elo,
    't2p2', new_p4_elo
  );

  -- 9. Update Database

  -- Update Players
  UPDATE public.profiles SET elo = new_p1_elo WHERE id = m.team1_p1;
  UPDATE public.profiles SET elo = new_p2_elo WHERE id = m.team1_p2;
  UPDATE public.profiles SET elo = new_p3_elo WHERE id = m.team2_p1;
  UPDATE public.profiles SET elo = new_p4_elo WHERE id = m.team2_p2;

  -- Update Match (Status + New Snapshot)
  UPDATE public.matches 
  SET status = 'confirmed', elo_snapshot = new_snapshot 
  WHERE id = match_id;

  -- Increment Validation Counter (if real user)
  IF confirmator_id IS NOT NULL THEN
      UPDATE public.profiles 
      SET matches_validated = matches_validated + 1 
      WHERE id = confirmator_id;
  END IF;

END;
$$;


ALTER FUNCTION "public"."confirm_match"("match_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_chat_encryption_key"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
    RETURN 'x8zP!k9L#m2N$v4Q@j5R&t7W*y1B^c3D';
END;
$_$;


ALTER FUNCTION "public"."get_chat_encryption_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_chat_messages"("other_user_id" "uuid") RETURNS TABLE("id" "uuid", "created_at" timestamp with time zone, "sender_id" "uuid", "receiver_id" "uuid", "content" "text", "is_read" boolean, "deleted_by_sender" boolean, "deleted_by_receiver" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
        safe_decrypt(m.content_encrypted::bytea, encryption_key) as content, -- USAR SAFE_DECRYPT
        m.is_read,
        m.deleted_by_sender,
        m.deleted_by_receiver
    FROM messages m
    WHERE 
        (m.sender_id = current_user_id AND m.receiver_id = other_user_id)
        OR 
        (m.sender_id = other_user_id AND m.receiver_id = current_user_id)
    ORDER BY m.created_at ASC;
END;
$$;


ALTER FUNCTION "public"."get_chat_messages"("other_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_k_factor"("matches_played" integer) RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  IF matches_played < 10 THEN
    RETURN 48;
  ELSIF matches_played < 30 THEN
    RETURN 32;
  ELSE
    RETURN 24;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_k_factor"("matches_played" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_message_by_id"("message_id" "uuid") RETURNS TABLE("id" "uuid", "created_at" timestamp with time zone, "sender_id" "uuid", "receiver_id" "uuid", "content" "text", "is_read" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
        safe_decrypt(m.content_encrypted::bytea, encryption_key) as content, -- USAR SAFE_DECRYPT
        m.is_read
    FROM messages m
    WHERE m.id = message_id
    AND (m.sender_id = current_user_id OR m.receiver_id = current_user_id);
END;
$$;


ALTER FUNCTION "public"."get_message_by_id"("message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_conversations"() RETURNS TABLE("user_id" "uuid", "username" "text", "avatar_url" "text", "last_message" "text", "last_message_time" timestamp with time zone, "has_unread" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
        safe_decrypt(rm.content_encrypted::bytea, encryption_key) as last_message, -- USAR SAFE_DECRYPT
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


ALTER FUNCTION "public"."get_my_conversations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_player_match_history"("id_input" "uuid", "limit_count" integer DEFAULT 10) RETURNS TABLE("id" bigint, "created_at" timestamp with time zone, "status" "text", "winner_team" integer, "score" "jsonb", "reason" "text", "team1_p1" "text", "team1_p2" "text", "team2_p1" "text", "team2_p2" "text", "actor_id" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH confirmed AS (
    SELECT
      m.id,
      m.created_at,
      m.status::text,
      m.winner_team,
      m.score,
      NULL::text as reason,
      m.team1_p1::text,
      m.team1_p2::text,
      m.team2_p1::text,
      m.team2_p2::text,
      (
        SELECT al.actor_id::text 
        FROM activity_logs al
        WHERE al.target_id = m.id::text 
          AND al.action = 'MATCH_CONFIRM'
        ORDER BY al.created_at DESC 
        LIMIT 1
      ) as actor_id
    FROM matches m
    WHERE m.status = 'confirmed'
      AND (m.team1_p1 = id_input OR m.team1_p2 = id_input OR m.team2_p1 = id_input OR m.team2_p2 = id_input)
    ORDER BY m.created_at DESC
    LIMIT limit_count
  ),
  rejected AS (
    SELECT DISTINCT ON (id)
      -- Safe cast for ID (assuming it might be string in JSON)
      COALESCE((al.details->'match_snapshot'->>'id')::bigint, 0) as id,
      al.created_at,
      'rejected'::text as status,
      (al.details->'match_snapshot'->>'winner_team')::int as winner_team,
      (al.details->'match_snapshot'->'score') as score,
      al.details->>'reason' as reason,
      (al.details->'match_snapshot'->>'team1_p1') as team1_p1,
      (al.details->'match_snapshot'->>'team1_p2') as team1_p2,
      (al.details->'match_snapshot'->>'team2_p1') as team2_p1,
      (al.details->'match_snapshot'->>'team2_p2') as team2_p2,
      al.actor_id::text
    FROM activity_logs al
    WHERE al.action = 'MATCH_REJECT'
      AND (
        al.details->'match_snapshot'->>'team1_p1' = id_input::text OR
        al.details->'match_snapshot'->>'team1_p2' = id_input::text OR
        al.details->'match_snapshot'->>'team2_p1' = id_input::text OR
        al.details->'match_snapshot'->>'team2_p2' = id_input::text
      )
    ORDER BY id, al.created_at DESC
    LIMIT limit_count
  )
  SELECT * FROM confirmed
  UNION ALL
  SELECT * FROM rejected
  ORDER BY created_at DESC
  LIMIT limit_count;
END;
$$;


ALTER FUNCTION "public"."get_player_match_history"("id_input" "uuid", "limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_suspicious_activity_report"("min_matches" integer DEFAULT 5, "min_win_rate" double precision DEFAULT 0.85, "max_diversity_score" double precision DEFAULT 0.4) RETURNS TABLE("player_id" "uuid", "username" "text", "avatar_url" "text", "elo" integer, "total_matches" bigint, "total_wins" bigint, "win_rate" numeric, "unique_opponents" bigint, "diversity_score" numeric, "suspicion_level" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    WITH player_stats AS (
        -- Calculate Wins and Total Matches
        SELECT
            p.id,
            p.username,
            p.avatar_url,
            p.elo,
            COUNT(m.id) as total_matches,
            SUM(CASE
                WHEN (m.team1_p1 = p.id OR m.team1_p2 = p.id) AND m.winner_team = 1 THEN 1
                WHEN (m.team2_p1 = p.id OR m.team2_p2 = p.id) AND m.winner_team = 2 THEN 1
                ELSE 0
            END) as wins
        FROM profiles p
        JOIN matches m ON (m.team1_p1 = p.id OR m.team1_p2 = p.id OR m.team2_p1 = p.id OR m.team2_p2 = p.id)
        WHERE m.status = 'confirmed'
        GROUP BY p.id, p.username, p.avatar_url, p.elo
    ),
    opponent_stats AS (
        -- Calculate Unique Opponents
        -- "Who did I play against?"
        SELECT
            p.id AS p_id,
            COUNT(DISTINCT op.opponent_id) as unique_opponents
        FROM profiles p
        JOIN matches m ON (m.team1_p1 = p.id OR m.team1_p2 = p.id OR m.team2_p1 = p.id OR m.team2_p2 = p.id)
        CROSS JOIN LATERAL (
            -- Union of all opponents in my matches
            SELECT m.team2_p1 AS opponent_id WHERE m.team1_p1 = p.id OR m.team1_p2 = p.id
            UNION ALL
            SELECT m.team2_p2 AS opponent_id WHERE m.team1_p1 = p.id OR m.team1_p2 = p.id
            UNION ALL
            SELECT m.team1_p1 AS opponent_id WHERE m.team2_p1 = p.id OR m.team2_p2 = p.id
            UNION ALL
            SELECT m.team1_p2 AS opponent_id WHERE m.team2_p1 = p.id OR m.team2_p2 = p.id
        ) op
        WHERE m.status = 'confirmed'
        GROUP BY p.id
    )
    SELECT
        ps.id,
        ps.username,
        ps.avatar_url,
        ps.elo,
        ps.total_matches,
        ps.wins,
        ROUND((ps.wins::numeric / ps.total_matches::numeric) * 100, 2) as win_rate,
        os.unique_opponents,
        ROUND((os.unique_opponents::numeric / ps.total_matches::numeric), 2) as diversity_score,
        CASE
            WHEN (os.unique_opponents::numeric / ps.total_matches::numeric) < 0.2 THEN 'CRITICAL'
            WHEN (os.unique_opponents::numeric / ps.total_matches::numeric) < 0.35 THEN 'HIGH'
            ELSE 'MODERATE'
        END as suspicion_level
    FROM player_stats ps
    JOIN opponent_stats os ON ps.id = os.p_id
    WHERE ps.total_matches >= min_matches
      -- High Win Rate Check
      AND (ps.wins::float / ps.total_matches::float) >= min_win_rate
      -- Low Diversity Check (Farming Pattern)
      AND (os.unique_opponents::float / ps.total_matches::float) <= max_diversity_score
    ORDER BY diversity_score ASC, win_rate DESC;
END;
$$;


ALTER FUNCTION "public"."get_suspicious_activity_report"("min_matches" integer, "min_win_rate" double precision, "max_diversity_score" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_expired_matches"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  m record;
BEGIN
  -- Find all pending matches that have passed their auto_confirm_at time
  FOR m IN SELECT id FROM public.matches WHERE status = 'pending' AND auto_confirm_at < now() LOOP
    PERFORM public.confirm_match(m.id);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_expired_matches"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_match"("match_id" bigint, "reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$DECLARE
  m record;
  snap jsonb;
  admin_id uuid;
  rejector_id uuid;
BEGIN
  -- Get match data
  SELECT * INTO m FROM public.matches WHERE id = match_id FOR UPDATE;
  
  -- Validation
  IF m.status != 'pending' THEN
    RAISE EXCEPTION 'Match is not pending.';
  END IF;

  snap := m.elo_snapshot;
  rejector_id := auth.uid();

  -- 1. Log to activity_logs
  INSERT INTO public.activity_logs (actor_id, action, target_id, details)
  VALUES (
    rejector_id, 
    'MATCH_REJECT', 
    match_id::text, 
    jsonb_build_object(
      'reason', reason,
      'match_snapshot', row_to_json(m)
    )
  );

  -- 2. Increment Rejection Counter for the user performing the action
  UPDATE public.profiles 
  SET matches_rejected = matches_rejected + 1 
  WHERE id = rejector_id;

  -- 3. Notify Admin (Internal Message)
  -- Find the first admin (or a specific system admin)
  SELECT id INTO admin_id FROM public.profiles WHERE is_admin = true LIMIT 1;
  
  IF admin_id IS NOT NULL THEN
    INSERT INTO public.messages (content, sender_id, receiver_id)
    VALUES (
      'Match #' || match_id || ' was rejected by user. Reason: ' || reason, 
      rejector_id, -- Sender is the user rejecting
      admin_id
    );
  END IF;

  -- 4. Perform a hard delete of the match
  DELETE FROM public.matches WHERE id = match_id;
END;$$;


ALTER FUNCTION "public"."reject_match"("match_id" bigint, "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."safe_decrypt"("encrypted_data" "bytea", "key" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN extensions.pgp_sym_decrypt(encrypted_data, key)::text;
EXCEPTION WHEN OTHERS THEN
    RETURN '[Mensaje ilegible/Clave antigua]'; -- Texto fallback en vez de error 500
END;
$$;


ALTER FUNCTION "public"."safe_decrypt"("encrypted_data" "bytea", "key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_chat_message"("receiver_id" "uuid", "content" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
        NULL 
    );
END;
$$;


ALTER FUNCTION "public"."send_chat_message"("receiver_id" "uuid", "content" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."achievements" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "point_value" integer DEFAULT 10
);


ALTER TABLE "public"."achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "target_id" "text",
    "details" "jsonb"
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clubs" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "name" "text" NOT NULL,
    "location" "text"
);


ALTER TABLE "public"."clubs" OWNER TO "postgres";


ALTER TABLE "public"."clubs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."clubs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" bigint NOT NULL,
    "user_id_1" "uuid" NOT NULL,
    "user_id_2" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text"])))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


ALTER TABLE "public"."friendships" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."friendships_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "team1_p1" "uuid",
    "team1_p2" "uuid",
    "team2_p1" "uuid",
    "team2_p2" "uuid",
    "score" "jsonb" NOT NULL,
    "winner_team" smallint NOT NULL,
    "commentary" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "auto_confirm_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval),
    "elo_snapshot" "jsonb",
    "created_by" "uuid",
    "club_id" bigint,
    CONSTRAINT "matches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


ALTER TABLE "public"."matches" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."matches_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content" "text",
    "sender_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_read" boolean DEFAULT false,
    "deleted_by_sender" boolean DEFAULT false,
    "deleted_by_receiver" boolean DEFAULT false,
    "content_encrypted" "text"
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "username" "text" NOT NULL,
    "avatar_url" "text",
    "elo" integer DEFAULT 1150,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_admin" boolean DEFAULT false,
    "approved" boolean DEFAULT false,
    "notifications_enabled" boolean DEFAULT true,
    "subscription_end_date" timestamp with time zone DEFAULT ("now"() + '30 days'::interval),
    "banned" boolean DEFAULT false,
    "email" "text",
    "banned_until" timestamp with time zone,
    "member_id" bigint NOT NULL,
    "matches_validated" integer DEFAULT 0,
    "matches_rejected" integer DEFAULT 0,
    "main_club_id" bigint,
    "first_name" "text",
    "last_name" "text",
    "terms_accepted_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."banned" IS 'user can be banned';



COMMENT ON COLUMN "public"."profiles"."banned_until" IS 'If set, user is banned until this timestamp. If null, strict "banned" flag applies or user is active.';



COMMENT ON COLUMN "public"."profiles"."member_id" IS 'solo para uso interno(para llevar la cuenta o mostrar en el fron)';



ALTER TABLE "public"."profiles" ALTER COLUMN "member_id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."profiles_member_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription" "jsonb" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


ALTER TABLE "public"."push_subscriptions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."push_subscriptions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_achievements" (
    "user_id" "uuid" NOT NULL,
    "achievement_id" "text" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."user_achievements" OWNER TO "postgres";


ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_id_1_user_id_2_key" UNIQUE ("user_id_1", "user_id_2");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_subscription_key" UNIQUE ("user_id", "subscription");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("user_id", "achievement_id");



CREATE INDEX "friendships_user_id_1_idx" ON "public"."friendships" USING "btree" ("user_id_1");



CREATE INDEX "friendships_user_id_2_idx" ON "public"."friendships" USING "btree" ("user_id_2");



CREATE INDEX "idx_profiles_member_id" ON "public"."profiles" USING "btree" ("member_id");



CREATE OR REPLACE TRIGGER "push-on-new-message" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://pkgmrvalcppskxdusqni.supabase.co/functions/v1/push-notification', 'POST', '{"Content-type":"application/json"}', '{}', '5000');



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_id_1_fkey" FOREIGN KEY ("user_id_1") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_id_2_fkey" FOREIGN KEY ("user_id_2") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_team1_p1_fkey" FOREIGN KEY ("team1_p1") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_team1_p2_fkey" FOREIGN KEY ("team1_p2") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_team2_p1_fkey" FOREIGN KEY ("team2_p1") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_team2_p2_fkey" FOREIGN KEY ("team2_p2") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_main_club_id_fkey" FOREIGN KEY ("main_club_id") REFERENCES "public"."clubs"("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



CREATE POLICY "Admin matches delete" ON "public"."matches" FOR DELETE USING ("public"."check_is_admin"());



CREATE POLICY "Admins can delete users" ON "public"."profiles" FOR DELETE USING ("public"."check_is_admin"());



CREATE POLICY "Admins can manage all user_achievements" ON "public"."user_achievements" USING (("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."is_admin" = true))));



CREATE POLICY "Admins can manage clubs" ON "public"."clubs" USING (("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."is_admin" = true))));



CREATE POLICY "Admins can update anyone" ON "public"."profiles" FOR UPDATE USING ("public"."check_is_admin"());



CREATE POLICY "Admins view all logs" ON "public"."activity_logs" FOR SELECT USING (("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."is_admin" = true))));



CREATE POLICY "Authenticated matches insert" ON "public"."matches" FOR INSERT WITH CHECK ((("auth"."role"() = 'authenticated'::"text") AND ("auth"."uid"() = "created_by")));



CREATE POLICY "Authenticated users can insert messages" ON "public"."messages" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Clubs are viewable by everyone" ON "public"."clubs" FOR SELECT USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Public achievements access" ON "public"."achievements" FOR SELECT USING (true);



CREATE POLICY "Public matches access" ON "public"."matches" FOR SELECT USING (true);



CREATE POLICY "Public profiles access" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Public profiles delete" ON "public"."profiles" FOR DELETE USING (("auth"."uid"() = "id"));



CREATE POLICY "Public profiles insert" ON "public"."profiles" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public user_achievements access" ON "public"."user_achievements" FOR SELECT USING (true);



CREATE POLICY "Public user_achievements insert" ON "public"."user_achievements" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Receivers can mark messages as deleted" ON "public"."messages" FOR UPDATE USING (("auth"."uid"() = "receiver_id")) WITH CHECK (("auth"."uid"() = "receiver_id"));



CREATE POLICY "Receivers can update entries to mark as read" ON "public"."messages" FOR UPDATE USING (("auth"."uid"() = "receiver_id")) WITH CHECK (("auth"."uid"() = "receiver_id"));



CREATE POLICY "Senders can mark messages as deleted" ON "public"."messages" FOR UPDATE USING (("auth"."uid"() = "sender_id")) WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can delete their friendships" ON "public"."friendships" FOR DELETE USING ((("auth"."uid"() = "user_id_1") OR ("auth"."uid"() = "user_id_2")));



CREATE POLICY "Users can delete their own subscriptions" ON "public"."push_subscriptions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert friend requests" ON "public"."friendships" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id_1"));



CREATE POLICY "Users can insert their own subscriptions" ON "public"."push_subscriptions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their friendships" ON "public"."friendships" FOR UPDATE USING ((("auth"."uid"() = "user_id_2") OR ("auth"."uid"() = "user_id_1")));



CREATE POLICY "Users can view their own friendships" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = "user_id_1") OR ("auth"."uid"() = "user_id_2")));



CREATE POLICY "Users can view their own messages" ON "public"."messages" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id")));



CREATE POLICY "Users can view their own subscriptions" ON "public"."push_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users insert own logs" ON "public"."activity_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "actor_id"));



ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clubs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_achievements" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."are_friends"("u1" "uuid", "u2" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."are_friends"("u1" "uuid", "u2" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."are_friends"("u1" "uuid", "u2" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_expected_score"("rating_a" integer, "rating_b" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_expected_score"("rating_a" integer, "rating_b" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_expected_score"("rating_a" integer, "rating_b" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_new_rating"("current_rating" integer, "actual_score" double precision, "expected_score" double precision, "k_factor" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_new_rating"("current_rating" integer, "actual_score" double precision, "expected_score" double precision, "k_factor" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_new_rating"("current_rating" integer, "actual_score" double precision, "expected_score" double precision, "k_factor" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_match"("match_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_match"("match_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_match"("match_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_chat_encryption_key"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_chat_encryption_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chat_encryption_key"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_chat_messages"("other_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_chat_messages"("other_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_chat_messages"("other_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_k_factor"("matches_played" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_k_factor"("matches_played" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_k_factor"("matches_played" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_message_by_id"("message_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_message_by_id"("message_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_message_by_id"("message_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_conversations"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_conversations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_conversations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_player_match_history"("id_input" "uuid", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_player_match_history"("id_input" "uuid", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_player_match_history"("id_input" "uuid", "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_suspicious_activity_report"("min_matches" integer, "min_win_rate" double precision, "max_diversity_score" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_suspicious_activity_report"("min_matches" integer, "min_win_rate" double precision, "max_diversity_score" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_suspicious_activity_report"("min_matches" integer, "min_win_rate" double precision, "max_diversity_score" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."process_expired_matches"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_expired_matches"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_expired_matches"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_match"("match_id" bigint, "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_match"("match_id" bigint, "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_match"("match_id" bigint, "reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."safe_decrypt"("encrypted_data" "bytea", "key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."safe_decrypt"("encrypted_data" "bytea", "key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_decrypt"("encrypted_data" "bytea", "key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."send_chat_message"("receiver_id" "uuid", "content" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."send_chat_message"("receiver_id" "uuid", "content" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_chat_message"("receiver_id" "uuid", "content" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."achievements" TO "anon";
GRANT ALL ON TABLE "public"."achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."achievements" TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."clubs" TO "anon";
GRANT ALL ON TABLE "public"."clubs" TO "authenticated";
GRANT ALL ON TABLE "public"."clubs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."clubs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clubs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clubs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON SEQUENCE "public"."friendships_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."friendships_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."friendships_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";



GRANT ALL ON SEQUENCE "public"."matches_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."matches_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."matches_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."profiles_member_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."profiles_member_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."profiles_member_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."push_subscriptions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."push_subscriptions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."push_subscriptions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_achievements" TO "anon";
GRANT ALL ON TABLE "public"."user_achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."user_achievements" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































  create policy "Give users authenticated access to folder 1oj01fe_0"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text)));



