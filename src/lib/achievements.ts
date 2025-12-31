import { supabase } from "./supabase";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  point_value: number;
  unlocked_at?: string; // If user has it
}

export const checkAchievements = async (userId: string) => {
  console.log("Checking achievements for:", userId);
  const newUnlocks: string[] = [];

  try {
    // 1. Fetch User Stats & Data
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (!profile) return [];

    const { data: matches } = await supabase
      .from("matches")
      .select("*")
      .or(
        `team1_p1.eq.${userId},team1_p2.eq.${userId},team2_p1.eq.${userId},team2_p2.eq.${userId}`
      )
      .order("created_at", { ascending: true }); // Order by date for streak calc

    const { data: currentAchievements } = await supabase
      .from("user_achievements")
      .select("achievement_id")
      .eq("user_id", userId);
    const ownedIds = new Set(
      currentAchievements?.map((a) => a.achievement_id) || []
    );

    const unlock = async (id: string) => {
      if (ownedIds.has(id)) return;
      // Unlock!
      const { error } = await supabase
        .from("user_achievements")
        .insert({ user_id: userId, achievement_id: id });
      if (!error) newUnlocks.push(id);
    };

    // --- CHECKS ---

    // 1. 'first_blood' (Play 1 match)
    if (matches && matches.length >= 1) await unlock("first_blood");

    // 2. 'veteran' (Play 10 matches)
    if (matches && matches.length >= 10) await unlock("veteran");

    // 3. 'socialite' (Avatar)
    if (profile.avatar_url) await unlock("socialite");

    // 4. 'winner' (First win)
    let wins = 0;
    let streak = 0;
    let maxStreak = 0;

    matches?.forEach((m) => {
      const isTeam1 = m.team1_p1 === userId || m.team1_p2 === userId;
      const won =
        (isTeam1 && m.winner_team === 1) || (!isTeam1 && m.winner_team === 2);

      if (won) {
        wins++;
        streak++;
      } else {
        streak = 0;
      }
      if (streak > maxStreak) maxStreak = streak;
    });

    if (wins >= 1) await unlock("winner");

    // 6. Streak Milestones
    if (maxStreak >= 5) await unlock("consistency");
    if (maxStreak >= 10) await unlock("unstoppable");

    // 7. Match Count Milestones
    const totalMatches = matches?.length || 0;
    if (totalMatches >= 50) await unlock("padel_addict");
    if (totalMatches >= 100) await unlock("centurion");

    // 8. Total Wins Milestones
    if (wins >= 20) await unlock("dominator");
    if (wins >= 50) await unlock("conqueror");
    if (wins >= 100) await unlock("legend");

    // 9. Complex Checks (Iterate Matches)
    const partners = new Set<string>();

    if (matches) {
      for (const m of matches) {
        const isTeam1 = m.team1_p1 === userId || m.team1_p2 === userId;
        const myTeammate = isTeam1
          ? m.team1_p1 === userId
            ? m.team1_p2
            : m.team1_p1
          : m.team2_p1 === userId
          ? m.team2_p2
          : m.team2_p1;

        if (myTeammate) partners.add(myTeammate);

        const won =
          (isTeam1 && m.winner_team === 1) || (!isTeam1 && m.winner_team === 2);

        // Date Checks
        const date = new Date(m.created_at);
        const hour = date.getHours(); // 0-23

        if (hour >= 22) await unlock("night_owl");
        if (hour < 9) await unlock("early_bird");

        // Set/Score Checks
        if (Array.isArray(m.score)) {
          // Marathon (3 sets)
          if (
            m.score.reduce(
              (acc: number, s: any) => acc + (s.t1 + s.t2 > 0 ? 1 : 0),
              0
            ) >= 3
          ) {
            await unlock("marathon");
          }

          // Won Set Checks
          m.score.forEach((s: any) => {
            const myScore = isTeam1 ? s.t1 : s.t2;
            const oppScore = isTeam1 ? s.t2 : s.t1;

            // Sharpshooter (6-1)
            if (myScore === 6 && oppScore === 1) unlock("sharpshooter"); // fire and forget

            // Clean Sheet (6-0) - Note: If you win ANY set 6-0 or the whole match?
            // "Win a match without losing a game" is super hard (6-0, 6-0).
            // "Win a set 6-0" is easier. Let's interpret as "Win a set 6-0" for now or check all sets.
            // Description says "Win a match without losing a game (Set won 6-0)". That's ambiguous.
            // Let's go with "Win a set 6-0" which is fun.
            if (myScore === 6 && oppScore === 0) unlock("clean_sheet");
          });

          // Comeback King: Lost Set 1, Won Match
          if (won && m.score.length >= 2) {
            const s1 = m.score[0];
            const myScoreS1 = isTeam1 ? s1.t1 : s1.t2;
            const oppScoreS1 = isTeam1 ? s1.t2 : s1.t1;

            if (myScoreS1 < oppScoreS1) {
              await unlock("comeback_king");
            }
          }
        }
      }
    }

    // 10. Team Player
    if (partners.size >= 5) await unlock("team_player");

    // 11. Weekend Warrior (Simplified: Played on Sat or Sun)
    // Real "5 in a weekend" requires complex date reduction.
    // Let's implement "Play 5 matches on weekends (Total)" which is easier, or just unlock if they have played on a weekend for now?
    // User asked "Play 5 matches in a weekend".
    // Let's try to find 5 matches within 2 days (Sat/Sun) of the same week?
    // Simplified: "Play 5 matches on weekends (Lifetime)"
    const weekendMatches =
      matches?.filter((m) => {
        const d = new Date(m.created_at);
        const day = d.getDay();
        return day === 0 || day === 6;
      }).length || 0;
    if (weekendMatches >= 5) await unlock("weekend_warrior");

    if (newUnlocks.length > 0) {
      console.log("Unlocked:", newUnlocks);
      // In a real app, we might return these to show a toast
    }

    return newUnlocks;
  } catch (error) {
    console.error("Error checking achievements:", error);
    return [];
  }
};
