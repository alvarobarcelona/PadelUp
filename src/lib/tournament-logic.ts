// Logic ported from Padel Tournaments project
// Adapted for Supabase DB structures

export interface TournamentParticipant {
  id: number; // BigInt from DB
  player_id: string | null;
  display_name: string;
  score: number;
  matches_played: number;
  active: boolean;
}

export interface TournamentMatch {
  id?: number;
  tournament_id: number;
  round_number: number;
  court_number: number;
  team1_p1_text: string;
  team1_p1_id?: string | null;
  team1_p2_text: string;
  team1_p2_id?: string | null;
  team2_p1_text: string;
  team2_p1_id?: string | null;
  team2_p2_text: string;
  team2_p2_id?: string | null;
  score_team1: number;
  score_team2: number;
  completed: boolean;
}

export interface RoundHistory {
  round_number: number;
  matches: TournamentMatch[];
}

// Utility: Shuffle
export const shuffle = <T>(array: T[]): T[] => {
  const arr = [...array];
  let currentIndex = arr.length,
    randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [arr[currentIndex], arr[randomIndex]] = [
      arr[randomIndex],
      arr[currentIndex],
    ];
  }
  return arr;
};

// --- AMERICANO LOGIC (BALANCED OPPONENTS) ---
// Guarantees unique partners AND evenly distributed opponents

export const generateAmericanoRound = (
  roundNum: number,
  participants: TournamentParticipant[],
  tournamentId: number,
  matchHistory: TournamentMatch[] = [],
): TournamentMatch[] => {
  /* ---------------------------------------------------
     0. Pre-process: Shuffle for Round 1
  --------------------------------------------------- */
  // Create a local copy of participants to work with
  // If it's the first round, shuffle them to avoid deterministic start based on input order
  let currentParticipants = [...participants];
  if (roundNum === 1 && (!matchHistory || matchHistory.length === 0)) {
    currentParticipants = shuffle(currentParticipants);
  }

  /* ---------------------------------------------------
     1. Build History Matrices (Partners & Opponents)
  --------------------------------------------------- */
  const partnerHistory: Record<string, Set<string>> = {};
  const opponentHistory: Record<string, Record<string, number>> = {};

  const pNames = currentParticipants.map((p) => p.display_name);
  pNames.forEach((n) => {
    partnerHistory[n] = new Set();
    opponentHistory[n] = {};
  });

  matchHistory.forEach((m) => {
    const t1 = [m.team1_p1_text, m.team1_p2_text];
    const t2 = [m.team2_p1_text, m.team2_p2_text];

    // Partnerships
    partnerHistory[t1[0]].add(t1[1]);
    partnerHistory[t1[1]].add(t1[0]);
    partnerHistory[t2[0]].add(t2[1]);
    partnerHistory[t2[1]].add(t2[0]);

    // Opponents
    t1.forEach((p1) =>
      t2.forEach((p2) => {
        opponentHistory[p1][p2] = (opponentHistory[p1][p2] || 0) + 1;
        opponentHistory[p2][p1] = (opponentHistory[p2][p1] || 0) + 1;
      }),
    );
  });

  /* ---------------------------------------------------
     2. Identify Valid Partnerships (Unused so far)
  --------------------------------------------------- */
  const allPossiblePairs: [TournamentParticipant, TournamentParticipant][] = [];
  for (let i = 0; i < currentParticipants.length; i++) {
    for (let j = i + 1; j < currentParticipants.length; j++) {
      const p1 = currentParticipants[i];
      const p2 = currentParticipants[j];
      if (!partnerHistory[p1.display_name].has(p2.display_name)) {
        allPossiblePairs.push([p1, p2]);
      }
    }
  }

  /* ---------------------------------------------------
     3. Search for Round Configuration
        (4 unique pairs covering all 8 players)
  --------------------------------------------------- */
  const findRoundConfigs = (
    remainingPairs: [TournamentParticipant, TournamentParticipant][],
    usedPlayers: Set<string>,
    currentPairs: [TournamentParticipant, TournamentParticipant][],
  ): [TournamentParticipant, TournamentParticipant][][] => {
    if (currentPairs.length === currentParticipants.length / 2)
      return [currentPairs];

    let results: [TournamentParticipant, TournamentParticipant][][] = [];
    for (let i = 0; i < remainingPairs.length; i++) {
      const pair = remainingPairs[i];
      if (
        !usedPlayers.has(pair[0].display_name) &&
        !usedPlayers.has(pair[1].display_name)
      ) {
        const nextUsed = new Set(usedPlayers);
        nextUsed.add(pair[0].display_name);
        nextUsed.add(pair[1].display_name);

        results = results.concat(
          findRoundConfigs(remainingPairs.slice(i + 1), nextUsed, [
            ...currentPairs,
            pair,
          ]),
        );

        if (results.length > 50) break;
      }
    }
    return results;
  };

  const possibleRoundPairs = findRoundConfigs(allPossiblePairs, new Set(), []);

  /* ---------------------------------------------------
     4. Find Best Matchups within each configuration
  --------------------------------------------------- */
  let bestRound: TournamentMatch[] = [];
  let minGlobalPenalty = Infinity;

  // Helper: Generate all ways to pair up the pairs (e.g. 0vs1, 2vs3 OR 0vs2, 1vs3)
  const generateMatchupCombinations = (
    indices: number[],
  ): [number, number][][] => {
    if (indices.length === 0) return [[]];
    if (indices.length === 2) return [[[indices[0], indices[1]]]];

    const first = indices[0];
    const rest = indices.slice(1);
    const results: [number, number][][] = [];

    // Try pairing 'first' with each other index
    for (let i = 0; i < rest.length; i++) {
      const partner = rest[i];
      const remaining = rest.filter((_, idx) => idx !== i);

      // Recurse for the remaining pairs
      const subCombinations = generateMatchupCombinations(remaining);

      for (const sub of subCombinations) {
        results.push([[first, partner], ...sub]);
      }
    }
    return results;
  };

  // Generate indices based on number of pairs
  const pairIndices =
    possibleRoundPairs.length > 0
      ? Array.from({ length: possibleRoundPairs[0].length }, (_, i) => i)
      : [];
  const matchupOptions = generateMatchupCombinations(pairIndices);

  // For each way to pick matches, find the best configuration
  for (const config of possibleRoundPairs) {
    for (const option of matchupOptions) {
      const currentPenalty = option.reduce((acc, [idxA, idxB]) => {
        const p1 = config[idxA];
        const p2 = config[idxB];
        const t1 = [p1[0].display_name, p1[1].display_name];
        const t2 = [p2[0].display_name, p2[1].display_name];

        let matchPenalty = 0;
        t1.forEach((n1) =>
          t2.forEach((n2) => {
            const count = opponentHistory[n1][n2] || 0;
            if (count >= 2) matchPenalty += 1000000; // STRICT LIMIT 2
            if (count === 0) matchPenalty -= 50; // FAVOR NEW OPPONENTS
            matchPenalty += count * 10;
          }),
        );
        return acc + matchPenalty;
      }, 0);

      if (currentPenalty < minGlobalPenalty) {
        minGlobalPenalty = currentPenalty;
        bestRound = option.map(([idxA, idxB], courtIdx) => {
          const p1 = config[idxA];
          const p2 = config[idxB];
          return {
            tournament_id: tournamentId,
            round_number: roundNum,
            court_number: courtIdx + 1,
            team1_p1_text: p1[0].display_name,
            team1_p1_id: p1[0].player_id,
            team1_p2_text: p1[1].display_name,
            team1_p2_id: p1[1].player_id,
            team2_p1_text: p2[0].display_name,
            team2_p1_id: p2[0].player_id,
            team2_p2_text: p2[1].display_name,
            team2_p2_id: p2[1].player_id,
            score_team1: 0,
            score_team2: 0,
            completed: false,
          };
        });
      }
    }
  }

  // 5. Court Rotation Logic
  // Sort matches by first player name to ensure canonical order
  bestRound.sort((a, b) => a.team1_p1_text.localeCompare(b.team1_p1_text));

  // Assign courts with rotation offset based on round number
  // This ensures players shift courts every round instead of staying on the same one
  bestRound.forEach((match, index) => {
    match.court_number = ((index + roundNum - 1) % bestRound.length) + 1;
  });

  return bestRound;
};

// Generate Mexicano Round
// Based on current ranking (Score)
export const generateMexicanoRound = (
  roundNum: number,
  participants: TournamentParticipant[],
  tournamentId: number,
  matchHistory?: TournamentMatch[],
): TournamentMatch[] => {
  // Sort players by score (descending)
  const sorted = [...participants].sort((a, b) => b.score - a.score);

  // If it's Round 1 and scores are all 0, shuffle randomly
  if (roundNum === 1 && sorted.every((p) => p.score === 0)) {
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
  }

  // Build partnership history if match history is provided
  const partnershipCount: Record<string, Record<string, number>> = {};

  if (matchHistory && matchHistory.length > 0) {
    matchHistory.forEach((match) => {
      // Track Team 1 partnership
      const t1p1 = match.team1_p1_text;
      const t1p2 = match.team1_p2_text;
      if (t1p1 && t1p2) {
        if (!partnershipCount[t1p1]) partnershipCount[t1p1] = {};
        if (!partnershipCount[t1p2]) partnershipCount[t1p2] = {};
        partnershipCount[t1p1][t1p2] = (partnershipCount[t1p1][t1p2] || 0) + 1;
        partnershipCount[t1p2][t1p1] = (partnershipCount[t1p2][t1p1] || 0) + 1;
      }

      // Track Team 2 partnership
      const t2p1 = match.team2_p1_text;
      const t2p2 = match.team2_p2_text;
      if (t2p1 && t2p2) {
        if (!partnershipCount[t2p1]) partnershipCount[t2p1] = {};
        if (!partnershipCount[t2p2]) partnershipCount[t2p2] = {};
        partnershipCount[t2p1][t2p2] = (partnershipCount[t2p1][t2p2] || 0) + 1;
        partnershipCount[t2p2][t2p1] = (partnershipCount[t2p2][t2p1] || 0) + 1;
      }
    });
  }

  // Helper: Check if two players have partnered X times
  const getPartnershipCount = (p1: string, p2: string): number => {
    return partnershipCount[p1]?.[p2] || 0;
  };

  const matches: TournamentMatch[] = [];
  const courtCount = Math.floor(sorted.length / 4);

  for (let i = 0; i < courtCount; i++) {
    // Get 4 players for this court (same level group)
    const group = sorted.slice(i * 4, i * 4 + 4);

    // Standard Mexicano pairing: 1&4 vs 2&3
    let team1 = [group[0], group[3]];
    let team2 = [group[1], group[2]];

    // Smart swap: If either partnership has occurred 2+ times, try swapping within the group
    const t1Count = getPartnershipCount(
      team1[0].display_name,
      team1[1].display_name,
    );
    const t2Count = getPartnershipCount(
      team2[0].display_name,
      team2[1].display_name,
    );

    // If Team 1 has played together 2+ times, try alternative pairing
    if (t1Count >= 2 || t2Count >= 2) {
      // Alternative pairing: 1&3 vs 2&4
      const altTeam1 = [group[0], group[2]];
      const altTeam2 = [group[1], group[3]];
      const altT1Count = getPartnershipCount(
        altTeam1[0].display_name,
        altTeam1[1].display_name,
      );
      const altT2Count = getPartnershipCount(
        altTeam2[0].display_name,
        altTeam2[1].display_name,
      );

      // Use alternative if it has fewer repetitions
      if (altT1Count + altT2Count < t1Count + t2Count) {
        team1 = altTeam1;
        team2 = altTeam2;
      } else {
        // Try another alternative: 1&2 vs 3&4
        const alt2Team1 = [group[0], group[1]];
        const alt2Team2 = [group[2], group[3]];
        const alt2T1Count = getPartnershipCount(
          alt2Team1[0].display_name,
          alt2Team1[1].display_name,
        );
        const alt2T2Count = getPartnershipCount(
          alt2Team2[0].display_name,
          alt2Team2[1].display_name,
        );

        // Use this if it's better than both previous options
        if (
          alt2T1Count + alt2T2Count <
          Math.min(t1Count + t2Count, altT1Count + altT2Count)
        ) {
          team1 = alt2Team1;
          team2 = alt2Team2;
        }
      }
    }

    matches.push({
      tournament_id: tournamentId,
      round_number: roundNum,
      court_number: i + 1,

      // Team 1
      team1_p1_text: team1[0].display_name,
      team1_p1_id: team1[0].player_id,
      team1_p2_text: team1[1].display_name,
      team1_p2_id: team1[1].player_id,

      // Team 2
      team2_p1_text: team2[0].display_name,
      team2_p1_id: team2[0].player_id,
      team2_p2_text: team2[1].display_name,
      team2_p2_id: team2[1].player_id,

      score_team1: 0,
      score_team2: 0,
      completed: false,
    });
  }

  return matches;
};
