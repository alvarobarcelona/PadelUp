--
-- PostgreSQL database dump
--

\restrict kGGI2gRAXfyuuNEndPzulTBkvJ2L9furg6yGZucd0EpG93lHOs6Gz795VPotVyM

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
    AS $$
  select exists (
    select 1 from friendships
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
    AS $$
BEGIN
  -- Check if the current user (auth.uid()) exists in profiles with is_admin = true
  RETURN EXISTS (
    SELECT 1
    FROM profiles
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
    AS $$
DECLARE
  m record;
  snap jsonb;
BEGIN
  -- Get match data
  SELECT * INTO m FROM public.matches WHERE id = match_id;
  
  -- Validation
  IF m.status != 'pending' THEN
    RAISE EXCEPTION 'Match is not pending.';
  END IF;

  snap := m.elo_snapshot;

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

END;
$$;


ALTER FUNCTION public.confirm_match(match_id bigint) OWNER TO postgres;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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
-- Name: reject_match(bigint); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reject_match(match_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Perform a hard delete of the match
  DELETE FROM public.matches WHERE id = match_id;
END;
$$;


ALTER FUNCTION public.reject_match(match_id bigint) OWNER TO postgres;

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
    member_id bigint NOT NULL
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
\.


--
-- Data for Name: friendships; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.friendships (id, user_id_1, user_id_2, status, created_at) FROM stdin;
\.


--
-- Data for Name: matches; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.matches (id, created_at, team1_p1, team1_p2, team2_p1, team2_p2, score, winner_team, commentary, status, auto_confirm_at, elo_snapshot, created_by) FROM stdin;
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.messages (id, content, sender_id, receiver_id, created_at, is_read) FROM stdin;
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.profiles (id, username, avatar_url, elo, created_at, is_admin, approved, notifications_enabled, subscription_end_date, banned, email, banned_until, member_id) FROM stdin;
60b18c8c-4f75-4382-b058-06c3f6e4dc28	Barce	\N	1150	2026-01-12 01:21:05.674883+00	f	f	t	2026-02-11 01:21:05.674883+00	f	camase@hotmail.com	\N	11
8adcf3fc-a01c-4078-8c01-51696e12d18e	Administrator	\N	0	2026-01-06 09:43:33.270665+00	t	t	t	2028-01-05 00:00:00+00	f	alvaro90barcelona@gmail.com	\N	2
14244878-d464-469e-8204-e5e5803960ff	Maria	\N	1150	2025-12-30 21:25:01.546396+00	f	t	t	2026-01-29 21:25:01.546396+00	f	yube.usk@gmail.com	\N	3
3801a795-759b-42a2-85d3-7771f2aa923d	Carlos	\N	1150	2025-12-30 14:42:58.591527+00	f	t	t	2026-02-04 20:37:32.07+00	f	caryuse@gmail.com	\N	5
d7848f49-4f9b-4b6b-9826-51960ebfb110	Alvaro	https://pkgmrvalcppskxdusqni.supabase.co/storage/v1/object/public/avatars/233b46e0-d40a-489f-9b9c-931b2f96083f/0.03762533311400529.jpg	1150	2025-12-29 16:23:31.67152+00	f	t	t	2027-01-29 00:00:00+00	f	camase1990@gmail.com	\N	4
\.


--
-- Data for Name: user_achievements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_achievements (user_id, achievement_id, unlocked_at) FROM stdin;
d7848f49-4f9b-4b6b-9826-51960ebfb110	socialite	2026-01-11 14:58:58.639917+00
\.


--
-- Name: friendships_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.friendships_id_seq', 8, true);


--
-- Name: matches_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.matches_id_seq', 21, true);


--
-- Name: profiles_member_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.profiles_member_id_seq', 11, true);


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
    ADD CONSTRAINT activity_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);


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
-- Name: FUNCTION reject_match(match_id bigint); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.reject_match(match_id bigint) TO anon;
GRANT ALL ON FUNCTION public.reject_match(match_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.reject_match(match_id bigint) TO service_role;


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

\unrestrict kGGI2gRAXfyuuNEndPzulTBkvJ2L9furg6yGZucd0EpG93lHOs6Gz795VPotVyM

