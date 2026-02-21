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
  { level: 1, min: 0, max: 800, key: "beginner" },
  { level: 2, min: 800, max: 900, key: "basic" },
  { level: 2.5, min: 900, max: 930, key: "basic_plus" },
  { level: 2.6, min: 930, max: 960, key: "basic_plus" },
  { level: 2.7, min: 960, max: 990, key: "basic_plus" },
  { level: 2.8, min: 990, max: 1020, key: "basic_plus" },
  { level: 2.9, min: 1020, max: 1050, key: "basic_plus" },
  { level: 3.0, min: 1050, max: 1080, key: "lower_intermediate" },
  { level: 3.1, min: 1080, max: 1110, key: "lower_intermediate" },
  { level: 3.2, min: 1110, max: 1140, key: "lower_intermediate" },
  { level: 3.3, min: 1140, max: 1170, key: "lower_intermediate" },
  { level: 3.4, min: 1170, max: 1200, key: "lower_intermediate" },
  { level: 3.5, min: 1200, max: 1230, key: "intermediate" },
  { level: 3.6, min: 1230, max: 1260, key: "intermediate" },
  { level: 3.7, min: 1260, max: 1290, key: "intermediate" },
  { level: 3.8, min: 1290, max: 1320, key: "intermediate" },
  { level: 3.9, min: 1320, max: 1350, key: "intermediate" },
  { level: 4.0, min: 1350, max: 1380, key: "upper_intermediate" },
  { level: 4.1, min: 1380, max: 1410, key: "upper_intermediate" },
  { level: 4.2, min: 1410, max: 1440, key: "upper_intermediate" },
  { level: 4.3, min: 1440, max: 1470, key: "upper_intermediate" },
  { level: 4.4, min: 1470, max: 1500, key: "upper_intermediate" },
  { level: 4.5, min: 1500, max: 1540, key: "advanced" },
  { level: 4.6, min: 1540, max: 1580, key: "advanced" },
  { level: 4.7, min: 1580, max: 1620, key: "advanced" },
  { level: 4.8, min: 1620, max: 1660, key: "advanced" },
  { level: 4.9, min: 1660, max: 1700, key: "advanced" },
  { level: 5.0, min: 1700, max: 1740, key: "advanced_plus" },
  { level: 5.1, min: 1740, max: 1780, key: "advanced_plus" },
  { level: 5.2, min: 1780, max: 1820, key: "advanced_plus" },
  { level: 5.3, min: 1820, max: 1860, key: "advanced_plus" },
  { level: 5.4, min: 1860, max: 1900, key: "advanced_plus" },
  { level: 5.5, min: 1900, max: 1940, key: "pro" },
  { level: 5.6, min: 1940, max: 1980, key: "pro" },
  { level: 5.7, min: 1980, max: 2020, key: "pro" },
  { level: 5.8, min: 2020, max: 2060, key: "pro" },
  { level: 5.9, min: 2060, max: 2100, key: "pro" },
  { level: 6.0, min: 2100, max: 2140, key: "wpt" },
  { level: 6.1, min: 2140, max: 2180, key: "wpt" },
  { level: 6.2, min: 2180, max: 2220, key: "wpt" },
  { level: 6.3, min: 2220, max: 2260, key: "wpt" },
  { level: 6.4, min: 2260, max: 2300, key: "wpt" },
  { level: 6.5, min: 2300, max: 2340, key: "wpt" },
  { level: 6.6, min: 2340, max: 2380, key: "wpt" },
  { level: 6.7, min: 2380, max: 2420, key: "wpt" },
  { level: 6.8, min: 2420, max: 2460, key: "wpt" },
  { level: 6.9, min: 2460, max: 2500, key: "wpt" },
  { level: 7.0, min: 2500, max: 3000, key: "wpt" },
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
  kFactor: number = K_FACTOR,
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
  winnerTeam: number,
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
  initialElo = DEFAULT_ELO,
) => {
  // 1. Sort matches chronologically (Oldest first)
  const chronological = [...allMatches]
    .filter((m) => m.status === "confirmed") // Only replay confirmed matches
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  // 2. Track player ELOs and Match Counts (for K-Factor)
  const playerElos: Record<string, number> = {};
  const playerMatches: Record<string, number> = {};

  const getElo = (id: string) => playerElos[id] || initialElo;
  const getMatchCount = (id: string) => playerMatches[id] || 0;

  // 3. Replay
  for (const match of chronological) {
    const { team1_p1, team1_p2, team2_p1, team2_p2, winner_team, id } = match;

    const p1 = getElo(team1_p1);
    const p2 = getElo(team1_p2);
    const p3 = getElo(team2_p1);
    const p4 = getElo(team2_p2);

    // Dynamic K-Factors
    const k1 = getKFactor(getMatchCount(team1_p1));
    const k2 = getKFactor(getMatchCount(team1_p2));
    const k3 = getKFactor(getMatchCount(team2_p1));
    const k4 = getKFactor(getMatchCount(team2_p2));

    const t1Avg = calculateTeamAverage(p1, p2);
    const t2Avg = calculateTeamAverage(p3, p4);

    const t1Expected = calculateExpectedScore(t1Avg, t2Avg);
    const t2Expected = calculateExpectedScore(t2Avg, t1Avg);

    // Calculate individual points for each player
    const t1Score = winner_team === 1 ? 1 : 0;
    const t2Score = winner_team === 2 ? 1 : 0;

    const p1Diff = Math.round(k1 * (t1Score - t1Expected));
    const p2Diff = Math.round(k2 * (t1Score - t1Expected));
    const p3Diff = Math.round(k3 * (t2Score - t2Expected));
    const p4Diff = Math.round(k4 * (t2Score - t2Expected));

    // If this is our target match, return the EXACT diffs
    if (id === targetMatchId) {
      return {
        points: null, // Deprecated single point value
        diffs: { p1: p1Diff, p2: p2Diff, p3: p3Diff, p4: p4Diff },
        p1Elo: p1,
        p2Elo: p2,
        p3Elo: p3,
        p4Elo: p4,
      };
    }

    // Apply ELO changes
    playerElos[team1_p1] = p1 + p1Diff;
    playerElos[team1_p2] = p2 + p2Diff;
    playerElos[team2_p1] = p3 + p3Diff;
    playerElos[team2_p2] = p4 + p4Diff;

    // Increment Match Counts
    playerMatches[team1_p1] = getMatchCount(team1_p1) + 1;
    playerMatches[team1_p2] = getMatchCount(team1_p2) + 1;
    playerMatches[team2_p1] = getMatchCount(team2_p1) + 1;
    playerMatches[team2_p2] = getMatchCount(team2_p2) + 1;
  }
  return null;
};
