export interface Scheduler {
  every(intervalMs: number, task: () => Promise<void>): void;
}

export function createIntervalScheduler() {
  const timers = new Set<NodeJS.Timeout>();
  const running = new Set<Promise<void>>();
  let stopped = false;

  const every = (intervalMs: number, task: () => Promise<void>): void => {
    const schedule = (): void => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        const run = task().finally(() => {
          running.delete(run);
          if (!stopped) {
            schedule();
          }
        });
        running.add(run);
      }, intervalMs);
      timers.add(timer);
    };
    schedule();
  };

  const stopAll = async (): Promise<void> => {
    stopped = true;
    timers.forEach((timer) => {
      clearTimeout(timer);
    });
    timers.clear();
    await Promise.allSettled(running);
  };

  return { every, stopAll };
}
