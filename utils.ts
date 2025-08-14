// utils.ts
import { MIN_ITERATIONS, MAX_ITERATIONS } from './constants';

/**
 * Clamps a number between min and max values (inclusive)
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Clamps PBKDF2 iterations to a safe range
 */
export function clampIterations(iterations: number): number {
    return clamp(iterations, MIN_ITERATIONS, MAX_ITERATIONS);
}

/**
 * Clamps the maximum decryptable size in MB
 */
export function clampMaxSize(sizeMB: number): number {
    const MIN_SIZE_MB = 1;
    const MAX_SIZE_MB = 100; // 100MB max
    return clamp(sizeMB, MIN_SIZE_MB, MAX_SIZE_MB);
}
