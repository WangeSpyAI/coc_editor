import type { CharacterStats } from '../types/scenario';

/**
 * Calculate max HP from CON and SIZ (CoC 7e).
 */
export function calcMaxHp(stats: CharacterStats): number {
  return Math.floor((stats.con + stats.siz) / 10);
}

/**
 * Calculate max MP from POW (CoC 7e).
 */
export function calcMaxMp(stats: CharacterStats): number {
  return Math.floor(stats.pow / 5);
}

/**
 * Calculate starting SAN from POW (CoC 7e).
 */
export function calcStartingSan(stats: CharacterStats): number {
  return stats.pow;
}

/**
 * Calculate damage bonus and build from STR + SIZ (CoC 7e).
 */
export function calcDamageBonus(stats: CharacterStats): { db: string; build: number } {
  const total = stats.str + stats.siz;
  if (total <= 64) return { db: '-2', build: -2 };
  if (total <= 84) return { db: '-1', build: -1 };
  if (total <= 124) return { db: '0', build: 0 };
  if (total <= 164) return { db: '+1D4', build: 1 };
  if (total <= 204) return { db: '+1D6', build: 2 };
  // Every 80 points beyond 204 adds another die
  const extra = Math.floor((total - 205) / 80) + 3;
  return { db: `+${extra}D6`, build: extra };
}

/**
 * Calculate MOV from STR, DEX, SIZ, and age (CoC 7e).
 */
export function calcMov(stats: CharacterStats, age: number = 30): number {
  let mov: number;
  if (stats.dex < stats.siz && stats.str < stats.siz) {
    mov = 7;
  } else if (stats.dex > stats.siz && stats.str > stats.siz) {
    mov = 9;
  } else {
    mov = 8;
  }

  if (age >= 80) mov -= 5;
  else if (age >= 70) mov -= 4;
  else if (age >= 60) mov -= 3;
  else if (age >= 50) mov -= 2;
  else if (age >= 40) mov -= 1;

  return Math.max(1, mov);
}
