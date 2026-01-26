-- Function to detect potentially fraudulent activity
-- Logic: Finds players with high win rates but low opponent diversity (farming the same people)

CREATE OR REPLACE FUNCTION public.get_suspicious_activity_report(
    min_matches int DEFAULT 5,         -- Minimum matches to be considered (e.g., 5 to start)
    min_win_rate float DEFAULT 0.85,   -- Suspicious win rate (e.g., 85%+)
    max_diversity_score float DEFAULT 0.4 -- Low diversity score means playing same people (e.g., < 0.4)
)
RETURNS TABLE (
    player_id uuid,
    username text,
    avatar_url text,
    elo int,
    total_matches bigint,
    total_wins bigint,
    win_rate numeric,
    unique_opponents bigint,
    diversity_score numeric, -- Unique Opponents / Total Matches. 1.0 = All different. 0.1 = Same person always.
    suspicion_level text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
