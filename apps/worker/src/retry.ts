/** attemptsMade counts finished attempts, so during processing the current attempt is attemptsMade + 1. */
export function hasRetriesLeft(attemptsMade: number, maxAttempts: number | undefined): boolean {
  return attemptsMade + 1 < (maxAttempts ?? 1);
}
