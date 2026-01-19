--
-- PostgreSQL database dump
--

\restrict PeoszakL3qW3cFmwAPwHUSa4euhB49zAOlYj2l7IKHxjOvePzfqE8Vq2soizXf0

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
  snap jsonb;
  confirmator_id uuid;
BEGIN
  -- Get match data
  SELECT * INTO m FROM public.matches WHERE id = match_id;
  
  -- Validation
  IF m.status != 'pending' THEN
    RAISE EXCEPTION 'Match is not pending.';
  END IF;

  snap := m.elo_snapshot;
  confirmator_id := auth.uid();

  -- Update Players ELO from the snapshot
  -- Snapshot format expected: { "t1p1": 1200, "t1p2": 1150, ... } (Calculated NEW ELOs)
  
  -- Team 1
  UPDATE public.profiles SET elo = (snap->>'t1p1')::int WHERE id = m.team1_p1;
  UPDATE public.profiles SET elo = (snap->>'t1p2')::int WHERE id = m.team1_p2;
  
  -- Team 2
  UPDATE public.profiles SET elo = (snap->>'t2p1')::int WHERE id = m.team2_p1;
  UPDATE public.profiles SET elo = (snap->>'t2p2')::int WHERE id = m.team2_p2;

  -- Mark as Confirmed
  UPDATE public.matches SET status = 'confirmed' WHERE id = match_id;

  -- Increment Validation Counter for the user confirming
  -- Note: If triggered by system (auto-confirm), auth.uid() might be null or system user.
  -- We only increment if a real user is performing the action.
  IF confirmator_id IS NOT NULL THEN
      UPDATE public.profiles 
      SET matches_validated = matches_validated + 1 
      WHERE id = confirmator_id;
  END IF;

END;
$$;


ALTER FUNCTION public.confirm_match(match_id bigint) OWNER TO postgres;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, approved)
  VALUES (new.id, new.raw_user_meta_data->>'username', new.email, false);
  RETURN new;
END;
$$;


ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

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
    AS $$
DECLARE
  m record;
  snap jsonb;
  admin_id uuid;
  rejector_id uuid;
BEGIN
  -- Get match data
  SELECT * INTO m FROM public.matches WHERE id = match_id;
  
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
END;
$$;


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
    team1_p1 uuid NOT NULL,
    team1_p2 uuid NOT NULL,
    team2_p1 uuid NOT NULL,
    team2_p2 uuid NOT NULL,
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
    is_read boolean DEFAULT false
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
    main_club_id bigint
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
\.


--
-- Data for Name: clubs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.clubs (id, created_at, name, location) FROM stdin;
2	2026-01-14 12:34:39.303705+00	Hall of Padel | WF	Wollfenbüttel || Germany
1	2026-01-14 09:45:03.836814+00	Hall of Padel | BS	Braunschweig || Germany
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
12	2026-01-17 13:03:47.222478+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	6331ce5b-9438-4615-9d98-03259fb94ecb	3801a795-759b-42a2-85d3-7771f2aa923d	14244878-d464-469e-8204-e5e5803960ff	[{"t1": 3, "t2": 6}, {"t1": 6, "t2": 3}, {"t1": 3, "t2": 6}]	2	Yeees	pending	2026-01-18 13:03:47.222478+00	{"t1p1": 1126, "t1p2": 1126, "t2p1": 1174, "t2p2": 1174}	5b339065-758c-401b-bc4e-856a83a0d55d	1
13	2026-01-17 13:04:27.937158+00	5b339065-758c-401b-bc4e-856a83a0d55d	3801a795-759b-42a2-85d3-7771f2aa923d	83d7a5ba-932f-4093-a31e-2c7820ba0af5	d7848f49-4f9b-4b6b-9826-51960ebfb110	[{"t1": 6, "t2": 0}, {"t1": 6, "t2": 0}, {"t1": 0, "t2": 0}]	1	Mega	pending	2026-01-18 13:04:27.937158+00	{"t1p1": 1174, "t1p2": 1174, "t2p1": 1126, "t2p2": 1126}	5b339065-758c-401b-bc4e-856a83a0d55d	1
14	2026-01-17 13:06:26.736748+00	d7848f49-4f9b-4b6b-9826-51960ebfb110	5b339065-758c-401b-bc4e-856a83a0d55d	83d7a5ba-932f-4093-a31e-2c7820ba0af5	6331ce5b-9438-4615-9d98-03259fb94ecb	[{"t1": 3, "t2": 6}, {"t1": 6, "t2": 1}, {"t1": 5, "t2": 7}]	2	\N	pending	2026-01-18 13:06:26.736748+00	{"t1p1": 1126, "t1p2": 1126, "t2p1": 1174, "t2p2": 1174}	5b339065-758c-401b-bc4e-856a83a0d55d	\N
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.messages (id, content, sender_id, receiver_id, created_at, is_read) FROM stdin;
e8bf9eb1-dbad-46d9-b40c-d4ed1a1d8b6c	hola alvaro, que tal te parece la nueva app de PadelUp?	14244878-d464-469e-8204-e5e5803960ff	d7848f49-4f9b-4b6b-9826-51960ebfb110	2026-01-14 13:22:42.214906+00	t
3bc2e9b5-b16e-42b6-b00a-f6d558dc325e	Buenas!	5b339065-758c-401b-bc4e-856a83a0d55d	d7848f49-4f9b-4b6b-9826-51960ebfb110	2026-01-17 12:39:17.000384+00	t
452e6b90-1515-4aa6-9d61-8ed948f4c5a1	Que pasa señor!	d7848f49-4f9b-4b6b-9826-51960ebfb110	5b339065-758c-401b-bc4e-856a83a0d55d	2026-01-17 16:20:30.041042+00	t
aa01f0fa-9875-4234-8870-1581ceb2b6e0	Lo que lleguen popups a tu teléfono como notificaciones ya para otra versión jaajaj	d7848f49-4f9b-4b6b-9826-51960ebfb110	5b339065-758c-401b-bc4e-856a83a0d55d	2026-01-17 16:20:58.57848+00	t
b5880b58-d062-435d-b7b3-6c765bfc6473	Jajajaj siempre tiene que haber cosillas en el backup	5b339065-758c-401b-bc4e-856a83a0d55d	d7848f49-4f9b-4b6b-9826-51960ebfb110	2026-01-17 16:46:14.308286+00	t
ee80a34f-309f-4f30-928b-f9f3993ee68a	Match #11 was rejected by user. Reason: admin/alvaro	d7848f49-4f9b-4b6b-9826-51960ebfb110	8adcf3fc-a01c-4078-8c01-51696e12d18e	2026-01-17 22:47:21.377807+00	t
7f3de9db-84c1-4349-b8bd-8c1b576f85e5	Señor ya tienes tu feedback implementado . Test de nuevo Jajaj 💪💪	d7848f49-4f9b-4b6b-9826-51960ebfb110	5b339065-758c-401b-bc4e-856a83a0d55d	2026-01-17 23:18:27.623372+00	f
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.profiles (id, username, avatar_url, elo, created_at, is_admin, approved, notifications_enabled, subscription_end_date, banned, email, banned_until, member_id, matches_validated, matches_rejected, main_club_id) FROM stdin;
8adcf3fc-a01c-4078-8c01-51696e12d18e	Administrator	\N	0	2026-01-06 09:43:33.270665+00	t	t	t	2028-01-05 00:00:00+00	f	alvaro90barcelona@gmail.com	\N	2	0	0	\N
3801a795-759b-42a2-85d3-7771f2aa923d	Carlos	\N	1150	2025-12-30 14:42:58.591527+00	f	t	t	2026-02-04 20:37:32.07+00	f	caryuse@gmail.com	\N	5	0	0	\N
83d7a5ba-932f-4093-a31e-2c7820ba0af5	John Doe	\N	1150	2026-01-13 18:22:25.744637+00	f	t	t	2026-02-12 18:22:25.744637+00	f	johndoe2k01@gmail.com	\N	12	0	0	\N
14244878-d464-469e-8204-e5e5803960ff	Maria	\N	1150	2025-12-30 21:25:01.546396+00	f	t	t	2026-01-29 21:25:01.546396+00	f	yube.usk@gmail.com	\N	3	1	0	\N
5b339065-758c-401b-bc4e-856a83a0d55d	Victor	https://pkgmrvalcppskxdusqni.supabase.co/storage/v1/object/public/avatars/5b339065-758c-401b-bc4e-856a83a0d55d/0.07471711083077104.jpg	1150	2026-01-17 11:06:24.516603+00	f	t	t	2026-02-16 11:06:24.516603+00	f	victorcermeno@hotmail.com	\N	15	0	0	\N
d7848f49-4f9b-4b6b-9826-51960ebfb110	Alvaro	https://pkgmrvalcppskxdusqni.supabase.co/storage/v1/object/public/avatars/d7848f49-4f9b-4b6b-9826-51960ebfb110/0.4142420223308648.jpeg	1150	2025-12-29 16:23:31.67152+00	f	t	t	2027-01-29 00:00:00+00	f	camase1990@gmail.com	\N	4	0	1	1
6331ce5b-9438-4615-9d98-03259fb94ecb	Barce	\N	1150	2026-01-13 23:00:18.259204+00	f	t	t	2026-02-12 23:00:18.259204+00	f	camase@hotmail.com	\N	14	0	0	\N
\.


--
-- Data for Name: user_achievements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_achievements (user_id, achievement_id, unlocked_at) FROM stdin;
5b339065-758c-401b-bc4e-856a83a0d55d	socialite	2026-01-17 12:37:00.870232+00
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

SELECT pg_catalog.setval('public.matches_id_seq', 14, true);


--
-- Name: profiles_member_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.profiles_member_id_seq', 15, true);


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
    ADD CONSTRAINT matches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: matches matches_team1_p1_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_team1_p1_fkey FOREIGN KEY (team1_p1) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: matches matches_team1_p2_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_team1_p2_fkey FOREIGN KEY (team1_p2) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: matches matches_team2_p1_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_team2_p1_fkey FOREIGN KEY (team2_p1) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: matches matches_team2_p2_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_team2_p2_fkey FOREIGN KEY (team2_p2) REFERENCES public.profiles(id) ON DELETE CASCADE;


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
-- Name: matches Public matches delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public matches delete" ON public.matches FOR DELETE USING (true);


--
-- Name: matches Public matches insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public matches insert" ON public.matches FOR INSERT WITH CHECK (true);


--
-- Name: profiles Public profiles access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public profiles access" ON public.profiles FOR SELECT USING (true);


--
-- Name: profiles Public profiles delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public profiles delete" ON public.profiles FOR DELETE USING (true);


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

CREATE POLICY "Public user_achievements insert" ON public.user_achievements FOR INSERT WITH CHECK (true);


--
-- Name: messages Receivers can update entries to mark as read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Receivers can update entries to mark as read" ON public.messages FOR UPDATE USING ((auth.uid() = receiver_id)) WITH CHECK ((auth.uid() = receiver_id));


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
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


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

\unrestrict PeoszakL3qW3cFmwAPwHUSa4euhB49zAOlYj2l7IKHxjOvePzfqE8Vq2soizXf0

