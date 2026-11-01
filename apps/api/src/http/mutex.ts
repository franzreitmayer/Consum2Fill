export type Mutex = <T>(task: () => Promise<T>) => Promise<T>;

// Runs tasks one after the other, so that a check and the write depending on it stay together.
export function createMutex(): Mutex {
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = tail.then(task);
    tail = run.catch(() => undefined);
    return run;
  };
}
