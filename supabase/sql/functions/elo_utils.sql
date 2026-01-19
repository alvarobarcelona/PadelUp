-- ELO Helper Functions

-- 1. Get K-Factor
-- matches_played < 10 -> 48
-- matches_played < 30 -> 32
-- matches_played >= 30 -> 24
CREATE OR REPLACE FUNCTION public.get_k_factor(matches_played int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
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

-- 2. Calculate Expected Score
-- 1 / (1 + 10^((rating_b - rating_a) / 400))
CREATE OR REPLACE FUNCTION public.calculate_expected_score(rating_a int, rating_b int)
RETURNS float
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN 1.0 / (1.0 + power(10.0, (rating_b::float - rating_a::float) / 400.0));
END;
$$;

-- 3. Calculate New Rating
-- current + K * (actual - expected)
CREATE OR REPLACE FUNCTION public.calculate_new_rating(
  current_rating int,
  actual_score float,
  expected_score float,
  k_factor int
)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN round(current_rating::float + k_factor::float * (actual_score - expected_score))::int;
END;
$$;
