-- ADD MORE ACHIEVEMENTS (Total ~20)

-- We use ON CONFLICT (id) DO UPDATE to ensure we can rerun this without error if IDs exist,
-- or basic INSERT with conflicts ignored if we just want to add new ones. 
-- Since we are changing points/descriptions, we should update.

INSERT INTO "public"."achievements" ("id", "name", "description", "icon", "point_value") VALUES 
-- EXISTING (Updated Values)
('first_blood', 'First Blood', 'Play your first match', 'Sword', '10'),
('winner', 'Winner', 'Win your first match', 'Trophy', '25'),
('socialite', 'Socialite', 'Upload a profile picture', 'Camera', '15'),
('on_fire', 'On Fire', 'Win 3 matches in a row', 'Flame', '60'),
('veteran', 'Veteran', 'Play 10 matches', 'Medal', '50'),

-- NEW (Progressive / Harder)
('consistency', 'Consistency', 'Win 5 matches in a row', 'Flame', '150'),
('unstoppable', 'Unstoppable', 'Win 10 matches in a row', 'Flame', '500'),
('padel_addict', 'Padel Addict', 'Play 50 matches', 'Medal', '200'),
('centurion', 'Centurion', 'Play 100 matches', 'Medal', '500'),

('dominator', 'Dominator', 'Win 20 total matches', 'Trophy', '150'),
('conqueror', 'Conqueror', 'Win 50 total matches', 'Trophy', '400'),
('legend', 'Legend', 'Win 100 total matches', 'Trophy', '1000'),

('clean_sheet', 'Clean Sheet', 'Win a match without losing a game (Set won 6-0)', 'Sword', '100'),
('comeback_king', 'Comeback King', 'Win after losing the first set', 'Sword', '75'),
('team_player', 'Team Player', 'Play with 5 different partners', 'Camera', '50'),
('weekend_warrior', 'Weekend Warrior', 'Play 5 matches in a weekend', 'Medal', '60'),
('night_owl', 'Night Owl', 'Play a match after 10 PM', 'Camera', '30'),
('early_bird', 'Early Bird', 'Play a match before 9 AM', 'Camera', '30'),
('sharpshooter', 'Sharpshooter', 'Win a set 6-1', 'Sword', '40'),
('marathon', 'Marathon', 'Play a 3-set match', 'Medal', '35')

ON CONFLICT (id) DO UPDATE SET
name = EXCLUDED.name,
description = EXCLUDED.description,
icon = EXCLUDED.icon,
point_value = EXCLUDED.point_value;
