--
-- PostgreSQL database dump
--

\restrict kfGz4wAG8kLaRa9XiPnmkYbB2KhsZPEA6Z7qP5ofUot5hdRD7rsHxr8rifHVYfZ

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.7 (Ubuntu 17.7-3.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: are_friends(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.are_friends(u1 uuid, u2 uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.are_friends(u1 uuid, u2 uuid) OWNER TO postgres;

--
-- Name: calculate_expected_score(integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_expected_score(rating_a integer, rating_b integer) RETURNS double precision
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  RETURN 1.0 / (1.0 + power(10.0, (rating_b::float - rating_a::float) / 400.0));
END;
$$;


ALTER FUNCTION public.calculate_expected_score(rating_a integer, rating_b integer) OWNER TO postgres;

--
-- Name: calculate_new_rating(integer, double precision, double precision, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.calculate_new_rating(current_rating integer, actual_score double precision, expected_score double precision, k_factor integer) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  RETURN round(current_rating::float + k_factor::float * (actual_score - expected_score))::int;
END;
$$;


ALTER FUNCTION public.calculate_new_rating(current_rating integer, actual_score double precision, expected_score double precision, k_factor integer) OWNER TO postgres;

--
-- Name: check_is_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.check_is_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.check_is_admin() OWNER TO postgres;

--
-- Name: confirm_match(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.confirm_match(match_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.confirm_match(match_id bigint) OWNER TO postgres;

--
-- Name: get_k_factor(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_k_factor(matches_played integer) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
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


ALTER FUNCTION public.get_k_factor(matches_played integer) OWNER TO postgres;

--
-- Name: get_player_match_history(uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_player_match_history(id_input uuid, limit_count integer DEFAULT 10) RETURNS TABLE(id bigint, created_at timestamp with time zone, status text, winner_team integer, score jsonb, reason text, team1_p1 text, team1_p2 text, team2_p1 text, team2_p2 text, actor_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.get_player_match_history(id_input uuid, limit_count integer) OWNER TO postgres;

--
-- Name: process_expired_matches(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.process_expired_matches() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.process_expired_matches() OWNER TO postgres;

--
-- Name: reject_match(bigint, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reject_match(match_id bigint, reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


ALTER FUNCTION public.reject_match(match_id bigint, reason text) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: achievements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.achievements (
    id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    icon text NOT NULL,
    point_value integer DEFAULT 10
);


ALTER TABLE public.achievements OWNER TO postgres;

--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    target_id text,
    details jsonb
);


ALTER TABLE public.activity_logs OWNER TO postgres;

--
-- Name: clubs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.clubs (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    name text NOT NULL,
    location text
);


ALTER TABLE public.clubs OWNER TO postgres;

--
-- Name: clubs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.clubs ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.clubs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.friendships (
    id bigint NOT NULL,
    user_id_1 uuid NOT NULL,
    user_id_2 uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT friendships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text])))
);


ALTER TABLE public.friendships OWNER TO postgres;

--
-- Name: friendships_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.friendships ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.friendships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: matches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.matches (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    team1_p1 uuid,
    team1_p2 uuid,
    team2_p1 uuid,
    team2_p2 uuid,
    score jsonb NOT NULL,
    winner_team smallint NOT NULL,
    commentary text,
    status text DEFAULT 'pending'::text,
    auto_confirm_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval),
    elo_snapshot jsonb,
    created_by uuid,
    club_id bigint,
    CONSTRAINT matches_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'rejected'::text])))
);


ALTER TABLE public.matches OWNER TO postgres;

--
-- Name: matches_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.matches ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.matches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content text NOT NULL,
    sender_id uuid DEFAULT auth.uid() NOT NULL,
    receiver_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_read boolean DEFAULT false,
    deleted_by_sender boolean DEFAULT false,
    deleted_by_receiver boolean DEFAULT false
);


ALTER TABLE public.messages OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    avatar_url text,
    elo integer DEFAULT 1150,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_admin boolean DEFAULT false,
    approved boolean DEFAULT false,
    notifications_enabled boolean DEFAULT true,
    subscription_end_date timestamp with time zone DEFAULT (now() + '30 days'::interval),
    banned boolean DEFAULT false,
    email text,
    banned_until timestamp with time zone,
    member_id bigint NOT NULL,
    matches_validated integer DEFAULT 0,
    matches_rejected integer DEFAULT 0,
    main_club_id bigint,
    first_name text,
    last_name text
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: COLUMN profiles.banned; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.profiles.banned IS 'user can be banned';


--
-- Name: COLUMN profiles.banned_until; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.profiles.banned_until IS 'If set, user is banned until this timestamp. If null, strict "banned" flag applies or user is active.';


--
-- Name: COLUMN profiles.member_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.profiles.member_id IS 'solo para uso interno(para llevar la cuenta o mostrar en el fron)';


--
-- Name: profiles_member_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ALTER COLUMN member_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.profiles_member_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_achievements (
    user_id uuid NOT NULL,
    achievement_id text NOT NULL,
    unlocked_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


ALTER TABLE public.user_achievements OWNER TO postgres;

--
-- Data for Name: achievements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.achievements (id, name, description, icon, point_value) FROM stdin;
first_blood	First Blood	Play your first match	Sword	10
winner	Winner	Win your first match	Trophy	25
socialite	Socialite	Upload a profile picture	Camera	15
on_fire	On Fire	Win 3 matches in a row	Flame	60
veteran	Veteran	Play 10 matches	Medal	50
consistency	Consistency	Win 5 matches in a row	Flame	150
unstoppable	Unstoppable	Win 10 matches in a row	Flame	500
padel_addict	Padel Addict	Play 50 matches	Medal	200
centurion	Centurion	Play 100 matches	Medal	500
dominator	Dominator	Win 20 total matches	Trophy	150
conqueror	Conqueror	Win 50 total matches	Trophy	400
legend	Legend	Win 100 total matches	Trophy	1000
clean_sheet	Clean Sheet	Win a match without losing a game (Set won 6-0)	Sword	100
comeback_king	Comeback King	Win after losing the first set	Sword	75
team_player	Team Player	Play with 5 different partners	Camera	50
weekend_warrior	Weekend Warrior	Play 5 matches in a weekend	Medal	60
night_owl	Night Owl	Play a match after 10 PM	Camera	30
early_bird	Early Bird	Play a match before 9 AM	Camera	30
sharpshooter	Sharpshooter	Win a set 6-1	Sword	40
marathon	Marathon	Play a 3-set match	Medal	35
\.


--
-- Data for Name: activity_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.activity_logs (id, created_at, actor_id, action, target_id, details) FROM stdin;
a4b73444-f99e-40f8-99d8-6b88505d48b2	2026-01-11 15:31:11.701927+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
9a3031b9-c181-473a-af94-ff6ad6bef230	2026-01-11 17:15:12.704932+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
d5b430b9-df34-4268-a1ca-a454b537b8f7	2026-01-11 19:38:29.042728+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
482253d7-3a61-4e9f-bbfb-1c0f68746c23	2026-01-11 19:43:13.572833+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
26304b1c-497c-4361-b2cd-2858a8dab532	2026-01-11 19:55:04.375586+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
a0d828ba-ec71-4343-abd7-75ff4b6da0be	2026-01-11 21:09:16.017241+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_EDIT_USER	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"changes": {"elo": 1150, "banned": false, "approved": true, "is_admin": false, "username": "Alvaro"}}
9f3d079c-cec7-4ed7-8101-764324f1e9b5	2026-01-11 23:25:17.682952+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
da71e0bb-7278-44f0-9fbc-8efc45d6261d	2026-01-12 00:31:05.072677+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
728c4904-67a9-40d2-9d74-4615f3e9dd08	2026-01-12 00:52:35.771333+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
595e943d-f5dd-4cae-9a39-123557a6456d	2026-01-12 00:52:50.216481+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_APPROVE_USER	d3040839-95ec-4154-b3f0-eac43a4ed76f	{"username": "Barce"}
fea3f68c-fa35-4e44-9235-51febedbeea8	2026-01-12 00:53:30.94044+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_DELETE_USER	d3040839-95ec-4154-b3f0-eac43a4ed76f	{"deleted_id": "d3040839-95ec-4154-b3f0-eac43a4ed76f"}
9c4ff2fb-1b25-4e32-b879-3e50e86f8d8c	2026-01-12 00:58:50.991403+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
c564b6d7-bdb6-4028-9e9b-649e5ee84f4f	2026-01-12 00:58:57.419002+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_APPROVE_USER	1acc0bdc-55e5-4036-9a2f-8efd347d1e5b	{"username": "Barce"}
f0fbfa17-7f02-47ff-b586-40decac06920	2026-01-12 01:03:27.046429+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_DELETE_USER	1acc0bdc-55e5-4036-9a2f-8efd347d1e5b	{"deleted_id": "1acc0bdc-55e5-4036-9a2f-8efd347d1e5b"}
8e2e2074-deb8-4b79-bc53-104de61d5585	2026-01-12 08:10:31.999118+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
5276e4e6-c393-4253-b181-36647022ce6d	2026-01-12 10:14:40.838097+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
90c1463f-a9c8-4dab-8191-1fcd7e23ef41	2026-01-12 13:10:15.627909+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
09d33563-b512-4d2f-a64c-ca82c78428a8	2026-01-12 13:54:29.195307+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
7b7bea1b-dd28-415c-bba1-f783043dd7e0	2026-01-13 08:17:05.946862+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
3438b429-e573-404b-8dba-165d56e47e48	2026-01-13 10:18:32.531978+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
76ca55a9-0553-47f5-849a-753f8629e342	2026-01-13 10:32:00.928969+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
d277a632-c90e-4d8b-add2-519baa8614e3	2026-01-13 12:18:02.348083+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_APPROVE_USER	60b18c8c-4f75-4382-b058-06c3f6e4dc28	{"username": "Barce"}
f9fbeb80-676d-4396-9d11-c9afadd7397d	2026-01-13 18:30:05.023665+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_APPROVE_USER	83d7a5ba-932f-4093-a31e-2c7820ba0af5	{"username": "John Doe"}
62e8327c-66c2-48d8-9443-c6e793012216	2026-01-13 18:31:37.777871+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
5f4bb67d-05e6-4146-8d36-3dbe068a6da6	2026-01-13 18:38:17.342429+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
b99f48ef-2d61-4376-a332-e3d04fb02073	2026-01-13 18:39:40.569569+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
dd9eabcf-db60-4be0-9137-bec5a47c35e1	2026-01-13 18:41:16.312161+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
c123e93b-fdf2-4132-a5cf-55c54e2809ce	2026-01-13 18:48:38.601325+00	83d7a5ba-932f-4093-a31e-2c7820ba0af5	USER_LOGIN	83d7a5ba-932f-4093-a31e-2c7820ba0af5	{"email": "johndoe2k01@gmail.com"}
a8b8ff07-cea9-487c-828b-f9cce6e5d73b	2026-01-13 18:53:34.598888+00	83d7a5ba-932f-4093-a31e-2c7820ba0af5	MATCH_CREATE	22	{"t1": ["Barce", "Alvaro"], "t2": ["Carlos", "John Doe"], "winner": 2}
0703b909-f170-43ee-85af-56f586040abf	2026-01-13 19:09:13.080139+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
6ed1d32e-421a-4f32-9e9e-968b4d56ece0	2026-01-13 19:30:18.674481+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
84d47a3c-aa82-4e78-a3a2-bad7818d3cd3	2026-01-13 19:33:41.234922+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_REJECT	22	{"reason": "Testing", "match_snapshot": {"id": 22, "t1p1": {"username": "Barce"}, "t1p2": {"username": "Alvaro"}, "t2p1": {"username": "Carlos"}, "t2p2": {"username": "John Doe"}, "score": [{"t1": 0, "t2": 7}, {"t1": 7, "t2": 7}, {"t1": 7, "t2": 0}], "status": "pending", "team1_p1": "60b18c8c-4f75-4382-b058-06c3f6e4dc28", "team1_p2": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team2_p1": "3801a795-759b-42a2-85d3-7771f2aa923d", "team2_p2": "83d7a5ba-932f-4093-a31e-2c7820ba0af5", "commentary": "Klasse Spiel!!!", "created_at": "2026-01-13T18:53:34.279934+00:00", "created_by": "83d7a5ba-932f-4093-a31e-2c7820ba0af5", "winner_team": 2}}
367894d4-58d3-4a38-a7e4-22cf821e8598	2026-01-13 22:35:56.271844+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
6a4e891b-bd27-45e0-b2a8-9aaed7ea21ad	2026-01-13 22:36:59.304854+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_DELETE_USER	60b18c8c-4f75-4382-b058-06c3f6e4dc28	{"deleted_id": "60b18c8c-4f75-4382-b058-06c3f6e4dc28"}
e71d7c3c-fe22-4e28-b443-68e182f3dbd9	2026-01-13 23:02:15.370935+00	6331ce5b-9438-4615-9d98-03259fb94ecb	USER_LOGIN	6331ce5b-9438-4615-9d98-03259fb94ecb	{"email": "camase@hotmail.com"}
830abf84-f084-4080-b96d-ee8d369b0172	2026-01-13 23:03:50.340953+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
78715991-1c81-4721-b03a-15b22f409630	2026-01-13 23:04:05.976711+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_APPROVE_USER	6331ce5b-9438-4615-9d98-03259fb94ecb	{"username": "Barce"}
8214701c-bfec-46f9-9164-8b3ac8313982	2026-01-14 00:19:15.264016+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
de1384e3-53d2-44e2-8ed6-5e78eb3ad2d8	2026-01-14 07:57:14.511066+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
5de474a8-e82e-4386-9db7-6437d828ccd7	2026-01-14 08:04:43.036123+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	23	{"t1": ["Alvaro", "Barce"], "t2": ["Carlos", "Maria"], "winner": 1}
f2118f21-0fcd-4964-b879-2d5d56abaf3b	2026-01-14 08:05:35.806519+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
13420603-6086-41ab-88ed-2e5b11544463	2026-01-14 13:01:09.659635+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
8be969f9-beef-4d95-909e-12f0893d1873	2026-01-14 13:18:11.046634+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_MATCH_CREATE	8	{"t1": ["Barce", "Alvaro"], "t2": ["Maria", "Carlos"], "winner": 1}
69775fc5-92e8-421c-bd13-3ca345782ca7	2026-01-14 13:19:34.655554+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
7bcc4cfd-7306-419d-aac6-089e002b1df4	2026-01-14 13:21:10.003006+00	14244878-d464-469e-8204-e5e5803960ff	USER_LOGIN	14244878-d464-469e-8204-e5e5803960ff	{"email": "yube.usk@gmail.com"}
9ac2273b-a1f3-4041-bd5e-2737e0b1fc93	2026-01-14 08:05:49.814408+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_DELETE_MATCH	23	{"original_match": {"id": 23, "score": [{"t1": 6, "t2": 3}, {"t1": 0, "t2": 0}, {"t1": 0, "t2": 0}], "status": "pending", "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "team2_p1": "3801a795-759b-42a2-85d3-7771f2aa923d", "team2_p2": "14244878-d464-469e-8204-e5e5803960ff", "commentary": null, "created_at": "2026-01-14T08:04:42.878097+00:00", "created_by": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "winner_team": 1, "elo_snapshot": {"t1p1": 1174, "t1p2": 1174, "t2p1": 1126, "t2p2": 1126}, "auto_confirm_at": "2026-01-15T08:04:42.878097+00:00"}}
6b280030-a94c-4d9a-ad39-3b37a0302f51	2026-01-14 08:06:07.91986+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
534457bb-10c2-4e8a-b46b-8dd9be0cb13f	2026-01-14 08:14:09.30492+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	24	{"t1": ["Alvaro", "Barce"], "t2": ["Carlos", "Maria"], "winner": 1}
8c1cdfac-766d-47d9-9be0-f557a46c84c7	2026-01-14 08:15:00.202835+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_DELETE_MATCH	24	{"original_match": {"id": 24, "score": [{"t1": 6, "t2": 2}, {"t1": 0, "t2": 0}, {"t1": 0, "t2": 0}], "status": "pending", "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "team2_p1": "3801a795-759b-42a2-85d3-7771f2aa923d", "team2_p2": "14244878-d464-469e-8204-e5e5803960ff", "commentary": null, "created_at": "2026-01-14T08:14:09.084074+00:00", "created_by": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "winner_team": 1, "elo_snapshot": {"t1p1": 1160, "t1p2": 1160, "t2p1": 1140, "t2p2": 1140}, "auto_confirm_at": "2026-01-15T08:14:09.084074+00:00"}}
d77b72bb-4211-4708-8c7b-1bbf56944388	2026-01-14 09:53:07.690815+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
e144e089-a403-4e29-a2cc-95fac7a2be25	2026-01-14 09:56:18.697731+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
55c7e986-9885-4ab4-90a9-1eb4d410a3ba	2026-01-14 10:01:46.272992+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
f6bb91ae-98a4-40d8-9847-ff425dab462b	2026-01-14 10:41:04.146185+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
23c4d19a-c6ef-4cbd-8d3d-a52ec42d7e2c	2026-01-14 10:42:50.517595+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
31911cbf-5887-44b8-8f98-6ec03d7732a6	2026-01-14 10:51:47.02721+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	25	{"t1": ["Alvaro", "Barce"], "t2": ["Carlos", "Maria"], "winner": 1}
25b0c85d-c5b0-4aa8-9dd2-ff9445210cae	2026-01-14 11:07:44.752875+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	2	{"t1": ["Alvaro", "Carlos"], "t2": ["Barce", "Maria"], "winner": 1}
74b4e8cd-54ff-45cd-a814-d63c3b593b1e	2026-01-14 11:16:06.704984+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	3	{"t1": ["Alvaro", "Barce"], "t2": ["Carlos", "Maria"], "winner": 1}
55b7f315-091c-473d-8691-eecfe3f495c2	2026-01-14 11:30:46.525022+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	4	{"t1": ["Alvaro", "Barce"], "t2": ["Carlos", "Maria"], "winner": 1}
c00b1d0e-cfa3-4c83-b9ae-68d85deb6f55	2026-01-14 11:39:11.04966+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	5	{"t1": ["Alvaro", "Barce"], "t2": ["Carlos", "Maria"], "winner": 1}
30cbbb65-3f52-485e-b14a-e470c331db6e	2026-01-14 11:41:50.965605+00	14244878-d464-469e-8204-e5e5803960ff	USER_LOGIN	14244878-d464-469e-8204-e5e5803960ff	{"email": "yube.usk@gmail.com"}
601feedc-6587-4b68-a661-4203d6cb5ded	2026-01-14 11:43:29.02536+00	14244878-d464-469e-8204-e5e5803960ff	MATCH_CONFIRM	5	{}
5f78aaf0-caca-4ce1-82c4-6fb5c47c6f65	2026-01-14 11:47:34.040804+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
9864009d-074b-46b4-8a47-3f19a3efe3a2	2026-01-14 11:55:27.307528+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
f6255911-4c98-4d2d-ba14-31864d286c38	2026-01-14 11:57:21.295974+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_DELETE_MATCH	5	{"original_match": {"id": 5, "score": [{"t1": 6, "t2": 3}, {"t1": 6, "t2": 3}, {"t1": 0, "t2": 0}], "status": "confirmed", "club_id": 1, "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "team2_p1": "3801a795-759b-42a2-85d3-7771f2aa923d", "team2_p2": "14244878-d464-469e-8204-e5e5803960ff", "commentary": null, "created_at": "2026-01-14T11:39:10.898989+00:00", "created_by": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "winner_team": 1, "elo_snapshot": {"t1p1": 1174, "t1p2": 1174, "t2p1": 1126, "t2p2": 1126}, "auto_confirm_at": "2026-01-15T11:39:10.898989+00:00"}}
d704d09c-7bec-463f-b21c-836ea0ed8624	2026-01-14 12:11:30.825992+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_MATCH_CREATE	6	{"t1": ["Alvaro", "Barce"], "t2": ["Carlos", "Maria"], "winner": 1}
27a7a86e-8038-4f77-9584-7e00ba251673	2026-01-14 12:12:35.619133+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
992bef5e-d4e8-47ed-a273-1fddeed747dd	2026-01-14 12:17:31.742117+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
bccef7e9-8dca-45e3-b99a-7269e8f99059	2026-01-14 12:18:01.012978+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_DELETE_MATCH	6	{"original_match": {"id": 6, "score": [{"t1": 6, "t2": 3}, {"t1": 6, "t2": 3}, {"t1": 0, "t2": 0}], "status": "confirmed", "club_id": null, "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "team2_p1": "3801a795-759b-42a2-85d3-7771f2aa923d", "team2_p2": "14244878-d464-469e-8204-e5e5803960ff", "commentary": null, "created_at": "2026-01-14T12:11:30.42566+00:00", "created_by": "8adcf3fc-a01c-4078-8c01-51696e12d18e", "winner_team": 1, "elo_snapshot": {"t1p1": 1174, "t1p2": 1174, "t2p1": 1126, "t2p2": 1126}, "auto_confirm_at": "2026-01-15T12:11:30.42566+00:00"}}
816e662a-3ab1-490c-8870-bf94b3f3c299	2026-01-14 12:20:29.146129+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
177945c8-64f7-4c15-a7b7-e840190cd683	2026-01-14 12:29:32.137062+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_MATCH_CREATE	7	{"t1": ["Alvaro", "Barce"], "t2": ["Carlos", "Maria"], "winner": 1}
73ca440d-87f4-4154-97dc-205aeec856b2	2026-01-14 12:29:57.631854+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_DELETE_MATCH	7	{"original_match": {"id": 7, "score": [{"t1": 6, "t2": 3}, {"t1": 6, "t2": 3}, {"t1": 0, "t2": 0}], "status": "confirmed", "club_id": null, "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "team2_p1": "3801a795-759b-42a2-85d3-7771f2aa923d", "team2_p2": "14244878-d464-469e-8204-e5e5803960ff", "commentary": null, "created_at": "2026-01-14T12:29:31.843003+00:00", "created_by": "8adcf3fc-a01c-4078-8c01-51696e12d18e", "winner_team": 1, "elo_snapshot": {"t1p1": 1174, "t1p2": 1174, "t2p1": 1126, "t2p2": 1126}, "auto_confirm_at": "2026-01-15T12:29:31.843003+00:00"}}
398382b3-67ce-4422-865d-d6eaf19041a4	2026-01-14 12:37:53.619623+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
a86f6647-e936-4c15-b74e-effcbec0d347	2026-01-14 12:40:35.199871+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
c5a7f7ec-ad33-4a38-9b3b-c17e04bcd797	2026-01-14 12:52:05.032939+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
34e58759-315f-451b-8f36-ec72561bbd56	2026-01-14 13:23:56.155646+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
dfdd1a37-7bf7-4f92-a2a7-e70df8662c9d	2026-01-14 13:26:09.720097+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_DELETE_MATCH	8	{"original_match": {"id": 8, "score": [{"t1": 6, "t2": 4}, {"t1": 6, "t2": 2}, {"t1": 0, "t2": 0}], "status": "confirmed", "club_id": null, "team1_p1": "6331ce5b-9438-4615-9d98-03259fb94ecb", "team1_p2": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team2_p1": "14244878-d464-469e-8204-e5e5803960ff", "team2_p2": "3801a795-759b-42a2-85d3-7771f2aa923d", "commentary": null, "created_at": "2026-01-14T13:18:10.738222+00:00", "created_by": "8adcf3fc-a01c-4078-8c01-51696e12d18e", "winner_team": 1, "elo_snapshot": {"t1p1": 1174, "t1p2": 1174, "t2p1": 1126, "t2p2": 1126}, "auto_confirm_at": "2026-01-15T13:18:10.738222+00:00"}}
bcb55a35-eea4-428e-9be5-a53c9f737d52	2026-01-14 13:26:50.398583+00	14244878-d464-469e-8204-e5e5803960ff	USER_LOGIN	14244878-d464-469e-8204-e5e5803960ff	{"email": "yube.usk@gmail.com"}
fe8c94e1-957f-40de-a120-7a2faaced925	2026-01-14 13:29:02.203731+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
375779d0-4c90-4b9c-962c-9b9bc9d61429	2026-01-14 13:33:22.975954+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_MATCH_CREATE	9	{"t1": ["Alvaro", "Barce"], "t2": ["Maria", "Carlos"], "winner": 1}
5d081b07-fe60-4741-81ae-29f02e736f7a	2026-01-14 13:33:50.664093+00	14244878-d464-469e-8204-e5e5803960ff	USER_LOGIN	14244878-d464-469e-8204-e5e5803960ff	{"email": "yube.usk@gmail.com"}
4ff4e56c-e1ec-4d78-a10d-722791b02991	2026-01-14 13:35:24.242505+00	3801a795-759b-42a2-85d3-7771f2aa923d	USER_LOGIN	3801a795-759b-42a2-85d3-7771f2aa923d	{"email": "caryuse@gmail.com"}
098eef9a-3e3e-41d7-afae-479d40d6796c	2026-01-14 13:36:00.379482+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
760c1064-7e80-4b8d-a896-4a7c24a2c563	2026-01-14 13:36:10.434286+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_DELETE_MATCH	9	{"original_match": {"id": 9, "score": [{"t1": 6, "t2": 4}, {"t1": 6, "t2": 3}, {"t1": 0, "t2": 0}], "status": "confirmed", "club_id": null, "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "team2_p1": "14244878-d464-469e-8204-e5e5803960ff", "team2_p2": "3801a795-759b-42a2-85d3-7771f2aa923d", "commentary": null, "created_at": "2026-01-14T13:33:22.702538+00:00", "created_by": "8adcf3fc-a01c-4078-8c01-51696e12d18e", "winner_team": 1, "elo_snapshot": {"t1p1": 1174, "t1p2": 1174, "t2p1": 1126, "t2p2": 1126}, "auto_confirm_at": "2026-01-15T13:33:22.702538+00:00"}}
70cc7c7d-b733-45ab-86e7-3906c06de21c	2026-01-14 13:37:00.937494+00	14244878-d464-469e-8204-e5e5803960ff	USER_LOGIN	14244878-d464-469e-8204-e5e5803960ff	{"email": "yube.usk@gmail.com"}
9ab2ca78-c1c2-46eb-a4b5-887f0b3e5a13	2026-01-14 13:47:07.605596+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
f1014265-550e-43e5-867b-e73f712ac2fb	2026-01-14 13:47:35.266666+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_MATCH_CREATE	10	{"t1": ["Alvaro", "Barce"], "t2": ["Carlos", "Maria"], "winner": 1}
a7b62ed8-f680-422f-a039-c105d604feb8	2026-01-14 13:48:30.601027+00	14244878-d464-469e-8204-e5e5803960ff	USER_LOGIN	14244878-d464-469e-8204-e5e5803960ff	{"email": "yube.usk@gmail.com"}
09c8ea66-e513-4f0f-9b11-fd4003405992	2026-01-14 13:49:19.489462+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
71b14233-bee1-4bb4-8374-5b80748fbe0a	2026-01-14 13:49:28.430597+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_DELETE_MATCH	10	{"original_match": {"id": 10, "score": [{"t1": 6, "t2": 3}, {"t1": 6, "t2": 3}, {"t1": 0, "t2": 0}], "status": "confirmed", "club_id": null, "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "team2_p1": "3801a795-759b-42a2-85d3-7771f2aa923d", "team2_p2": "14244878-d464-469e-8204-e5e5803960ff", "commentary": null, "created_at": "2026-01-14T13:47:35.027833+00:00", "created_by": "8adcf3fc-a01c-4078-8c01-51696e12d18e", "winner_team": 1, "elo_snapshot": {"t1p1": 1174, "t1p2": 1174, "t2p1": 1126, "t2p2": 1126}, "auto_confirm_at": "2026-01-15T13:47:35.027833+00:00"}}
e0137766-f9cd-4838-88ca-2b2d8cec719c	2026-01-14 13:57:00.230636+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
ecc7bda4-0656-4fee-8dca-1611226ed8d8	2026-01-14 14:00:30.044865+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
07d63554-a2c7-4427-b795-05dc6f585e0b	2026-01-14 18:31:19.388422+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
e0fbaa57-9be7-4615-ae00-db4fd75dedcc	2026-01-14 19:42:38.407786+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
3c7cb373-9f05-4b4b-90f9-27bd933982c4	2026-01-15 07:24:10.809283+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
3f80396c-d23a-4cac-bc04-09edc7abcf41	2026-01-15 12:02:46.958242+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
fe685768-7387-45ea-9edf-1c75c86492b0	2026-01-15 12:18:05.283596+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
758a92e9-17fa-4d6c-af66-a24c0f32851f	2026-01-15 12:20:22.358283+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
3367d201-ef56-4135-80f4-901eb8919440	2026-01-15 14:50:14.762374+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
e1252f2b-a281-476a-81f8-90319d51566e	2026-01-16 16:46:15.087118+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
4dffeefb-7839-4975-b720-4adff170110b	2026-01-16 16:46:49.192214+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
a81e8abf-4c2f-40f2-87bb-90ca39540506	2026-01-16 18:43:57.379273+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
861af7e5-cc38-4df3-abaf-4c3c941c87c0	2026-01-16 21:07:00.933935+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
b474245e-cbb8-4d53-b4a1-346c317d485b	2026-01-16 21:21:24.097781+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
c774f7ae-642c-4b24-9187-6cd826e325af	2026-01-16 21:34:35.557018+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
5577e805-e528-4dee-ac2a-30e2ca486a6f	2026-01-16 23:10:43.2236+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
3823c2b1-93dc-4f86-9d63-6a56b2075c46	2026-01-16 23:11:39.420224+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
d7df488e-82e2-4917-b83a-97de79a4d61b	2026-01-17 08:50:23.653275+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
e32bc050-2070-49bf-a259-42fbe3a5dd95	2026-01-17 08:52:14.003453+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
a1008d8b-9632-4a0a-8382-6f3a11974c2c	2026-01-17 09:26:45.588447+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
0e99c0bc-417d-4c0d-bbf9-aa1a7d4799db	2026-01-17 10:41:31.848615+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
815144bb-0cc8-4061-bee7-2d8968d1fd70	2026-01-17 10:53:15.486348+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
5a17cb58-3e98-49f6-8335-8e9f01dce4ca	2026-01-17 11:08:33.58929+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
2340d773-e0d1-416d-9b34-1ba092b5863d	2026-01-17 11:08:48.77613+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_APPROVE_USER	5b339065-758c-401b-bc4e-856a83a0d55d	{"username": "Victor"}
ae6a4bf9-92dc-4055-aa23-e90852efd809	2026-01-17 11:16:31.752685+00	5b339065-758c-401b-bc4e-856a83a0d55d	USER_LOGIN	5b339065-758c-401b-bc4e-856a83a0d55d	{"email": "victorcermeno@hotmail.com"}
a904e6b3-03b8-4217-8fb1-6bb3caf5b89d	2026-01-17 11:41:13.876439+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
9c17cbc0-a8e5-4fdf-97a4-6be812a59172	2026-01-17 12:52:18.050224+00	5b339065-758c-401b-bc4e-856a83a0d55d	MATCH_CREATE	11	{"t1": ["Alvaro", "Barce"], "t2": ["Carlos", "John Doe"], "winner": 1}
5c201610-181d-41af-83cc-d5a2d6ce13ba	2026-01-17 13:03:47.536666+00	5b339065-758c-401b-bc4e-856a83a0d55d	MATCH_CREATE	12	{"t1": ["Alvaro", "Barce"], "t2": ["Carlos", "Maria"], "winner": 2}
544206dd-ecfb-4003-a905-375274d40548	2026-01-17 13:04:28.17755+00	5b339065-758c-401b-bc4e-856a83a0d55d	MATCH_CREATE	13	{"t1": ["Victor", "Carlos"], "t2": ["John Doe", "Alvaro"], "winner": 1}
85579ba0-b850-40e6-a50b-46a09423d691	2026-01-17 13:06:27.263559+00	5b339065-758c-401b-bc4e-856a83a0d55d	MATCH_CREATE	14	{"t1": ["Alvaro", "Victor"], "t2": ["John Doe", "Barce"], "winner": 2}
0f7d9507-9486-4266-bd2d-8a6c8f9e20bd	2026-01-17 13:36:09.1658+00	5b339065-758c-401b-bc4e-856a83a0d55d	USER_LOGIN	5b339065-758c-401b-bc4e-856a83a0d55d	{"email": "victorcermeno@hotmail.com"}
23526399-4410-4536-a4b8-0cdf2190dad6	2026-01-17 16:19:48.446378+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
3bd78498-9771-4953-9cc8-b960dd41e22d	2026-01-17 16:52:28.150049+00	5b339065-758c-401b-bc4e-856a83a0d55d	USER_LOGIN	5b339065-758c-401b-bc4e-856a83a0d55d	{"email": "victorcermeno@hotmail.com"}
494219ec-4e7c-4af8-b77c-fb6657bd6dbb	2026-01-17 20:19:14.442827+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
1f949271-2010-4547-af7b-6bce53f287fa	2026-01-17 22:47:21.377807+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_REJECT	11	{"reason": "admin/alvaro", "match_snapshot": {"id": 11, "score": [{"t1": 6, "t2": 1}, {"t1": 6, "t2": 0}, {"t1": 0, "t2": 0}], "status": "pending", "club_id": null, "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "team2_p1": "3801a795-759b-42a2-85d3-7771f2aa923d", "team2_p2": "83d7a5ba-932f-4093-a31e-2c7820ba0af5", "commentary": "Epic comeback", "created_at": "2026-01-17T12:52:17.35609+00:00", "created_by": "5b339065-758c-401b-bc4e-856a83a0d55d", "winner_team": 1, "elo_snapshot": {"t1p1": 1174, "t1p2": 1174, "t2p1": 1126, "t2p2": 1126}, "auto_confirm_at": "2026-01-18T12:52:17.35609+00:00"}}
0fbe5c12-3b23-4aba-bf9d-752829154608	2026-01-17 22:47:22.049541+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_REJECT	11	{"reason": "admin/alvaro", "match_snapshot": {"id": 11, "t1p1": {"username": "Alvaro"}, "t1p2": {"username": "Barce"}, "t2p1": {"username": "Carlos"}, "t2p2": {"username": "John Doe"}, "score": [{"t1": 6, "t2": 1}, {"t1": 6, "t2": 0}, {"t1": 0, "t2": 0}], "status": "pending", "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "team2_p1": "3801a795-759b-42a2-85d3-7771f2aa923d", "team2_p2": "83d7a5ba-932f-4093-a31e-2c7820ba0af5", "commentary": "Epic comeback", "created_at": "2026-01-17T12:52:17.35609+00:00", "created_by": "5b339065-758c-401b-bc4e-856a83a0d55d", "winner_team": 1}}
daa9bfba-6efa-4b0b-81f5-be53d606aee7	2026-01-17 23:13:04.673514+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
185b6a80-9e33-4794-9f0d-2a33a7e36cf6	2026-01-17 23:13:24.886631+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
746d3112-3ad1-41b8-b0f7-9e5e6b3127ec	2026-01-17 23:14:24.873567+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
c2a25cf1-d92f-473b-952f-2afcc8fbf2ef	2026-01-17 23:17:13.069563+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
9a968ed4-bb92-4e52-bf22-fb985011e725	2026-01-18 08:21:37.401835+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
678b2d20-1951-4fa1-909f-b01ade3d1805	2026-01-18 09:02:50.879713+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
3f81f944-7e9c-4f77-baa3-0ddf7e92b6c6	2026-01-18 10:48:45.096998+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
01ec3ace-c449-4142-88fb-cc45fc498c45	2026-01-18 11:06:04.099305+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CONFIRM	12	{}
fa0f1715-4941-465a-aeb9-8409f0a92a78	2026-01-18 12:21:00.32936+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
a7bdb446-bc91-400d-a986-e8141d53a5b7	2026-01-18 12:26:09.240493+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
27102804-021d-4aa8-9ed2-89d08ff600eb	2026-01-18 12:54:53.060016+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	15	{"t1": ["Alvaro", "Barce"], "t2": ["Victor", "John Doe"], "winner": 1}
c6b2275c-dde0-4219-a4fb-ef3b106ac3b8	2026-01-18 13:05:16.321212+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	16	{"t1": ["Alvaro", "Barce"], "t2": ["John Doe", "Carlos"], "winner": 2}
bd66a405-86d9-4f23-a3b0-f884895d8342	2026-01-18 13:05:44.20439+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
01f60b22-7e78-40de-a7a4-7aca84fb8504	2026-01-18 13:06:41.708667+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
b9cfcd31-8f2f-4a62-88d2-9f9588770334	2026-01-18 13:09:29.231312+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_DELETE_MATCH	16	{"original_match": {"id": 16, "score": [{"t1": 0, "t2": 6}, {"t1": 0, "t2": 6}, {"t1": 0, "t2": 0}], "status": "pending", "club_id": 1, "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "team2_p1": "83d7a5ba-932f-4093-a31e-2c7820ba0af5", "team2_p2": "3801a795-759b-42a2-85d3-7771f2aa923d", "commentary": null, "created_at": "2026-01-18T13:05:16.099039+00:00", "created_by": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "winner_team": 2, "elo_snapshot": {"t1p1": 1104, "t1p2": 1104, "t2p1": 1172, "t2p2": 1196}, "auto_confirm_at": "2026-01-19T13:05:16.099039+00:00"}}
2e976827-1fb7-44a2-baa9-d1259859fb63	2026-01-18 13:43:03.69655+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
952d676b-6a60-4411-872d-de6f767b0798	2026-01-18 13:50:44.961457+00	3801a795-759b-42a2-85d3-7771f2aa923d	USER_LOGIN	3801a795-759b-42a2-85d3-7771f2aa923d	{"email": "caryuse@gmail.com"}
a5dee629-54fa-4e7b-9966-047a1ba12731	2026-01-18 14:10:29.237578+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
fd1e354a-223d-4548-90cb-9a001d9c69b3	2026-01-18 14:12:27.486229+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	17	{"t1": ["Alvaro", "Barce"], "t2": ["Carlos", "John Doe"], "winner": 1}
1704f720-02c8-4e2d-9dda-f541812a05e0	2026-01-18 14:13:13.489854+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	18	{"t1": ["Alvaro", "Victor"], "t2": ["Maria", "Carlos"], "winner": 2}
795d038e-d044-4037-809a-cbc1b390940f	2026-01-18 14:14:01.790213+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	19	{"t1": ["Alvaro", "Carlos"], "t2": ["Barce", "Victor"], "winner": 1}
46f7b476-f4aa-41cc-8c50-cabe2709d67b	2026-01-18 14:15:38.072152+00	6331ce5b-9438-4615-9d98-03259fb94ecb	USER_LOGIN	6331ce5b-9438-4615-9d98-03259fb94ecb	{"email": "camase@hotmail.com"}
3bc97ee6-32b5-48cf-817a-6d917c8a33b5	2026-01-18 14:15:52.964815+00	6331ce5b-9438-4615-9d98-03259fb94ecb	MATCH_CONFIRM	19	{}
b72bd269-38e5-449f-84b4-78e8ad45daf7	2026-01-18 14:16:45.07832+00	14244878-d464-469e-8204-e5e5803960ff	USER_LOGIN	14244878-d464-469e-8204-e5e5803960ff	{"email": "yube.usk@gmail.com"}
367c20c8-208b-434a-8f25-b5bb9236622d	2026-01-18 14:16:55.501242+00	14244878-d464-469e-8204-e5e5803960ff	MATCH_CONFIRM	18	{}
8d06c190-ea40-4de7-8b39-a5225035a988	2026-01-18 14:17:51.553827+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
d10e0c44-58bc-4332-abad-8c7e7e52e6d8	2026-01-18 14:38:59.907983+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	20	{"t1": ["Alvaro", "John Doe"], "t2": ["Maria", "Barce"], "winner": 1}
792de522-c29a-475e-91e8-f85f9b60341e	2026-01-18 14:39:38.263537+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	21	{"t1": ["Alvaro", "Carlos"], "t2": ["Maria", "Barce"], "winner": 2}
6bef8c7e-28b8-474f-b8c3-fc0c23d52010	2026-01-18 14:40:18.563594+00	6331ce5b-9438-4615-9d98-03259fb94ecb	USER_LOGIN	6331ce5b-9438-4615-9d98-03259fb94ecb	{"email": "camase@hotmail.com"}
2f754172-f3f9-4c89-980e-03819e00e616	2026-01-18 14:40:41.461195+00	6331ce5b-9438-4615-9d98-03259fb94ecb	MATCH_CONFIRM	20	{}
b0b023fa-4457-45d7-8b6a-af0f4372acba	2026-01-18 14:41:00.547002+00	6331ce5b-9438-4615-9d98-03259fb94ecb	MATCH_CONFIRM	21	{}
ee09a9ae-ce51-4a0a-81a3-9784bf8fc389	2026-01-18 14:44:58.534458+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
584c5df5-1d18-4d4b-8238-985a89540b0a	2026-01-18 14:45:49.567922+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	22	{"t1": ["Alvaro", "Victor"], "t2": ["Carlos", "Maria"], "winner": 1}
0d207063-58c7-4789-b9f1-b3d9b23ded9c	2026-01-18 14:51:46.577316+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	23	{"t1": ["Alvaro", "Barce"], "t2": ["Victor", "Maria"], "winner": 1}
49745f38-991e-4ab3-a5f6-6f35e3626a29	2026-01-18 14:55:02.284206+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
f22ada8a-0af3-4088-a0b3-5f697e5a34a9	2026-01-18 15:09:44.600487+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
7c99f9a8-46b8-4a36-bf99-1057fe7f488b	2026-01-18 18:10:23.174184+00	5b339065-758c-401b-bc4e-856a83a0d55d	USER_LOGIN	5b339065-758c-401b-bc4e-856a83a0d55d	{"email": "victorcermeno@hotmail.com"}
33699c7f-2879-406c-9ddd-5547cf820bf5	2026-01-18 18:11:41.824012+00	5b339065-758c-401b-bc4e-856a83a0d55d	MATCH_REJECT	23	{"reason": "totally false result", "match_snapshot": {"id": 23, "score": [{"t1": 6, "t2": 4}, {"t1": 6, "t2": 2}, {"t1": 0, "t2": 0}], "status": "pending", "club_id": 1, "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "team2_p1": "5b339065-758c-401b-bc4e-856a83a0d55d", "team2_p2": "14244878-d464-469e-8204-e5e5803960ff", "commentary": null, "created_at": "2026-01-18T14:51:46.425534+00:00", "created_by": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "winner_team": 1, "elo_snapshot": {"t1p1": 1172, "t1p2": 1176, "t2p1": 1126, "t2p2": 1128}, "auto_confirm_at": "2026-01-19T14:51:46.425534+00:00"}}
7dacf2a4-ebb8-4c83-9d2e-db4ba2ca15ed	2026-01-18 18:11:42.691555+00	5b339065-758c-401b-bc4e-856a83a0d55d	MATCH_REJECT	23	{"reason": "totally false result", "match_snapshot": {"id": 23, "t1p1": {"username": "Alvaro"}, "t1p2": {"username": "Barce"}, "t2p1": {"username": "Victor"}, "t2p2": {"username": "Maria"}, "score": [{"t1": 6, "t2": 4}, {"t1": 6, "t2": 2}, {"t1": 0, "t2": 0}], "status": "pending", "creator": {"username": "Alvaro"}, "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "team2_p1": "5b339065-758c-401b-bc4e-856a83a0d55d", "team2_p2": "14244878-d464-469e-8204-e5e5803960ff", "commentary": null, "created_at": "2026-01-18T14:51:46.425534+00:00", "created_by": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "winner_team": 1}}
3d8390da-ade2-4688-bfb1-69f5295d4ee1	2026-01-18 20:15:42.991026+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
78f44c39-34ce-48fe-9841-76e33339bd1d	2026-01-18 20:21:29.955323+00	14244878-d464-469e-8204-e5e5803960ff	USER_LOGIN	14244878-d464-469e-8204-e5e5803960ff	{"email": "yube.usk@gmail.com"}
ad410c6e-d219-4a6d-a017-ca647a0e3b8c	2026-01-18 20:21:48.040841+00	14244878-d464-469e-8204-e5e5803960ff	MATCH_CONFIRM	22	{}
95f2cb80-b83d-46a5-ad84-19d642a49af7	2026-01-18 20:27:03.714817+00	14244878-d464-469e-8204-e5e5803960ff	MATCH_CREATE	24	{"t1": ["Alvaro", "John Doe"], "t2": ["Maria", "Barce"], "winner": 1}
768b217a-0deb-4e2b-a09c-93930cb1a2f1	2026-01-18 20:36:29.979059+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
96550bd1-1700-400c-9f2c-e617d5a0def4	2026-01-18 22:42:42.29717+00	5b339065-758c-401b-bc4e-856a83a0d55d	USER_LOGIN	5b339065-758c-401b-bc4e-856a83a0d55d	{"email": "victorcermeno@hotmail.com"}
df25a2b8-ae93-4ef9-9b36-f1d58104fce1	2026-01-19 09:04:48.95769+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
e5e9c253-410c-4157-83d9-ca5985bfd6fe	2026-01-19 09:07:53.006833+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
f720899e-f77d-4dab-9fcc-1619e370f1bd	2026-01-19 09:12:05.057959+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	USER_LOGIN	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"email": "alvaro90barcelona@gmail.com"}
282e6e57-1d9b-4dc4-bb55-8da327f88c57	2026-01-19 09:49:13.179614+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
7de81506-76d4-4d68-a08c-f13984e5c2a8	2026-01-19 09:50:51.88723+00	14244878-d464-469e-8204-e5e5803960ff	USER_LOGIN	14244878-d464-469e-8204-e5e5803960ff	{"email": "yube.usk@gmail.com"}
b4ad3e0f-4f96-4237-bab5-0d3dc50c655a	2026-01-19 09:57:12.754078+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	25	{"t1": ["Alvaro", "Carlos"], "t2": ["Barce", "Maria"], "winner": 1}
5642f131-4f38-4748-8596-23413344bff3	2026-01-19 10:32:55.972279+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
503d9131-15ca-484d-9761-2d759a9f9b5e	2026-01-19 10:47:53.906744+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	26	{"t1": ["Alvaro", "John Doe"], "t2": ["Maria", "Barce"], "winner": 2}
67903d80-a701-458e-a9f8-def34822355b	2026-01-19 10:48:16.079081+00	6331ce5b-9438-4615-9d98-03259fb94ecb	USER_LOGIN	6331ce5b-9438-4615-9d98-03259fb94ecb	{"email": "camase@hotmail.com"}
77dde64d-2bef-4eba-920d-bb3083cea7b1	2026-01-19 10:49:43.948642+00	6331ce5b-9438-4615-9d98-03259fb94ecb	MATCH_REJECT	26	{"reason": "Test policy supabase for delete match in users", "match_snapshot": {"id": 26, "score": [{"t1": 6, "t2": 7}, {"t1": 4, "t2": 6}, {"t1": 0, "t2": 0}], "status": "pending", "club_id": 1, "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "83d7a5ba-932f-4093-a31e-2c7820ba0af5", "team2_p1": "14244878-d464-469e-8204-e5e5803960ff", "team2_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "commentary": null, "created_at": "2026-01-19T10:47:53.755377+00:00", "created_by": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "winner_team": 2, "elo_snapshot": {"t1p1": 1145, "t1p2": 1148, "t2p1": 1155, "t2p2": 1178}, "auto_confirm_at": "2026-01-20T10:47:53.755377+00:00"}}
4f1746b1-1000-4c49-a247-cacc7d7d3012	2026-01-19 10:49:44.524155+00	6331ce5b-9438-4615-9d98-03259fb94ecb	MATCH_REJECT	26	{"reason": "Test policy supabase for delete match in users", "match_snapshot": {"id": 26, "t1p1": {"username": "Alvaro"}, "t1p2": {"username": "John Doe"}, "t2p1": {"username": "Maria"}, "t2p2": {"username": "Barce"}, "score": [{"t1": 6, "t2": 7}, {"t1": 4, "t2": 6}, {"t1": 0, "t2": 0}], "status": "pending", "creator": {"username": "Alvaro"}, "team1_p1": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "team1_p2": "83d7a5ba-932f-4093-a31e-2c7820ba0af5", "team2_p1": "14244878-d464-469e-8204-e5e5803960ff", "team2_p2": "6331ce5b-9438-4615-9d98-03259fb94ecb", "commentary": null, "created_at": "2026-01-19T10:47:53.755377+00:00", "created_by": "d7848f49-4f9b-4b6b-9826-51960ebfb110", "winner_team": 2}}
e12e3a38-198a-4407-b3f7-f5a621b5b765	2026-01-19 11:10:32.481157+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
a0b1ca33-86d8-4d56-ab34-b81bff881999	2026-01-19 13:12:46.410647+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
d51d03fe-318a-4500-b697-a9af02ff3327	2026-01-19 13:18:02.631663+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
3051171e-0a56-4de5-8e19-5259aa437bb1	2026-01-19 13:38:57.914899+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
5b433cb9-813d-4137-b205-28c6c463a26c	2026-01-19 15:31:40.894464+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
3768b962-9d4c-48ce-8b83-4c39041b8ffe	2026-01-19 17:30:42.28154+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	USER_LOGIN	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"email": "camase1990@gmail.com"}
73efd0c7-06ee-42b5-8547-1501bb0ddd30	2026-01-19 19:23:36.630083+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CONFIRM	24	{}
e9cfe9e6-0c90-44bb-a13f-8edc207d209d	2026-01-19 20:32:09.31072+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "gfh"}
921c5510-d5b1-4aaa-a0a8-e462be40f954	2026-01-19 20:32:18.078004+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
584906c3-b263-441a-a583-a1881d06b6d7	2026-01-19 20:34:31.416643+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "barce"}
161305cd-56b6-486f-b138-a62c81afbbc7	2026-01-19 20:34:46.081226+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
980b304d-75a1-4d98-8676-e2e1db805f25	2026-01-19 20:34:59.486906+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
b9742c89-3440-467d-bdc4-f1460d6a9360	2026-01-19 20:36:36.639031+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
5be279e5-e20a-4e54-9cb0-7543766c81ff	2026-01-19 20:59:25.842298+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
8b3d009b-053e-47fc-8588-a16a5fb28f71	2026-01-19 21:44:49.763947+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "alvaro"}
9f5f4f36-c99a-46cd-ad94-4a5629e59233	2026-01-19 21:44:56.099084+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
948b7b40-cfd1-4384-a7f0-5f3d21b3da9e	2026-01-20 10:02:08.928166+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_APPROVE_USER	f850d529-426f-4e60-803e-b98849f0541e	{"username": "Administrator 2"}
e9e5fc46-2848-4e91-bd77-9d94043f2a70	2026-01-20 10:02:28.465991+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_EDIT_USER	f850d529-426f-4e60-803e-b98849f0541e	{"changes": {"elo": 1150, "banned": false, "approved": true, "is_admin": true, "username": "Administrator 2"}}
e214fb9e-c42b-494e-8045-dc05e5b3494e	2026-01-20 10:02:52.229667+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_EDIT_USER	8adcf3fc-a01c-4078-8c01-51696e12d18e	{"changes": {"elo": 0, "banned": false, "approved": true, "is_admin": true, "username": "Administrator 1"}}
217b171d-1095-44b4-9f5e-5e0d20dc43ef	2026-01-20 10:03:08.514642+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_EDIT_USER	f850d529-426f-4e60-803e-b98849f0541e	{"changes": {"elo": 1150, "banned": false, "approved": true, "is_admin": true, "username": "Administrator 2"}}
77f11e4a-1e4d-48f6-bee5-21976bc2f60e	2026-01-20 10:26:20.878227+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Álvaro"}
658e8e76-151d-42ba-aa3f-ae7e12bdbc54	2026-01-20 10:26:30.360165+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
7fe9cd13-4f56-47fc-b9b0-3e59767205b2	2026-01-20 13:55:38.381089+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "alvaro"}
9533d05d-4ff8-40c6-87ed-6524becbd3d0	2026-01-20 13:55:45.506286+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
18e3f28e-3a17-418c-a668-15703635304a	2026-01-20 14:04:31.208056+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
7802e49f-1d3a-4e94-8672-e02d642925a0	2026-01-20 14:04:37.620152+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
7d4319ee-31f0-4ce5-9c17-89b164664de9	2026-01-20 14:08:12.127591+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
33f3f477-b48e-428e-95a7-2cbbb3c07fd4	2026-01-20 14:08:17.668487+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
38119d57-2ff1-424f-a55b-f2b98885adc6	2026-01-20 14:08:29.10124+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Álvaro"}
095ef6d9-3ea7-4b99-8e74-54050d45e4df	2026-01-20 14:08:57.601669+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Álvaroo"}
6293ad7f-4c29-4620-bba2-aabfbdc9443b	2026-01-20 14:09:04.400716+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	PROFILE_UPDATE	d7848f49-4f9b-4b6b-9826-51960ebfb110	{"username": "Alvaro"}
44117e70-2fda-4bd2-94a4-e6d7ef1248aa	2026-01-20 14:18:17.36869+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	MATCH_CREATE	27	{"t1": ["Alvaro", "Carlos"], "t2": ["Barce", "Maria"], "winner": 2}
98879a9f-70bf-4240-83f1-63eaa50dc351	2026-01-20 17:11:12.775935+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_APPROVE_USER	edd5791c-9ee0-45f3-83ac-9e240cc6ee6f	{"username": "Pomfrit "}
15559d0d-0848-4d35-995c-07eff5df5ceb	2026-01-20 19:12:49.913985+00	6331ce5b-9438-4615-9d98-03259fb94ecb	MATCH_CONFIRM	27	{}
d762b4d6-82f3-4953-ad0d-ca1e8f40ba04	2026-01-20 21:36:26.287026+00	5b339065-758c-401b-bc4e-856a83a0d55d	PROFILE_UPDATE	5b339065-758c-401b-bc4e-856a83a0d55d	{"username": "Victor"}
03e26312-7853-46e0-a4c8-12717ec6d8ce	2026-01-20 22:36:08.872744+00	8adcf3fc-a01c-4078-8c01-51696e12d18e	ADMIN_APPROVE_USER	173c8679-41f5-43ed-8f17-5dd6003009ba	{"username": "Javi"}
\.


--
-- Data for Name: clubs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.clubs (id, created_at, name, location) FROM stdin;
1	2026-01-14 09:45:03.836814+00	Hall of Padel | Bs	Braunschweig || Germany
2	2026-01-14 12:34:39.303705+00	Hall of Padel | Wf	Wollfenbüttel || Germany
\.


--
-- Data for Name: friendships; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.friendships (id, user_id_1, user_id_2, status, created_at) FROM stdin;
9	d7848f49-4f9b-4b6b-9826-51960ebfb110	14244878-d464-469e-8204-e5e5803960ff	accepted	2026-01-14 13:20:24.967708+00
11	5b339065-758c-401b-bc4e-856a83a0d55d	d7848f49-4f9b-4b6b-9826-51960ebfb110	accepted	2026-01-17 12:40:25.107678+00
\.


--
-- Data for Name: matches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.matches (id, created_at, team1_p1, team1_p2, team2_p1, team2_p2, score, winner_team, commentary, status, auto_confirm_at, elo_snapshot, created_by, club_id) FROM stdin;
22	2026-01-18 14:45:49.38147+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	5b339065-758c-401b-bc4e-856a83a0d55d	3801a795-759b-42a2-85d3-7771f2aa923d	14244878-d464-469e-8204-e5e5803960ff	[{"t1": 6, "t2": 4}, {"t1": 6, "t2": 3}, {"t1": 0, "t2": 0}]	1	Wow partidazooo!!	confirmed	2026-01-19 14:45:49.38147+00	{"t1p1": 1171, "t1p2": 1173, "t2p1": 1101, "t2p2": 1129}	d7848f49-4f9b-4b6b-9826-51960ebfb110	1
24	2026-01-18 20:27:03.491387+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	83d7a5ba-932f-4093-a31e-2c7820ba0af5	14244878-d464-469e-8204-e5e5803960ff	6331ce5b-9438-4615-9d98-03259fb94ecb	[{"t1": 6, "t2": 3}, {"t1": 5, "t2": 7}, {"t1": 6, "t2": 4}]	1	\N	confirmed	2026-01-19 20:27:03.491387+00	{"t1p1": 1193, "t1p2": 1196, "t2p1": 1107, "t2p2": 1130}	14244878-d464-469e-8204-e5e5803960ff	1
25	2026-01-19 09:57:12.573906+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	3801a795-759b-42a2-85d3-7771f2aa923d	6331ce5b-9438-4615-9d98-03259fb94ecb	14244878-d464-469e-8204-e5e5803960ff	[{"t1": 6, "t2": 4}, {"t1": 6, "t2": 0}, {"t1": 0, "t2": 0}]	1	test historial rejected y confirmed matches para usuarios	confirmed	2026-01-20 09:57:12.573906+00	{"t1p1": 1215, "t1p2": 1123, "t2p1": 1108, "t2p2": 1085}	d7848f49-4f9b-4b6b-9826-51960ebfb110	1
27	2026-01-20 14:18:17.195921+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	3801a795-759b-42a2-85d3-7771f2aa923d	6331ce5b-9438-4615-9d98-03259fb94ecb	14244878-d464-469e-8204-e5e5803960ff	[{"t1": 3, "t2": 6}, {"t1": 4, "t2": 6}, {"t1": 0, "t2": 0}]	2	partido sin club	confirmed	2026-01-21 14:18:17.195921+00	{"t1p1": 1186, "t1p2": 1094, "t2p1": 1137, "t2p2": 1114}	d7848f49-4f9b-4b6b-9826-51960ebfb110	\N
20	2026-01-18 14:38:59.7433+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	83d7a5ba-932f-4093-a31e-2c7820ba0af5	14244878-d464-469e-8204-e5e5803960ff	6331ce5b-9438-4615-9d98-03259fb94ecb	[{"t1": 6, "t2": 4}, {"t1": 6, "t2": 4}, {"t1": 0, "t2": 0}]	1	\N	confirmed	2026-01-19 14:38:59.7433+00	{"t1p1": 1174, "t1p2": 1174, "t2p1": 1126, "t2p2": 1126}	d7848f49-4f9b-4b6b-9826-51960ebfb110	1
21	2026-01-18 14:39:38.111423+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	3801a795-759b-42a2-85d3-7771f2aa923d	14244878-d464-469e-8204-e5e5803960ff	6331ce5b-9438-4615-9d98-03259fb94ecb	[{"t1": 3, "t2": 6}, {"t1": 4, "t2": 6}, {"t1": 0, "t2": 0}]	2	\N	confirmed	2026-01-19 14:39:38.111423+00	{"t1p1": 1148, "t1p2": 1124, "t2p1": 1152, "t2p2": 1152}	d7848f49-4f9b-4b6b-9826-51960ebfb110	1
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.messages (id, content, sender_id, receiver_id, created_at, is_read, deleted_by_sender, deleted_by_receiver) FROM stdin;
e8bf9eb1-dbad-46d9-b40c-d4ed1a1d8b6c	hola alvaro, que tal te parece la nueva app de PadelUp?	14244878-d464-469e-8204-e5e5803960ff	d7848f49-4f9b-4b6b-9826-51960ebfb110	2026-01-14 13:22:42.214906+00	t	f	f
3bc2e9b5-b16e-42b6-b00a-f6d558dc325e	Buenas!	5b339065-758c-401b-bc4e-856a83a0d55d	d7848f49-4f9b-4b6b-9826-51960ebfb110	2026-01-17 12:39:17.000384+00	t	f	f
452e6b90-1515-4aa6-9d61-8ed948f4c5a1	Que pasa señor!	d7848f49-4f9b-4b6b-9826-51960ebfb110	5b339065-758c-401b-bc4e-856a83a0d55d	2026-01-17 16:20:30.041042+00	t	f	f
aa01f0fa-9875-4234-8870-1581ceb2b6e0	Lo que lleguen popups a tu teléfono como notificaciones ya para otra versión jaajaj	d7848f49-4f9b-4b6b-9826-51960ebfb110	5b339065-758c-401b-bc4e-856a83a0d55d	2026-01-17 16:20:58.57848+00	t	f	f
b5880b58-d062-435d-b7b3-6c765bfc6473	Jajajaj siempre tiene que haber cosillas en el backup	5b339065-758c-401b-bc4e-856a83a0d55d	d7848f49-4f9b-4b6b-9826-51960ebfb110	2026-01-17 16:46:14.308286+00	t	f	f
ee80a34f-309f-4f30-928b-f9f3993ee68a	Match #11 was rejected by user. Reason: admin/alvaro	d7848f49-4f9b-4b6b-9826-51960ebfb110	8adcf3fc-a01c-4078-8c01-51696e12d18e	2026-01-17 22:47:21.377807+00	t	f	f
7f3de9db-84c1-4349-b8bd-8c1b576f85e5	Señor ya tienes tu feedback implementado . Test de nuevo Jajaj 💪💪	d7848f49-4f9b-4b6b-9826-51960ebfb110	5b339065-758c-401b-bc4e-856a83a0d55d	2026-01-17 23:18:27.623372+00	t	f	f
7485f531-e7d7-4a28-b747-61e0d203e89d	Perfecto! 💪 Me lo miro y te digo, ya tengo curiosidad!	5b339065-758c-401b-bc4e-856a83a0d55d	d7848f49-4f9b-4b6b-9826-51960ebfb110	2026-01-18 22:43:28.920129+00	t	f	f
ba804fef-42f3-403d-bac4-ab925a4f6442	Match #23 was rejected by user. Reason: totally false result	5b339065-758c-401b-bc4e-856a83a0d55d	8adcf3fc-a01c-4078-8c01-51696e12d18e	2026-01-18 18:11:41.824012+00	t	f	f
175bea00-9a70-4646-b017-ff53727686dd	Match #26 was rejected by user. Reason: Test policy supabase for delete match in users	6331ce5b-9438-4615-9d98-03259fb94ecb	8adcf3fc-a01c-4078-8c01-51696e12d18e	2026-01-19 10:49:43.948642+00	t	f	f
3a9ba306-440e-495b-9ce0-5a9601b29c61	hola soy el admin. esta todo bien? :)	8adcf3fc-a01c-4078-8c01-51696e12d18e	d7848f49-4f9b-4b6b-9826-51960ebfb110	2026-01-19 19:46:00.384331+00	t	f	f
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.profiles (id, username, avatar_url, elo, created_at, is_admin, approved, notifications_enabled, subscription_end_date, banned, email, banned_until, member_id, matches_validated, matches_rejected, main_club_id, first_name, last_name) FROM stdin;
3801a795-759b-42a2-85d3-7771f2aa923d	Carlos	\N	1094	2025-12-30 14:42:58.591527+00	f	t	t	2026-02-04 20:37:32.07+00	f	caryuse@gmail.com	\N	5	0	0	\N	\N	\N
14244878-d464-469e-8204-e5e5803960ff	Maria	\N	1114	2025-12-30 21:25:01.546396+00	f	t	t	2026-01-29 21:25:01.546396+00	f	yube.usk@gmail.com	\N	3	2	0	\N	\N	\N
6331ce5b-9438-4615-9d98-03259fb94ecb	Barce	\N	1137	2026-01-13 23:00:18.259204+00	f	t	t	2026-02-12 23:00:18.259204+00	f	camase@hotmail.com	\N	14	4	1	\N	\N	\N
5b339065-758c-401b-bc4e-856a83a0d55d	Victor	https://pkgmrvalcppskxdusqni.supabase.co/storage/v1/object/public/avatars/5b339065-758c-401b-bc4e-856a83a0d55d/0.07471711083077104.jpg	1173	2026-01-17 11:06:24.516603+00	f	t	t	2026-02-16 11:06:24.516603+00	f	victorcermeno@hotmail.com	\N	15	0	1	\N	Victor	Cermeño
173c8679-41f5-43ed-8f17-5dd6003009ba	Javi	\N	1150	2026-01-20 21:09:58.244973+00	f	t	t	2026-02-19 21:09:58.244973+00	f	other.havi@gmail.com	\N	20	0	0	1	Javi	O
83d7a5ba-932f-4093-a31e-2c7820ba0af5	John Doe	\N	1196	2026-01-13 18:22:25.744637+00	f	t	t	2026-02-12 18:22:25.744637+00	f	johndoe2k01@gmail.com	\N	12	0	0	\N	\N	\N
edd5791c-9ee0-45f3-83ac-9e240cc6ee6f	Pomfrit 	\N	1150	2026-01-20 17:03:51.365151+00	f	t	t	2026-02-19 17:03:51.365151+00	f	grit.hoffmeister@gmail.com	\N	19	0	0	1	Grit	Hoffmeister
8adcf3fc-a01c-4078-8c01-51696e12d18e	Administrator 1	\N	0	2026-01-06 09:43:33.270665+00	t	t	t	2028-01-05 00:00:00+00	f	alvaro90barcelona@gmail.com	\N	2	1	0	\N	Admin 1	\N
f850d529-426f-4e60-803e-b98849f0541e	Administrator 2	\N	1150	2026-01-20 09:41:11.063686+00	t	t	t	2028-06-19 00:00:00+00	f	padeluppadeleros@gmail.com	\N	16	0	0	\N	Admin 2	Barcelona Peralta
d7848f49-4f9b-4b6b-9826-51960ebfb110	Alvaro	https://pkgmrvalcppskxdusqni.supabase.co/storage/v1/object/public/avatars/d7848f49-4f9b-4b6b-9826-51960ebfb110/0.4142420223308648.jpeg	1186	2025-12-29 16:23:31.67152+00	f	t	t	2027-01-29 00:00:00+00	f	camase1990@gmail.com	\N	4	1	0	1	Alvaro	Barcelona Peralta
\.


--
-- Data for Name: user_achievements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_achievements (user_id, achievement_id, unlocked_at) FROM stdin;
5b339065-758c-401b-bc4e-856a83a0d55d	socialite	2026-01-17 12:37:00.870232+00
6331ce5b-9438-4615-9d98-03259fb94ecb	first_blood	2026-01-18 14:16:24.348109+00
14244878-d464-469e-8204-e5e5803960ff	first_blood	2026-01-18 14:17:24.397306+00
14244878-d464-469e-8204-e5e5803960ff	winner	2026-01-18 14:17:24.397306+00
6331ce5b-9438-4615-9d98-03259fb94ecb	winner	2026-01-18 14:44:47.49405+00
d7848f49-4f9b-4b6b-9826-51960ebfb110	first_blood	2026-01-18 15:14:58.015141+00
d7848f49-4f9b-4b6b-9826-51960ebfb110	winner	2026-01-18 15:14:58.015141+00
5b339065-758c-401b-bc4e-856a83a0d55d	first_blood	2026-01-18 22:41:45.555758+00
5b339065-758c-401b-bc4e-856a83a0d55d	winner	2026-01-18 22:41:45.555758+00
d7848f49-4f9b-4b6b-9826-51960ebfb110	marathon	2026-01-19 19:41:50.62598+00
d7848f49-4f9b-4b6b-9826-51960ebfb110	clean_sheet	2026-01-20 10:15:40.882119+00
6331ce5b-9438-4615-9d98-03259fb94ecb	marathon	2026-01-20 21:48:53.700886+00
d7848f49-4f9b-4b6b-9826-51960ebfb110	socialite	2026-01-11 14:58:58.639917+00
\.


--
-- Name: clubs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.clubs_id_seq', 2, true);


--
-- Name: friendships_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.friendships_id_seq', 11, true);


--
-- Name: matches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.matches_id_seq', 27, true);


--
-- Name: profiles_member_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.profiles_member_id_seq', 20, true);


--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: clubs clubs_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_name_key UNIQUE (name);


--
-- Name: clubs clubs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_user_id_1_user_id_2_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_id_1_user_id_2_key UNIQUE (user_id_1, user_id_2);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (user_id, achievement_id);


--
-- Name: friendships_user_id_1_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX friendships_user_id_1_idx ON public.friendships USING btree (user_id_1);


--
-- Name: friendships_user_id_2_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX friendships_user_id_2_idx ON public.friendships USING btree (user_id_2);


--
-- Name: idx_profiles_member_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_member_id ON public.profiles USING btree (member_id);


--
-- Name: activity_logs activity_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_user_id_1_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_id_1_fkey FOREIGN KEY (user_id_1) REFERENCES public.profiles(id);


--
-- Name: friendships friendships_user_id_2_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_id_2_fkey FOREIGN KEY (user_id_2) REFERENCES public.profiles(id);


--
-- Name: matches matches_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_club_id_fkey FOREIGN KEY (club_id) REFERENCES public.clubs(id);


--
-- Name: matches matches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: matches matches_team1_p1_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_team1_p1_fkey FOREIGN KEY (team1_p1) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: matches matches_team1_p2_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_team1_p2_fkey FOREIGN KEY (team1_p2) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: matches matches_team2_p1_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_team2_p1_fkey FOREIGN KEY (team2_p1) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: matches matches_team2_p2_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_team2_p2_fkey FOREIGN KEY (team2_p2) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: messages messages_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id);


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id);


--
-- Name: profiles profiles_main_club_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_main_club_id_fkey FOREIGN KEY (main_club_id) REFERENCES public.clubs(id);


--
-- Name: user_achievements user_achievements_achievement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id);


--
-- Name: user_achievements user_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: matches Admin matches delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admin matches delete" ON public.matches FOR DELETE USING (public.check_is_admin());


--
-- Name: profiles Admins can delete users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can delete users" ON public.profiles FOR DELETE USING (public.check_is_admin());


--
-- Name: user_achievements Admins can manage all user_achievements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage all user_achievements" ON public.user_achievements USING ((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.is_admin = true))));


--
-- Name: clubs Admins can manage clubs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage clubs" ON public.clubs USING ((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.is_admin = true))));


--
-- Name: profiles Admins can update anyone; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update anyone" ON public.profiles FOR UPDATE USING (public.check_is_admin());


--
-- Name: activity_logs Admins view all logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins view all logs" ON public.activity_logs FOR SELECT USING ((auth.uid() IN ( SELECT profiles.id
   FROM public.profiles
  WHERE (profiles.is_admin = true))));


--
-- Name: matches Authenticated matches insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated matches insert" ON public.matches FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND (auth.uid() = created_by)));


--
-- Name: messages Authenticated users can insert messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can insert messages" ON public.messages FOR INSERT WITH CHECK ((auth.uid() = sender_id));


--
-- Name: clubs Clubs are viewable by everyone; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Clubs are viewable by everyone" ON public.clubs FOR SELECT USING (true);


--
-- Name: profiles Enable read access for authenticated users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for authenticated users" ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: achievements Public achievements access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public achievements access" ON public.achievements FOR SELECT USING (true);


--
-- Name: matches Public matches access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public matches access" ON public.matches FOR SELECT USING (true);


--
-- Name: profiles Public profiles access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public profiles access" ON public.profiles FOR SELECT USING (true);


--
-- Name: profiles Public profiles delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public profiles delete" ON public.profiles FOR DELETE USING ((auth.uid() = id));


--
-- Name: profiles Public profiles insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public profiles insert" ON public.profiles FOR INSERT WITH CHECK (true);


--
-- Name: user_achievements Public user_achievements access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public user_achievements access" ON public.user_achievements FOR SELECT USING (true);


--
-- Name: user_achievements Public user_achievements insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public user_achievements insert" ON public.user_achievements FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: messages Receivers can mark messages as deleted; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Receivers can mark messages as deleted" ON public.messages FOR UPDATE USING ((auth.uid() = receiver_id)) WITH CHECK ((auth.uid() = receiver_id));


--
-- Name: messages Receivers can update entries to mark as read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Receivers can update entries to mark as read" ON public.messages FOR UPDATE USING ((auth.uid() = receiver_id)) WITH CHECK ((auth.uid() = receiver_id));


--
-- Name: messages Senders can mark messages as deleted; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Senders can mark messages as deleted" ON public.messages FOR UPDATE USING ((auth.uid() = sender_id)) WITH CHECK ((auth.uid() = sender_id));


--
-- Name: friendships Users can delete their friendships; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their friendships" ON public.friendships FOR DELETE USING (((auth.uid() = user_id_1) OR (auth.uid() = user_id_2)));


--
-- Name: friendships Users can insert friend requests; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert friend requests" ON public.friendships FOR INSERT WITH CHECK ((auth.uid() = user_id_1));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: friendships Users can update their friendships; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their friendships" ON public.friendships FOR UPDATE USING (((auth.uid() = user_id_2) OR (auth.uid() = user_id_1)));


--
-- Name: friendships Users can view their own friendships; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own friendships" ON public.friendships FOR SELECT USING (((auth.uid() = user_id_1) OR (auth.uid() = user_id_2)));


--
-- Name: messages Users can view their own messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own messages" ON public.messages FOR SELECT USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));


--
-- Name: activity_logs Users insert own logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users insert own logs" ON public.activity_logs FOR INSERT WITH CHECK ((auth.uid() = actor_id));


--
-- Name: achievements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: clubs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;

--
-- Name: friendships; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

--
-- Name: matches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_achievements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION are_friends(u1 uuid, u2 uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.are_friends(u1 uuid, u2 uuid) TO anon;
GRANT ALL ON FUNCTION public.are_friends(u1 uuid, u2 uuid) TO authenticated;
GRANT ALL ON FUNCTION public.are_friends(u1 uuid, u2 uuid) TO service_role;


--
-- Name: FUNCTION calculate_expected_score(rating_a integer, rating_b integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.calculate_expected_score(rating_a integer, rating_b integer) TO anon;
GRANT ALL ON FUNCTION public.calculate_expected_score(rating_a integer, rating_b integer) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_expected_score(rating_a integer, rating_b integer) TO service_role;


--
-- Name: FUNCTION calculate_new_rating(current_rating integer, actual_score double precision, expected_score double precision, k_factor integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.calculate_new_rating(current_rating integer, actual_score double precision, expected_score double precision, k_factor integer) TO anon;
GRANT ALL ON FUNCTION public.calculate_new_rating(current_rating integer, actual_score double precision, expected_score double precision, k_factor integer) TO authenticated;
GRANT ALL ON FUNCTION public.calculate_new_rating(current_rating integer, actual_score double precision, expected_score double precision, k_factor integer) TO service_role;


--
-- Name: FUNCTION check_is_admin(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.check_is_admin() TO anon;
GRANT ALL ON FUNCTION public.check_is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.check_is_admin() TO service_role;


--
-- Name: FUNCTION confirm_match(match_id bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.confirm_match(match_id bigint) TO anon;
GRANT ALL ON FUNCTION public.confirm_match(match_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.confirm_match(match_id bigint) TO service_role;


--
-- Name: FUNCTION get_k_factor(matches_played integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_k_factor(matches_played integer) TO anon;
GRANT ALL ON FUNCTION public.get_k_factor(matches_played integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_k_factor(matches_played integer) TO service_role;


--
-- Name: FUNCTION get_player_match_history(id_input uuid, limit_count integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_player_match_history(id_input uuid, limit_count integer) TO anon;
GRANT ALL ON FUNCTION public.get_player_match_history(id_input uuid, limit_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_player_match_history(id_input uuid, limit_count integer) TO service_role;


--
-- Name: FUNCTION process_expired_matches(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.process_expired_matches() TO anon;
GRANT ALL ON FUNCTION public.process_expired_matches() TO authenticated;
GRANT ALL ON FUNCTION public.process_expired_matches() TO service_role;


--
-- Name: FUNCTION reject_match(match_id bigint, reason text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.reject_match(match_id bigint, reason text) TO anon;
GRANT ALL ON FUNCTION public.reject_match(match_id bigint, reason text) TO authenticated;
GRANT ALL ON FUNCTION public.reject_match(match_id bigint, reason text) TO service_role;


--
-- Name: TABLE achievements; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.achievements TO anon;
GRANT ALL ON TABLE public.achievements TO authenticated;
GRANT ALL ON TABLE public.achievements TO service_role;


--
-- Name: TABLE activity_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.activity_logs TO anon;
GRANT ALL ON TABLE public.activity_logs TO authenticated;
GRANT ALL ON TABLE public.activity_logs TO service_role;


--
-- Name: TABLE clubs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.clubs TO anon;
GRANT ALL ON TABLE public.clubs TO authenticated;
GRANT ALL ON TABLE public.clubs TO service_role;


--
-- Name: SEQUENCE clubs_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.clubs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.clubs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.clubs_id_seq TO service_role;


--
-- Name: TABLE friendships; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.friendships TO anon;
GRANT ALL ON TABLE public.friendships TO authenticated;
GRANT ALL ON TABLE public.friendships TO service_role;


--
-- Name: SEQUENCE friendships_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.friendships_id_seq TO anon;
GRANT ALL ON SEQUENCE public.friendships_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.friendships_id_seq TO service_role;


--
-- Name: TABLE matches; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.matches TO anon;
GRANT ALL ON TABLE public.matches TO authenticated;
GRANT ALL ON TABLE public.matches TO service_role;


--
-- Name: SEQUENCE matches_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.matches_id_seq TO anon;
GRANT ALL ON SEQUENCE public.matches_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.matches_id_seq TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: SEQUENCE profiles_member_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.profiles_member_id_seq TO anon;
GRANT ALL ON SEQUENCE public.profiles_member_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.profiles_member_id_seq TO service_role;


--
-- Name: TABLE user_achievements; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.user_achievements TO anon;
GRANT ALL ON TABLE public.user_achievements TO authenticated;
GRANT ALL ON TABLE public.user_achievements TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict kfGz4wAG8kLaRa9XiPnmkYbB2KhsZPEA6Z7qP5ofUot5hdRD7rsHxr8rifHVYfZ

