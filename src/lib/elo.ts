// Simple Elo Rating Implementation

export const K_FACTOR = 32;
export const DEFAULT_ELO = 1150; // Level 3 Start

export const LEVELS = [
  { level: 1, min: 0, max: 900, label: "Beginner" },
  { level: 2, min: 900, max: 1050, label: "Basic" },
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
  expectedScore: number
) => {
  return Math.round(currentRating + K_FACTOR * (actualScore - expectedScore));
};

export const calculateTeamAverage = (p1Elo: number, p2Elo: number) => {
  return Math.round((p1Elo + p2Elo) / 2);
};
