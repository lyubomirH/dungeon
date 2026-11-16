/* =========================================================
   DUNGEON.JS — отворена карта 15×15 + чисти рекурсивни helpers
   ========================================================= */

export const SIZE = 15;
export const START = [0, 0];
export const END = [SIZE - 1, SIZE - 1];

/* ============ TRAMPOLINE РЕКУРСИВНИ HELPERS ============ */
const trampoline = (fn) => {
  let result = fn();
  while (typeof result === 'function') {
    result = result();
  }
  return result;
};

export const someRec = (arr, pred) => {
  const loop = (i) => {
    if (i >= arr.length) return false;
    if (pred(arr[i], i)) return true;
    return () => loop(i + 1);
  };
  return trampoline(() => loop(0));
};

export const eachRec = (arr, fn) => {
  const loop = (i) => {
    if (i >= arr.length) return undefined;
    fn(arr[i], i);
    return () => loop(i + 1);
  };
  return trampoline(() => loop(0));
};

export const mapRec = (arr, fn) => {
  const result = [];
  eachRec(arr, (item, i) => result.push(fn(item, i)));
  return result;
};

export const filterRec = (arr, pred) => {
  const result = [];
  eachRec(arr, (item, i) => { if (pred(item, i)) result.push(item); });
  return result;
};

export const joinRec = (arr, sep) => {
  let result = '';
  eachRec(arr, (item, i) => { result += (i === 0 ? '' : sep) + item; });
  return result;
};

export const rangeRec = (n, fn) => {
  const result = [];
  eachRec(Array.from({ length: n }, (_, i) => i), (i) => result.push(fn(i)));
  return result;
};

const shuffleRec = (arr) => {
  if (arr.length <= 1) return arr;
  const i = Math.floor(Math.random() * arr.length);
  const rest = filterRec(arr, (_, idx) => idx !== i);
  return [arr[i], ...shuffleRec(rest)];
};

/* =========================================================
   ГЕНЕРАТОР НА ОТВОРЕНА КАРТА (ПОПРАВЕН)
   ========================================================= */
export const generateMap = () => {
  const grid = rangeRec(SIZE, () => rangeRec(SIZE, () => '#'));

  // Маркер за посетени стаи, за да не се въртим в кръг
  const visitedRooms = rangeRec(SIZE, () => rangeRec(SIZE, () => false));

  const carveRoom = (r, c, h = 2, w = 2) => {
    const markCell = (dr, dc) => {
      if (dr >= h) return;
      if (dc >= w) return markCell(dr + 1, 0);
      const nr = r + dr, nc = c + dc;
      if (nr < SIZE && nc < SIZE) grid[nr][nc] = '.';
      markCell(dr, dc + 1);
    };
    markCell(0, 0);
  };

  const carve = (r, c) => {
    if (visitedRooms[r][c]) return; // Спираме, ако вече сме били тук
    visitedRooms[r][c] = true;
    
    carveRoom(r, c, 2, 2);
    const dirs = shuffleRec([[-2, 0], [2, 0], [0, -2], [0, 2]]);

    const tryDir = (i) => {
      if (i >= dirs.length) return;
      const [dr, dc] = dirs[i];
      const nr = r + dr, nc = c + dc;
      
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) return tryDir(i + 1);
      if (visitedRooms[nr][nc]) return tryDir(i + 1); // Ако сме били там, пропускаме

      const mr = r + dr / 2, mc = c + dc / 2;
      if (grid[mr][mc] === '#') {
        grid[mr][mc] = '.';
      }
      
      carve(nr, nc); // Рекурсия
      tryDir(i + 1);
    };
    tryDir(0);
  };

  const seeds = [[0, 0], [0, SIZE - 2], [SIZE - 2, 0], [SIZE - 2, SIZE - 2]];
  eachRec(seeds, ([r, c]) => {
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && !visitedRooms[r][c]) {
      carve(r, c);
    }
  });

  const extraOpen = (r, c) => {
    if (r >= SIZE - 1) return;
    if (c >= SIZE - 1) return extraOpen(r + 1, 0);
    if (r === 0 || c === 0) return extraOpen(r, c + 1);
    if (grid[r][c] !== '#') return extraOpen(r, c + 1);

    const up = r > 0 && grid[r - 1][c] === '.';
    const down = r < SIZE - 1 && grid[r + 1][c] === '.';
    const left = c > 0 && grid[r][c - 1] === '.';
    const right = c < SIZE - 1 && grid[r][c + 1] === '.';

    if (((up && down) || (left && right)) && Math.random() < 0.60) {
      grid[r][c] = '.';
    }
    extraOpen(r, c + 1);
  };
  extraOpen(1, 1);

  grid[START[0]][START[1]] = '.';
  grid[END[0]][END[1]] = '.';

  const [er, ec] = END;
  const eNeighbors = [[er - 1, ec], [er, ec - 1]];
  if (!someRec(eNeighbors, ([r, c]) => grid[r][c] === '.')) grid[er - 1][ec] = '.';

  grid[START[0]][START[1]] = 'S';
  grid[END[0]][END[1]] = 'E';

  const freeCells = [];
  eachRec(rangeRec(SIZE, i => i), (r) => {
    eachRec(rangeRec(SIZE, i => i), (c) => {
      if (grid[r][c] === '.' && !(r === START[0] && c === START[1]) && !(r === END[0] && c === END[1])) {
        freeCells.push([r, c]);
      }
    });
  });

  const shuffled = shuffleRec([...freeCells]);

  if (shuffled.length > 0) grid[shuffled[0][0]][shuffled[0][1]] = 'K';
  if (shuffled.length > 1) grid[shuffled[1][0]][shuffled[1][1]] = 'D';

  const mineCount = Math.max(4, Math.floor(freeCells.length * 0.05));
  const mines = [];
  const placeMines = (i) => {
    if (i >= mineCount || i + 2 >= shuffled.length) return;
    const [r, c] = shuffled[i + 2];
    if (grid[r][c] === '.') mines.push([r, c]);
    placeMines(i + 1);
  };
  placeMines(0);

  return { grid, mines };
};

/* ============ HELPERS ЗА ПРАВИЛАТА ============ */
export const isInside = (grid, r, c) =>
  r >= 0 && r < grid.length && c >= 0 && c < grid[0].length;

export const visibleFrom = (grid, r, c) => {
  const out = [`${r},${c}`];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  const walk = (dr, dc, cr, cc) => {
    const nr = cr + dr, nc = cc + dc;
    if (!isInside(grid, nr, nc)) return;
    if (grid[nr][nc] === '#') return;
    out.push(`${nr},${nc}`);
    walk(dr, dc, nr, nc);
  };

  eachRec(dirs, ([dr, dc]) => walk(dr, dc, r, c));
  return out;
};

export const countAdjacentMines = (r, c, mines) => {
  const around = [];
  const build = (dr, dc) => {
    if (dr > 1) return;
    if (dc > 1) return build(dr + 1, -1);
    if (!(dr === 0 && dc === 0)) around.push([r + dr, c + dc]);
    build(dr, dc + 1);
  };
  build(-1, -1);
  return filterRec(around, ([mr, mc]) => someRec(mines, ([x, y]) => x === mr && y === mc)).length;
};

export const hasFlagAt = (flags, r, c) =>
  someRec(flags, ([fr, fc]) => fr === r && fc === c);

export const isActiveMine = (r, c, mines, flags) =>
  someRec(mines, ([mr, mc]) => mr === r && mc === c) && !hasFlagAt(flags, r, c);

export const isRevealed = (revealed, r, c) =>
  someRec(revealed, k => k === `${r},${c}`);

export const canEnter = (state, r, c) => {
  const { grid, inventory, revealed, flags, mines } = state;
  if (!isInside(grid, r, c)) return false;
  if (grid[r][c] === '#') return false;
  if (!isRevealed(revealed, r, c)) return false;
  if (isActiveMine(r, c, mines, flags)) return false;
  if (grid[r][c] === 'D' && !inventory.gold) return false;
  return true;
};

/* ============ СЪСТОЯНИЕ ============ */
export const cloneState = (s) => ({
  ...s,
  visited: new Set(s.visited),
  revealed: [...s.revealed],
  inventory: { ...s.inventory },
  flags: mapRec(s.flags, f => [...f]),
  doorsPassed: mapRec(s.doorsPassed, d => [...d]),
  collected: mapRec(s.collected, c => ({ ...c })),
  path: mapRec(s.path, p => [...p])
});

export const createInitialState = (grid, mines) => ({
  grid,
  mines,
  pos: [...START],
  visited: new Set([`${START[0]},${START[1]}`]),
  revealed: visibleFrom(grid, ...START),
  inventory: {},
  flags: [],
  doorsPassed: [],
  collected: [],
  path: [[...START]],
  steps: 0,
  dead: false
});

export const applyCellEffects = (state, r, c) => {
  const s = cloneState(state);
  const ch = s.grid[r][c];

  if (ch === 'K') {
    s.inventory.gold = (s.inventory.gold || 0) + 1;
    s.collected.push({ pos: [r, c], type: 'gold' });
  }
  if (ch === 'D') s.doorsPassed.push([r, c]);

  const vis = visibleFrom(s.grid, r, c);
  eachRec(vis, (k) => {
    if (!someRec(s.revealed, x => x === k)) s.revealed.push(k);
  });
  return s;
};

export const tryPlaceFlag = (state, r, c) => {
  if (state.flags.length >= state.mines.length) return null;
  if (hasFlagAt(state.flags, r, c)) return null;
  if (!isRevealed(state.revealed, r, c)) return null;
  const s = cloneState(state);
  s.flags.push([r, c]);
  return s;
};

export const stateKey = (s) =>
  `${s.pos[0]},${s.pos[1]}|${JSON.stringify(s.inventory)}|` +
  `F:${joinRec(mapRec(s.flags, f => joinRec(f, ',')), ';')}`;