// Simple Elo Rating Implementation

export const K_FACTOR = 32; // Default Standard
export const STARTING_ELO = 1150;
export const DEFAULT_ELO = STARTING_ELO; // Alias for backward compatibility

// Dynamic K-Factors
export const K_PLACEMENT = 48; // 0-10 matches
export const K_STANDARD = 32; // 10-30 matches
export const K_STABLE = 24; // 30+ matches

export const getKFactor = (matchesPlayed: number) => {
  if (matchesPlayed < 10) return K_PLACEMENT;
  if (matchesPlayed < 30) return K_STANDARD;
  return K_STABLE;
};

export const LEVELS = [
  { level: 1, min: 0, max: 800, label: "Beginner" },
  { level: 2, min: 800, max: 900, label: "Basic" },
  { level: 2.5, min: 900, max: 1050, label: "Basic+" },
  { level: 3, min: 1050, max: 1200, label: "Lower Intermediate" },
  { level: 3.5, min: 1200, max: 1350, label: "Intermediate" },
  { level: 4, min: 1350, max: 1500, label: "Upper Intermediate" },
  { level: 4.5, min: 1500, max: 1700, label: "Advanced" },
  { level: 5, min: 1700, max: 9999, label: "Pro / Competition" },
];

export const getLevelFromElo = (elo: number) => {
  return LEVELS.find((l) => elo >= l.min && elo < l.max) || LEVELS[0];
};

export const calculateExpectedScore = (ratingA: number, ratingB: number) => {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
};

export const calculateNewRating = (
  currentRating: number,
  actualScore: number,
  expectedScore: number,
  kFactor: number = K_FACTOR
) => {
  return Math.round(currentRating + kFactor * (actualScore - expectedScore));
};

export const calculateTeamAverage = (p1Elo: number, p2Elo: number) => {
  return Math.round((p1Elo + p2Elo) / 2);
};

// Deprecated in favor of individual calculations in NewMatch.tsx
// But kept for backward compatibility if needed, using standard K
export const calculateMatchPoints = (
  p1Elo: number,
  p2Elo: number,
  p3Elo: number,
  p4Elo: number,
  winnerTeam: number
) => {
  const t1Avg = calculateTeamAverage(p1Elo, p2Elo);
  const t2Avg = calculateTeamAverage(p3Elo, p4Elo);

  let points = 0;
  if (winnerTeam === 1) {
    const expected = calculateExpectedScore(t1Avg, t2Avg);
    points = Math.round(K_FACTOR * (1 - expected));
  } else {
    const expected = calculateExpectedScore(t2Avg, t1Avg);
    points = Math.round(K_FACTOR * (1 - expected));
  }
  return points;
};

// Replays history to find the points exchanged in a specific match
export const getMatchPointsFromHistory = (
  allMatches: any[],
  targetMatchId: number,
  initialElo = DEFAULT_ELO
) => {
  // 1. Sort matches chronologically (Oldest first)
  const chronological = [...allMatches].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // 2. Track player ELOs
  const playerElos: Record<string, number> = {};

  const getElo = (id: string) => playerElos[id] || initialElo;

  // 3. Replay
  for (const match of chronological) {
    const { team1_p1, team1_p2, team2_p1, team2_p2, winner_team, id } = match;

    const p1 = getElo(team1_p1);
    const p2 = getElo(team1_p2);
    const p3 = getElo(team2_p1);
    const p4 = getElo(team2_p2);

    const points = calculateMatchPoints(p1, p2, p3, p4, winner_team);

    // If this is our target match, grab the points and STOP/RETURN?
    // Actually, we need to return the points that WERE exchanged.
    // Since this function is used to finding out what happened, we just return 'points' when we hit the ID.
    if (id === targetMatchId) {
      // We can capture the ELOs at that moment too if needed, but for "Revert", we just need the points.
      // But wait, for "Edit", we might need the ELOs at that time to re-calculate differently.
      return { points, p1Elo: p1, p2Elo: p2, p3Elo: p3, p4Elo: p4 };
    }

    // Apply ELO changes to state for next iteration
    if (winner_team === 1) {
      playerElos[team1_p1] = p1 + points;
      playerElos[team1_p2] = p2 + points;
      playerElos[team2_p1] = p3 - points;
      playerElos[team2_p2] = p4 - points;
    } else {
      playerElos[team1_p1] = p1 - points;
      playerElos[team1_p2] = p2 - points;
      playerElos[team2_p1] = p3 + points;
      playerElos[team2_p2] = p4 + points;
    }
  }

  return null; // Match not found
};
