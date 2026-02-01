-- Achievements Seeding Migration
-- Applied via migration to avoid db reset
INSERT INTO public.achievements (id, name, description, icon, point_value)
VALUES
    ('first_blood', 'First Blood', 'Play your first match', 'Target', 10),
    ('veteran', 'Veteran', 'Play 10 matches', 'Medal', 20),
    ('socialite', 'Socialite', 'Add a profile picture', 'Camera', 5),
    ('winner', 'Winner', 'Win your first match', 'Trophy', 15),
    ('consistency', 'Consistency', 'Reach a 5-match streak', 'Flame', 30),
    ('unstoppable', 'Unstoppable', 'Reach a 10-match streak', 'Rocket', 50),
    ('padel_addict', 'Padel Addict', 'Play 50 matches', 'Zap', 40),
    ('centurion', 'Centurion', 'Play 100 matches', 'Crown', 100),
    ('dominator', 'Dominator', 'Win 20 matches', 'Swords', 40),
    ('conqueror', 'Conqueror', 'Win 50 matches', 'Castle', 80),
    ('legend', 'Legend', 'Win 100 matches', 'Trophy', 200),
    ('night_owl', 'Night Owl', 'Play a match after 10 PM', 'Moon', 15),
    ('early_bird', 'Early Bird', 'Play a match before 9 AM', 'Sun', 15),
    ('marathon', 'Marathon', 'Play a 3-set match', 'Timer', 20),
    ('sharpshooter', 'Sharpshooter', 'Win a set 6-1', 'Crosshair', 25),
    ('clean_sheet', 'Clean Sheet', 'Win a set 6-0', 'Shield', 30),
    ('comeback_king', 'Comeback King', 'Win a match after losing the first set', 'RefreshCcw', 35),
    ('team_player', 'Team Player', 'Play with 5 different partners', 'Users', 25),
    ('weekend_warrior', 'Weekend Warrior', 'Play 5 matches on weekends', 'Calendar', 20)
ON CONFLICT (id) DO UPDATE 
SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    point_value = EXCLUDED.point_value;
