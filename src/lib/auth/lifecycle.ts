const cleanups = new Set<() => void>();

export function onSessionEnd(cleanup: () => void) {
  cleanups.add(cleanup);
  return () => {
    cleanups.delete(cleanup);
  };
}

export function clearSessionData() {
  for (const cleanup of cleanups) cleanup();
}
