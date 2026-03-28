import type { DiceRoll, SkillCheckResult } from '../types/engine';

/**
 * Parse a dice expression like "1D100", "2D6+1", "1D3"
 */
export function parseDiceExpression(expr: string): { count: number; sides: number; modifier: number } {
  const match = expr.toUpperCase().match(/^(\d+)D(\d+)([+-]\d+)?$/);
  if (!match) throw new Error(`Invalid dice expression: ${expr}`);
  return {
    count: parseInt(match[1]),
    sides: parseInt(match[2]),
    modifier: match[3] ? parseInt(match[3]) : 0,
  };
}

/**
 * Roll a single die with the given number of sides
 */
function rollSingle(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Roll dice from an expression string
 */
export function rollDice(expr: string): DiceRoll {
  const { count, sides, modifier } = parseDiceExpression(expr);
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    results.push(rollSingle(sides));
  }
  const total = results.reduce((sum, r) => sum + r, 0) + modifier;
  return { expression: expr, results, modifier, total };
}

/**
 * Roll 1D100
 */
export function rollPercentile(): number {
  return rollSingle(100);
}

/**
 * Evaluate a skill check result per CoC 7e rules
 */
export function evaluateSkillCheck(rolled: number, target: number): SkillCheckResult {
  if (rolled === 1) return 'criticalSuccess';
  if (rolled >= 100) return 'fumble';
  if (target < 50 && rolled >= 96) return 'fumble';
  if (rolled <= Math.floor(target / 5)) return 'extremeSuccess';
  if (rolled <= Math.floor(target / 2)) return 'hardSuccess';
  if (rolled <= target) return 'regularSuccess';
  return 'failure';
}

/**
 * Roll bonus/penalty dice (CoC 7e)
 * count > 0 = bonus dice, count < 0 = penalty dice
 */
export function rollBonusPenaltyDice(baseRoll: number, count: number): { tensOptions: number[]; result: number } {
  if (count === 0) return { tensOptions: [], result: baseRoll };

  const unitDigit = baseRoll % 10;
  const baseTens = Math.floor(baseRoll / 10) * 10;
  const tensOptions = [baseTens];

  const absCount = Math.abs(count);
  for (let i = 0; i < absCount; i++) {
    tensOptions.push(rollSingle(10) * 10 - 10); // 0-90 in steps of 10
  }

  // Bonus: pick lowest tens digit; Penalty: pick highest
  const isBonus = count > 0;
  const selectedTens = isBonus
    ? Math.min(...tensOptions)
    : Math.max(...tensOptions);

  let result = selectedTens + unitDigit;
  // Special case: 00 + 0 = 100
  if (result === 0) result = 100;

  return { tensOptions, result };
}

/**
 * Evaluate a SAN check
 */
export function evaluateSanCheck(
  rolled: number,
  currentSan: number,
  successLossExpr: string,
  failureLossExpr: string
): { passed: boolean; sanLost: number } {
  const passed = rolled <= currentSan;
  const lossExpr = passed ? successLossExpr : failureLossExpr;

  let sanLost: number;
  if (/^\d+$/.test(lossExpr)) {
    sanLost = parseInt(lossExpr);
  } else {
    sanLost = rollDice(lossExpr).total;
  }

  return { passed, sanLost };
}
