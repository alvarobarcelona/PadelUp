DROP FUNCTION IF EXISTS public.get_player_match_history(uuid, int);

CREATE OR REPLACE FUNCTION public.get_player_match_history(id_input uuid, limit_count int DEFAULT 10)
RETURNS TABLE (
  id bigint,
  created_at timestamptz,
  status text,
  winner_team int,
  score jsonb,
  reason text,
  team1_p1 text,
  team1_p2 text,
  team2_p1 text,
  team2_p2 text,
  actor_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
