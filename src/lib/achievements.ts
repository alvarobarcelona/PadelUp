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

    // 5. 'on_fire' (Win 3 in a row)
    if (maxStreak >= 3) await unlock("on_fire");

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
