/** Per-isolate backpressure, not a distributed or billing quota. */
export const createRequestBudget = (
  limit: number,
  concurrency: number,
  now: () => number = Date.now,
) => {
  let windowStart = now();
  let attempts = 0;
  let active = 0;
  return {
    acquire(): { release: () => void } | { retryAfter: number } {
      const time = now();
      if (time - windowStart >= 60000) {
        windowStart = time;
        attempts = 0;
      }
      if (active >= concurrency) {
        return { retryAfter: 1 };
      }
      if (attempts >= limit) {
        return {
          retryAfter: Math.max(
            1,
            Math.ceil((60000 - (time - windowStart)) / 1000),
          ),
        };
      }
      attempts++;
      active++;
      let released = false;
      return {
        release() {
          if (!released) {
            released = true;
            active--;
          }
        },
      };
    },
  };
};
