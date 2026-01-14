import { supabase } from "./supabase";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  point_value: number;
  unlocked_at?: string; // If user has it
}

// Replaces checkAchievements with a sync approach
export const syncAchievements = async (userId: string) => {
  // console.log("Syncing achievements for:", userId);

  // 1. Fetch User Stats & Data
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (!profile) return;

  const { data: matches } = await supabase
    .from("matches")
    .select("*")
    .or(
      `team1_p1.eq.${userId},team1_p2.eq.${userId},team2_p1.eq.${userId},team2_p2.eq.${userId}`
    )
    .order("created_at", { ascending: true }) // Order by date for streak calc
    .eq("status", "confirmed");

  const matchHistory = matches || [];

  // 2. Fetch Current Achievements
  const { data: currentAchievements } = await supabase
    .from("user_achievements")
    .select("achievement_id")
    .eq("user_id", userId);

  const ownedIds = new Set<string>(
    currentAchievements?.map((a) => a.achievement_id) || []
  );

  // 3. Calculate "Should Have" Achievements
  const validIds = new Set<string>();
  const addFn = (id: string) => validIds.add(id);

  // --- CHECKS (Same Logic, just adding to validIds) ---

  // 1. 'first_blood' (Play 1 match)
  if (matchHistory.length >= 1) addFn("first_blood");

  // 2. 'veteran' (Play 10 matches)
  if (matchHistory.length >= 10) addFn("veteran");

  // 3. 'socialite' (Avatar)
  if (profile.avatar_url) addFn("socialite");

  // 4. 'winner' (First win) & Streaks
  let wins = 0;
  let streak = 0;
  let maxStreak = 0;

  matchHistory.forEach((m) => {
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

  if (wins >= 1) addFn("winner");

  // 6. Streak Milestones
  if (maxStreak >= 5) addFn("consistency");
  if (maxStreak >= 10) addFn("unstoppable");

  // 7. Match Count Milestones
  const totalMatches = matchHistory.length;
  if (totalMatches >= 50) addFn("padel_addict");
  if (totalMatches >= 100) addFn("centurion");

  // 8. Total Wins Milestones
  if (wins >= 20) addFn("dominator");
  if (wins >= 50) addFn("conqueror");
  if (wins >= 100) addFn("legend");

  // 9. Complex Checks (Iterate Matches)
  const partners = new Set<string>();

  for (const m of matchHistory) {
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

    if (hour >= 22) addFn("night_owl");
    if (hour < 9) addFn("early_bird");

    // Set/Score Checks
    if (Array.isArray(m.score)) {
      // Marathon (3 sets)
      if (
        m.score.reduce(
          (acc: number, s: any) => acc + (s.t1 + s.t2 > 0 ? 1 : 0),
          0
        ) >= 3
      ) {
        addFn("marathon");
      }

      // Won Set Checks
      m.score.forEach((s: any) => {
        const myScore = isTeam1 ? s.t1 : s.t2;
        const oppScore = isTeam1 ? s.t2 : s.t1;

        // Sharpshooter (6-1)
        if (myScore === 6 && oppScore === 1) addFn("sharpshooter");

        // Clean Sheet (6-0)
        if (myScore === 6 && oppScore === 0) addFn("clean_sheet");
      });

      // Comeback King: Lost Set 1, Won Match
      if (won && m.score.length >= 2) {
        const s1 = m.score[0];
        const myScoreS1 = isTeam1 ? s1.t1 : s1.t2;
        const oppScoreS1 = isTeam1 ? s1.t2 : s1.t1;

        if (myScoreS1 < oppScoreS1) {
          addFn("comeback_king");
        }
      }
    }
  }

  // 10. Team Player
  if (partners.size >= 5) addFn("team_player");

  // 11. Weekend Warrior
  const weekendMatches = matchHistory.filter((m) => {
    const d = new Date(m.created_at);
    const day = d.getDay();
    return day === 0 || day === 6;
  }).length;
  if (weekendMatches >= 5) addFn("weekend_warrior");

  // 4. SYNC (Diffing)
  const toAdd = [...validIds].filter((id) => !ownedIds.has(id));
  const toRemove = [...ownedIds].filter((id) => !validIds.has(id));

  if (toAdd.length > 0) {
    // console.log("Unlocking:", toAdd);
    const { error: addError } = await supabase
      .from("user_achievements")
      .insert(toAdd.map((id) => ({ user_id: userId, achievement_id: id })));
    if (addError) throw addError;
  }

  if (toRemove.length > 0) {
    // console.log("Revoking:", toRemove);
    const { error: removeError } = await supabase
      .from("user_achievements")
      .delete()
      .eq("user_id", userId)
      .in("achievement_id", toRemove);
  }

  return { added: toAdd, removed: toRemove };
};

// Alias for backward compatibility if needed, though we should update callers
export const checkAchievements = syncAchievements;
