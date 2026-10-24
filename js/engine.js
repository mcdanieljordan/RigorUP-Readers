// Rules for Lit Bucks (LB). Ported from Rainbow Quest v1 so rewards feel the same.
// mode: 'standard' | 'extra' (twice as long) | 'off' (relaxed, flat reward)
export function reward(seconds, mode = 'standard') {
  if (mode === 'off') return 15;
  const t = Math.max(0, seconds) / (mode === 'extra' ? 2 : 1);
  if (t <= 5) return Math.ceil(20 - t * 0.8);
  if (t <= 15) return Math.ceil(16 - (t - 5) * 0.3);
  if (t <= 30) return Math.ceil(13 - ((t - 15) * 2) / 15);
  if (t <= 50) return Math.ceil(11 - (t - 30) / 20);
  return 10;
}
export const SECOND_TRY_LB = 3;

// Percent of finished questions answered correctly on the first try.
export function firstTryPercent(attempts) {
  const done = Object.values(attempts).filter(a => a.done);
  return done.length ? Math.round((100 * done.filter(a => a.firstCorrect).length) / done.length) : 0;
}

export const LEVELS = ['Spark Scout', 'Clue Finder', 'Rainbow Reader', 'Trail Explorer', 'Spark Keeper',
  'Mystery Master', 'Rainbow Champion', 'Legend Finder', 'Cosmic Reader'];
export const levelFor = lifetime => {
  const n = Math.floor(lifetime / 100);
  return { number: n + 1, name: LEVELS[Math.min(n, LEVELS.length - 1)], progress: lifetime % 100 };
};

export const BADGES = [
  ['first', 'First Spark', 'Get your first answer right', '✨'],
  ['retry', 'Brave Try', 'Use a hint and succeed', '💪'],
  ['reader', 'Rainbow Reader', 'Reach the end of a book', '📖'],
  ['math', 'Number Ninja', 'Finish every math question in a book', '🔢'],
  ['finish', 'Mystery Master', 'Complete a whole adventure', '🌈'],
  ['capture', 'Creature Keeper', 'Capture your first creature', '💎'],
  ['shelf', 'Book Explorer', 'Complete two different books', '📚']
];
