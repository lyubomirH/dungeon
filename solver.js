/* =========================================================
   SOLVER.JS — рекурсия, backtracking, memoization
   ========================================================= */

import {
  createInitialState, canEnter, applyCellEffects, cloneState,
  stateKey, tryPlaceFlag, isActiveMine,
  eachRec, mapRec, someRec, filterRec
} from './dungeon.js';

const makeStats = () => ({ calls: 0, positions: 0, routes: 0, avoided: 0, ms: 0 });

export const findAllRoutes = (grid, mines) => {
  const stats = makeStats();
  const t0 = performance.now();
  const routes = [];
  const seenStates = [];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const start = createInitialState(grid, mines);
  
  const MAX_DEPTH = 400; // Защита срещу прекалено дълбоки пътища

  const findAdjacentActiveMine = (state) => {
    const [r, c] = state.pos;
    const cells = [];
    const build = (dr, dc) => {
      if (dr > 1) return;
      if (dc > 1) return build(dr + 1, -1);
      if (!(dr === 0 && dc === 0)) cells.push([r + dr, c + dc]);
      build(dr, dc + 1);
    };
    build(-1, -1);
    const found = filterRec(cells, ([nr, nc]) => isActiveMine(nr, nc, mines, state.flags));
    return found.length ? found[0] : null;
  };

  const dfs = (state) => {
    stats.calls++;
    if (state.dead) return;
    if (state.steps > MAX_DEPTH) return; // Спираме, ако пътят е прекалено дълъг

    const [pr, pc] = state.pos;
    if (state.grid[pr][pc] === 'E') {
      stats.routes++;
      routes.push({
        path: mapRec(state.path, p => [...p]),
        steps: state.steps,
        collected: mapRec(state.collected, c => ({ ...c })),
        doors: mapRec(state.doorsPassed, d => [...d]),
        flags: mapRec(state.flags, f => [...f]),
        inventory: { ...state.inventory }
      });
      return;
    }

    const key = stateKey(state);
    if (someRec(seenStates, k => k === key)) { stats.avoided++; return; }
    seenStates.push(key);
    stats.positions++;

    const adj = findAdjacentActiveMine(state);
    if (adj && state.flags.length < mines.length) {
      const flagged = tryPlaceFlag(state, ...adj);
      if (flagged) dfs(flagged);
    }

    eachRec(dirs, ([dr, dc]) => {
      const [r, c] = state.pos;
      const nr = r + dr, nc = c + dc;
      if (!canEnter(state, nr, nc)) return;
      const vk = `${nr},${nc}`;
      if (state.visited.has(vk)) return;

      let next = cloneState(state);
      next.pos = [nr, nc];
      next.steps = state.steps + 1;
      next.visited.add(vk);
      next.path.push([nr, nc]);
      next = applyCellEffects(next, nr, nc);
      if (isActiveMine(nr, nc, mines, next.flags)) next.dead = true;
      dfs(next);
    });
  };

  dfs(start);
  stats.ms = performance.now() - t0;
  return { routes, stats };
};

const insertSorted = (arr, item, cmp) => {
  if (arr.length === 0) return [item];
  const [head, ...tail] = arr;
  return cmp(item, head) <= 0 ? [item, head, ...tail] : [head, ...insertSorted(tail, item, cmp)];
};

const sortRec = (arr, cmp) => {
  if (arr.length <= 1) return arr;
  const [head, ...tail] = arr;
  return insertSorted(sortRec(tail, cmp), head, cmp);
};

export const pickOptimal = (routes) => {
  if (routes.length === 0) return null;
  const score = (r) => r.steps * 10 - r.collected.length * 5 + r.flags.length * 3;
  return sortRec(routes, (a, b) => score(a) - score(b))[0];
};