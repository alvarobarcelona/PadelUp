-- MIGRATION SCRIPT: SYNC PROFILE ID WITH AUTH ID
-- This script fixes the issue where profile 'id' is different from 'auth_id'.

DO $$
DECLARE
    r RECORD;
    new_id UUID;
    old_id UUID;
    conflict_count INT;
BEGIN
    -- Iterate over profiles that need migration (where auth_id is set but different from id)
    FOR r IN SELECT * FROM profiles WHERE auth_id IS NOT NULL AND id != auth_id LOOP
        
        old_id := r.id;
        new_id := r.auth_id;

        RAISE NOTICE 'Migrating User: % (Old: %, New: %)', r.username, old_id, new_id;

        -- 1. Check if a profile with the target ID already exists (e.g., auto-created empty profile)
        -- If it exists, we DELETE it to make space for the "real" data we are moving from old_id.
        SELECT COUNT(*) INTO conflict_count FROM profiles WHERE id = new_id;
        
        IF conflict_count > 0 THEN
            RAISE NOTICE '  - Target ID exists (Collision). Deleting empty/duplicate profile...';
            DELETE FROM profiles WHERE id = new_id;
        END IF;

        -- 2. Handle Unique Constraint on Username
        -- We cannot insert the new row with the same username immediately.
        -- Rename the OLD profile temporarily.
        UPDATE profiles SET username = r.username || '_MIGRATING' WHERE id = old_id;

        -- 3. Insert NEW Profile with correct ID (auth_id)
        -- We explicitly list columns to avoid issues with potential extra columns like 'email' if present/absent.
        -- Note: If you have an 'email' column in profiles, add it here manually.
        INSERT INTO profiles (
            id, 
            auth_id, 
            username, 
            avatar_url, 
            elo, 
            notifications_enabled, 
            subscription_end_date, 
            created_at, 
            approved, 
            is_admin
        )
        VALUES (
            new_id, 
            new_id, 
            r.username, -- Use original username
            r.avatar_url, 
            r.elo, 
            r.notifications_enabled, 
            r.subscription_end_date, 
            r.created_at, 
            r.approved, 
            r.is_admin
        );

        -- 4. Update Matches (Foreign Keys)
        -- Update all 4 player columns in matches table
        UPDATE matches SET team1_p1 = new_id WHERE team1_p1 = old_id;
        UPDATE matches SET team1_p2 = new_id WHERE team1_p2 = old_id;
        UPDATE matches SET team2_p1 = new_id WHERE team2_p1 = old_id;
        UPDATE matches SET team2_p2 = new_id WHERE team2_p2 = old_id;

        -- 5. Update Achievements (Foreign Keys)
        UPDATE user_achievements SET user_id = new_id WHERE user_id = old_id;

        -- 6. Delete Old Profile
        DELETE FROM profiles WHERE id = old_id;

        RAISE NOTICE '  - Success!';

    END LOOP;
END $$;
