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

import { getTemplateForSize } from "./americano-templates";

/**
 * Seeded shuffle using the tournamentId as seed.
 */
const seededShuffle = <T>(array: T[], seed: number): T[] => {
  const arr = [...array];
  let s = seed | 0;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    const j = Math.abs(s) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// --- AMERICANO LOGIC (BALANCED OPPONENTS) ---

export const generateAmericanoRound = (
  roundNum: number,
  participants: TournamentParticipant[],
  tournamentId: number,
): TournamentMatch[] => {
  /* ---------------------------------------------------
     Check Static Templates (Strict)
  --------------------------------------------------- */
  const template = getTemplateForSize(participants.length);
  if (!template) {
    throw new Error(
      `The Americano tournament size ${participants.length} is not available. Supported sizes: 8, 12, 16, 20.`,
    );
  }

  // Re-shuffle deterministically using tournamentId
  const sorted = [...participants].sort((a, b) =>
    String(a.player_id || a.display_name).localeCompare(
      String(b.player_id || b.display_name),
    ),
  );
  const templateParticipants = seededShuffle(sorted, tournamentId);

  const templateIdx = (roundNum - 1) % template.length;
  const roundTemplate = template[templateIdx];
  const matches: TournamentMatch[] = roundTemplate.map(
    (courtMatches, courtIdx) => {
      const t1p1 = templateParticipants[courtMatches[0][0]];
      const t1p2 = templateParticipants[courtMatches[0][1]];
      const t2p1 = templateParticipants[courtMatches[1][0]];
      const t2p2 = templateParticipants[courtMatches[1][1]];

      // Balanceamos las pistas de forma nativa deslizando la asignación
      // en función de la ronda actual. Esto evita que los jugadores
      // echen raíces en la misma pista en las plantillas cíclicas.
      const totalCourts = roundTemplate.length;
      const assignedCourt =
        participants.length === 8
          ? courtIdx + 1 // Regla de 8 jugadores: usar asignación estática para max 5-2
          : ((courtIdx + (roundNum - 1)) % totalCourts) + 1;

      return {
        tournament_id: tournamentId,
        round_number: roundNum,
        court_number: assignedCourt, // Let templates dictate court assignments natively
        team1_p1_text: t1p1.display_name,
        team1_p1_id: t1p1.player_id,
        team1_p2_text: t1p2.display_name,
        team1_p2_id: t1p2.player_id,
        team2_p1_text: t2p1.display_name,
        team2_p1_id: t2p1.player_id,
        team2_p2_text: t2p2.display_name,
        team2_p2_id: t2p2.player_id,
        score_team1: 0,
        score_team2: 0,
        completed: false,
      };
    },
  );

  return matches;
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
