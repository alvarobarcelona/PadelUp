


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


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."are_friends"("u1" "uuid", "u2" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
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


ALTER FUNCTION "public"."are_friends"("u1" "uuid", "u2" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."check_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_match"("match_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."confirm_match"("match_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, approved)
  VALUES (new.id, new.raw_user_meta_data->>'username', new.email, false);
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_expired_matches"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


CREATE OR REPLACE FUNCTION "public"."reject_match"("match_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Perform a hard delete of the match
  DELETE FROM public.matches WHERE id = match_id;
END;
$$;


ALTER FUNCTION "public"."reject_match"("match_id" bigint) OWNER TO "postgres";

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
    "team1_p1" "uuid" NOT NULL,
    "team1_p2" "uuid" NOT NULL,
    "team2_p1" "uuid" NOT NULL,
    "team2_p2" "uuid" NOT NULL,
    "score" "jsonb" NOT NULL,
    "winner_team" smallint NOT NULL,
    "commentary" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "auto_confirm_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval),
    "elo_snapshot" "jsonb",
    "created_by" "uuid",
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
    "content" "text" NOT NULL,
    "sender_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_read" boolean DEFAULT false
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
    "member_id" bigint NOT NULL
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



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("user_id", "achievement_id");



CREATE INDEX "friendships_user_id_1_idx" ON "public"."friendships" USING "btree" ("user_id_1");



CREATE INDEX "friendships_user_id_2_idx" ON "public"."friendships" USING "btree" ("user_id_2");



CREATE INDEX "idx_profiles_member_id" ON "public"."profiles" USING "btree" ("member_id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_id_1_fkey" FOREIGN KEY ("user_id_1") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_id_2_fkey" FOREIGN KEY ("user_id_2") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_team1_p1_fkey" FOREIGN KEY ("team1_p1") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_team1_p2_fkey" FOREIGN KEY ("team1_p2") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_team2_p1_fkey" FOREIGN KEY ("team2_p1") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_team2_p2_fkey" FOREIGN KEY ("team2_p2") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



CREATE POLICY "Admins can delete users" ON "public"."profiles" FOR DELETE USING ("public"."check_is_admin"());



CREATE POLICY "Admins can update anyone" ON "public"."profiles" FOR UPDATE USING ("public"."check_is_admin"());



CREATE POLICY "Admins view all logs" ON "public"."activity_logs" FOR SELECT USING (("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."is_admin" = true))));



CREATE POLICY "Authenticated users can insert messages" ON "public"."messages" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Public achievements access" ON "public"."achievements" FOR SELECT USING (true);



CREATE POLICY "Public matches access" ON "public"."matches" FOR SELECT USING (true);



CREATE POLICY "Public matches delete" ON "public"."matches" FOR DELETE USING (true);



CREATE POLICY "Public matches insert" ON "public"."matches" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public profiles access" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Public profiles delete" ON "public"."profiles" FOR DELETE USING (true);



CREATE POLICY "Public profiles insert" ON "public"."profiles" FOR INSERT WITH CHECK (true);



CREATE POLICY "Public user_achievements access" ON "public"."user_achievements" FOR SELECT USING (true);



CREATE POLICY "Public user_achievements insert" ON "public"."user_achievements" FOR INSERT WITH CHECK (true);



CREATE POLICY "Receivers can update entries to mark as read" ON "public"."messages" FOR UPDATE USING (("auth"."uid"() = "receiver_id")) WITH CHECK (("auth"."uid"() = "receiver_id"));



CREATE POLICY "Users can delete their friendships" ON "public"."friendships" FOR DELETE USING ((("auth"."uid"() = "user_id_1") OR ("auth"."uid"() = "user_id_2")));



CREATE POLICY "Users can insert friend requests" ON "public"."friendships" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id_1"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their friendships" ON "public"."friendships" FOR UPDATE USING ((("auth"."uid"() = "user_id_2") OR ("auth"."uid"() = "user_id_1")));



CREATE POLICY "Users can view their own friendships" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = "user_id_1") OR ("auth"."uid"() = "user_id_2")));



CREATE POLICY "Users can view their own messages" ON "public"."messages" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id")));



CREATE POLICY "Users insert own logs" ON "public"."activity_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "actor_id"));



ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


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



GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_match"("match_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_match"("match_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_match"("match_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_expired_matches"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_expired_matches"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_expired_matches"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_match"("match_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."reject_match"("match_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_match"("match_id" bigint) TO "service_role";


















GRANT ALL ON TABLE "public"."achievements" TO "anon";
GRANT ALL ON TABLE "public"."achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."achievements" TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



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































