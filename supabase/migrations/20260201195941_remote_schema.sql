revoke delete on table "public"."notification_history" from "anon";

revoke insert on table "public"."notification_history" from "anon";

revoke references on table "public"."notification_history" from "anon";

revoke select on table "public"."notification_history" from "anon";

revoke trigger on table "public"."notification_history" from "anon";

revoke truncate on table "public"."notification_history" from "anon";

revoke update on table "public"."notification_history" from "anon";

revoke delete on table "public"."notification_history" from "authenticated";

revoke insert on table "public"."notification_history" from "authenticated";

revoke references on table "public"."notification_history" from "authenticated";

revoke select on table "public"."notification_history" from "authenticated";

revoke trigger on table "public"."notification_history" from "authenticated";

revoke truncate on table "public"."notification_history" from "authenticated";

revoke update on table "public"."notification_history" from "authenticated";

revoke delete on table "public"."notification_history" from "service_role";

revoke insert on table "public"."notification_history" from "service_role";

revoke references on table "public"."notification_history" from "service_role";

revoke select on table "public"."notification_history" from "service_role";

revoke trigger on table "public"."notification_history" from "service_role";

revoke truncate on table "public"."notification_history" from "service_role";

revoke update on table "public"."notification_history" from "service_role";

alter table "public"."notification_history" drop constraint "notification_history_user_id_fkey";

drop function if exists "public"."get_reminder_targets"(check_day_of_week integer);

alter table "public"."notification_history" drop constraint "notification_history_pkey";

drop index if exists "public"."idx_notification_history_user_date";

drop index if exists "public"."notification_history_pkey";

drop table "public"."notification_history";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.process_expired_matches()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m record;
BEGIN
  -- Find all pending matches that have passed their auto_confirm_at time
  -- CRITICAL: ORDER BY id ASC (or created_at ASC) to ensure we process them strictly chronologically
  -- This prevents ELO calculation corruption when multiple matches expire at once.
  FOR m IN 
      SELECT id 
      FROM public.matches 
      WHERE status = 'pending' AND auto_confirm_at < now() 
      ORDER BY id ASC 
  LOOP
    PERFORM public.confirm_match(m.id);
  END LOOP;
END;
$function$
;




