/**
 * Retention windows for age-based media reclamation (feature 011).
 *
 * Deliberately constants, not environment variables. These windows are a
 * product decision with one right answer across every environment; nothing
 * tunes them per deployment or at runtime, so a configuration surface would buy
 * nothing and cost a resolver that has to be right about four failure modes.
 *
 * Constitution §III (v5.1.0) requires each declared file class to have its
 * window "declared in exactly one place" and permits a source constant, which
 * also satisfies the fail-closed limit STRUCTURALLY: there is no value to be
 * absent or unparseable, a non-number is a type error, and a zero or negative
 * one is visible in the diff.
 *
 * If a future feature needs per-environment windows, a strict throwing resolver
 * MUST come back with them. The `Number(env) || DEFAULT` convention used by the
 * grace windows in `media-reclaim.ts` is PROHIBITED here: `Number("-1") || 7`
 * evaluates to `-1`, which places the age cutoff in the FUTURE and makes every
 * file — including media created that day — eligible for irreversible removal.
 */

/** Age past which a still image's `1600.webp` is reclaimed (FR-001). */
export const IMAGE_RETENTION_DAYS = 7;

/** Age past which an uploaded `original.mp4` is reclaimed (FR-009). */
export const VIDEO_RETENTION_DAYS = 30;

export const DAY_MS = 24 * 60 * 60 * 1000;
