-- Secure Database Functions
-- Fixes `function_search_path_mutable` warnings by explicitly setting search_path

-- 1. get_k_factor
ALTER FUNCTION public.get_k_factor(integer) SET search_path = public;

-- 2. calculate_expected_score
ALTER FUNCTION public.calculate_expected_score(integer, integer) SET search_path = public;

-- 3. calculate_new_rating
ALTER FUNCTION public.calculate_new_rating(integer, double precision, double precision, integer) SET search_path = public;

-- 4. finish_tournament_with_verification
ALTER FUNCTION public.finish_tournament_with_verification(bigint) SET search_path = public;

-- 5. report_tournament_issue
ALTER FUNCTION public.report_tournament_issue(bigint, uuid, text) SET search_path = public;

-- 6. verify_tournament
ALTER FUNCTION public.verify_tournament(bigint, uuid, boolean, text) SET search_path = public;
