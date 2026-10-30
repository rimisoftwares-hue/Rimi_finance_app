// src/utils/navigationHistory.ts
// Handles Alt+Left (back) and Alt+Right (forward) keyboard navigation
// Works with React Router's HashRouter by tracking hash-based URL changes.

const HISTORY_KEY = 'navHistory';
const FORWARD_KEY = 'navForward';

/** Paths that should be skipped when navigating back/forward */
const isSkippedPath = (path: string) =>
  path.includes('/AddCustomersForm') ||
  path.includes('/customers/edit/') ||
  path.includes('/ConsultingForm') ||
  path.includes('/VehicleLoanForm');

const getHistory = (): string[] =>
  JSON.parse(sessionStorage.getItem(HISTORY_KEY) || '[]');

const getForward = (): string[] =>
  JSON.parse(sessionStorage.getItem(FORWARD_KEY) || '[]');

const setHistory = (h: string[]) =>
  sessionStorage.setItem(HISTORY_KEY, JSON.stringify(h));

const setForward = (f: string[]) =>
  sessionStorage.setItem(FORWARD_KEY, JSON.stringify(f));

/** Returns the current hash path (e.g. '/customers') */
const currentPath = () => window.location.hash.replace(/^#/, '') || '/';

/** Call this whenever the route has changed to record it */
export const recordNavigation = () => {
  const path = currentPath();
  if (isSkippedPath(path)) return;

  const history = getHistory();
  if (history[history.length - 1] === path) return; // deduplicate

  // A new navigation clears the forward stack
  setHistory([...history, path]);
  setForward([]);
};

export const initializeNavigation = () => {
  // Seed the initial path
  const initial = currentPath();
  if (!isSkippedPath(initial) && getHistory().length === 0) {
    setHistory([initial]);
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!e.altKey) return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const history = getHistory();
      const forward = getForward();

      // Need at least 2 entries to go back
      if (history.length < 2) return;

      // Find the previous non-skipped path
      let idx = history.length - 2;
      while (idx >= 0 && isSkippedPath(history[idx])) idx--;
      if (idx < 0) return;

      const target = history[idx];
      setForward([...forward, currentPath()]);
      setHistory(history.slice(0, idx + 1));
      window.location.hash = target;

    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const forward = getForward();
      const history = getHistory();

      if (forward.length === 0) return;

      // Find the next non-skipped path
      let idx = forward.length - 1;
      while (idx >= 0 && isSkippedPath(forward[idx])) idx--;
      if (idx < 0) return;

      const target = forward[idx];
      setHistory([...history, currentPath()]);
      setForward(forward.slice(0, idx));
      window.location.hash = target;
    }
  };

  // Track both hashchange (direct hash changes) and popstate (history API)
  const handleRouteChange = () => recordNavigation();

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('hashchange', handleRouteChange);
  window.addEventListener('popstate', handleRouteChange);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('hashchange', handleRouteChange);
    window.removeEventListener('popstate', handleRouteChange);
  };
};