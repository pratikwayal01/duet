// Drift policy (PRD §5.2): ignore < ~0.3s, rate-nudge 0.95x/1.05x for 0.3–2s,
// hard-seek above ~2s. One config object; rate nudging is off by default on
// services that dislike rate changes (PRD §5.7) — there we fall back to small seeks.

export const DRIFT_IGNORE_S = 0.3;
export const DRIFT_SEEK_S = 2.0;
export const RATE_NUDGE_UP = 1.05; // local behind: run fast to catch up
export const RATE_NUDGE_DOWN = 0.95; // local ahead: run slow to fall back

export const RATE_NUDGE_OFF_BY_DEFAULT = ["netflix", "prime", "jiohotstar"] as const;

export function isRateNudgeDisabledByDefault(serviceId: string): boolean {
  return (RATE_NUDGE_OFF_BY_DEFAULT as readonly string[]).includes(serviceId.toLowerCase());
}

export interface DriftConfig {
  rateNudgeDisabled: boolean;
}

export function defaultDriftConfig(serviceId?: string): DriftConfig {
  return { rateNudgeDisabled: serviceId ? isRateNudgeDisabledByDefault(serviceId) : false };
}

export type Correction = { kind: "ignore" } | { kind: "rate"; rate: number } | { kind: "seek" };

// driftSeconds = localPosition - expectedPosition (negative = local behind).
export function decideCorrection(driftSeconds: number, config: DriftConfig = { rateNudgeDisabled: false }): Correction {
  if (!Number.isFinite(driftSeconds)) return { kind: "ignore" };
  const d = Math.abs(driftSeconds);
  if (d < DRIFT_IGNORE_S) return { kind: "ignore" };
  if (d <= DRIFT_SEEK_S) {
    if (config.rateNudgeDisabled) return { kind: "seek" };
    return { kind: "rate", rate: driftSeconds < 0 ? RATE_NUDGE_UP : RATE_NUDGE_DOWN };
  }
  return { kind: "seek" };
}
