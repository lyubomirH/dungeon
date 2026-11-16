/* =========================================================
   APP.JS — UI, само рекурсия + WASD / Q контроли
   ========================================================= */

import {
  generateMap, SIZE, countAdjacentMines, isActiveMine, hasFlagAt,
  isRevealed, eachRec, mapRec, someRec, joinRec,
  createInitialState, canEnter, applyCellEffects, cloneState, tryPlaceFlag
} from './dungeon.js';
import { findAllRoutes, pickOptimal } from './solver.js';

const boardEl = document.getElementById('board');
const routesEl = document.getElementById('routes-list');
const statsEl = document.getElementById('stats');
const invEl = document.getElementById('inventory');

let LEVEL = null;
let MINES = null;
let lastResult = null;
let showAll = false;
let optimal = null;

let playerState = null; 
let facingDir = [-1, 0];

const ICONS = { S: '🧍', E: '🚪', '#': '', '.': '', K: '🔑', D: '🔒' };

/* --- Рендер на дъската --- */
const renderBoard = (revealed = [], path = [], optPath = []) => {
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = `repeat(${SIZE}, var(--cell))`;

  const inPath = (arr, r, c) => someRec(arr, ([pr, pc]) => pr === r && pc === c);
  const flags = lastResult?.flags ?? [];

  const isGameOver = playerState && (playerState.dead || (playerState.pos[0] === SIZE-1 && playerState.pos[1] === SIZE-1));

  const renderCell = (r, c) => {
    const ch = LEVEL[r][c];
    const cell = document.createElement('div');
    const rev = isRevealed(revealed, r, c);

    let cls = 'cell ';
    if (!rev) cls += 'fog';
    else if (ch === '#') cls += 'wall';
    else if (ch === 'S') cls += 'start';
    else if (ch === 'E') cls += 'exit';
    else if (ch === 'K') cls += 'key';
    else if (ch === 'D') cls += 'door';
    else cls += 'floor';

    if (inPath(path, r, c)) cls += ' on-path';
    if (inPath(optPath, r, c)) cls += ' optimal';

    const isPlayerHere = playerState && playerState.pos[0] === r && playerState.pos[1] === c;
    
    const currentFlags = playerState ? playerState.flags : flags;
    const flagged = hasFlagAt(currentFlags, r, c);
    const mineHere = isActiveMine(r, c, MINES, currentFlags);

    const revealMines = !playerState || isGameOver;
    const showMine = revealMines && mineHere;

    if (rev && flagged) cls = 'cell flag';
    else if (rev && showMine) cls = 'cell mine';

    cell.className = cls;

    if (rev) {
      if (isPlayerHere) cell.textContent = '🧍';
      else if (flagged) cell.textContent = '🚩';
      else if (showMine) cell.textContent = '💣';
      else if (ch === 'S' && !playerState) cell.textContent = '🧍';
      else if (ch === 'S' && playerState) cell.textContent = '';
      else cell.textContent = ICONS[ch] ?? '';

      if (ch !== '#' && !flagged && !isPlayerHere && !mineHere) {
        const dist = countAdjacentMines(r, c, MINES);
        if (dist > 0) {
          const d = document.createElement('span');
          d.className = 'dist';
          d.textContent = dist;
          cell.appendChild(d);
        }
      }
    } else cell.textContent = '░';

    boardEl.appendChild(cell);
    if (c + 1 < SIZE) renderCell(r, c + 1);
  };

  const renderRow = (r) => {
    if (r >= SIZE) return;
    renderCell(r, 0);
    renderRow(r + 1);
  };
  renderRow(0);
};

/* --- Инвентар --- */
const renderInventory = (inventory = {}) => {
  const entries = Object.entries(inventory);
  invEl.innerHTML = entries.length
    ? joinRec(mapRec(entries, ([k, v]) => `<span class="item">🔑 ${k}: ${v}</span>`), '')
    : '<span style="color:#555">празен</span>';
};

/* --- Статистика --- */
const renderStats = (stats) => {
  if (!stats) { statsEl.innerHTML = '<div>Няма данни</div>'; return; }
  statsEl.innerHTML = `
    <div><span>Рекурсивни извиквания</span><span>${stats.calls}</span></div>
    <div><span>Изследвани позиции</span><span>${stats.positions}</span></div>
    <div><span>Валидни маршрути</span><span>${stats.routes}</span></div>
    <div><span>Избегнати повторения</span><span>${stats.avoided}</span></div>
    <div><span>Време</span><span>${stats.ms.toFixed(2)} ms</span></div>
  `;
};

/* --- Маршрути --- */
const routeCard = (r, i, isOpt) => `
  <div class="route-card ${isOpt ? 'optimal' : ''}">
    <strong>${isOpt ? '⭐ ОПТИМАЛЕН' : 'Маршрут ' + (i + 1)}</strong><br>
    Стъпки: ${r.steps}<br>
    Предмети: ${r.collected.length}<br>
    Врати: ${r.doors.length}<br>
    Флагове: ${r.flags?.length ?? 0}<br>
    <small>${joinRec(mapRec(r.path, p => `(${p[0]},${p[1]})`), ' → ')}</small>
  </div>`;

const renderRoutes = (routes, optimalRoute) => {
  if (routes.length === 0) {
    routesEl.innerHTML = '<p style="color:#8b98a9">Няма намерени маршрути.</p>';
    return;
  }
  const shown = showAll ? routes : [optimalRoute ?? routes[0]];
  routesEl.innerHTML = joinRec(mapRec(shown, (r, i) => routeCard(r, i, r === optimalRoute)), '');
};

const render = (revealed, path, optPath) => {
  renderBoard(revealed, path, optPath);
  renderInventory(playerState ? playerState.inventory : lastResult?.inventory);
  renderStats(lastResult?.stats);
};

const collectRevealed = (routes, opt) => {
  const set = [];
  const addPath = (p) => eachRec(p, ([r, c]) => {
    if (!someRec(set, k => k === `${r},${c}`)) set.push(`${r},${c}`);
  });
  eachRec(routes, r => addPath(r.path));
  if (opt) addPath(opt.path);
  return set;
};

/* =========================================================
   ЛОГИКА ЗА ИГРА
   ========================================================= */
const handleMovement = (dr, dc) => {
  if (!playerState || playerState.dead) return;
  facingDir = [dr, dc];
  
  const [r, c] = playerState.pos;
  const nr = r + dr, nc = c + dc;

  if (canEnter(playerState, nr, nc)) {
    const next = cloneState(playerState);
    next.pos = [nr, nc];
    next.steps++;
    next.path.push([nr, nc]);
    next.visited.add(`${nr},${nc}`);
    
    let updated = applyCellEffects(next, nr, nc);
    
    if (isActiveMine(nr, nc, MINES, updated.flags)) {
      updated.dead = true;
      renderBoard(updated.revealed, [], []);
      setTimeout(() => alert("💥 Бум! Стъпи на мина. Опитай отново."), 50);
    } else if (updated.grid[nr][nc] === 'E') {
      renderBoard(updated.revealed, [], []);
      setTimeout(() => alert("🎉 Победа! Намери изхода!"), 50);
    } else {
      renderBoard(updated.revealed, [], []);
    }
    
    playerState = updated;
  }
};

const handleFlag = () => {
  if (!playerState || playerState.dead) return;
  
  const [r, c] = playerState.pos;
  const nr = r + facingDir[0];
  const nc = c + facingDir[1];

  if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
    if (isRevealed(playerState.revealed, nr, nc)) {
      const flagged = tryPlaceFlag(playerState, nr, nc);
      if (flagged) {
        playerState = flagged;
        renderBoard(playerState.revealed, [], []);
      } else {
        alert("Не можеш да поставиш флаг тук (или нямаш повече флагове).");
      }
    } else {
      alert("Не можеш да поставиш флаг на неразкрита клетка.");
    }
  }
};

window.addEventListener('keydown', (e) => {
  if (!playerState) return;
  
  switch(e.key.toLowerCase()) {
    case 'w': handleMovement(-1, 0); break;
    case 's': handleMovement(1, 0); break;
    case 'a': handleMovement(0, -1); break;
    case 'd': handleMovement(0, 1); break;
    case 'q': handleFlag(); break;
  }
});

/* =========================================================
   СТАРТИРАНЕ НА АЛГОРИТЪМА
   ========================================================= */
const runAlgorithm = () => {
  playerState = null;
  
  console.log("Стартиране на алгоритъма...");
  const { routes, stats } = findAllRoutes(LEVEL, MINES);
  console.log(`Алгоритъмът приключи! Намерени маршрути: ${routes.length}`);
  
  optimal = pickOptimal(routes);
  
  lastResult = {
    routes, stats,
    flags: optimal?.flags ?? [],
    inventory: optimal?.inventory ?? {},
    path: optimal?.path ?? []
  };
  
  showAll = false;
  const revealed = collectRevealed(routes, optimal);
  render(revealed, optimal?.path ?? [], []);
  renderRoutes(routes, optimal);
};

/* --- Бутони --- */
document.getElementById('btn-all').addEventListener('click', () => {
  if (!lastResult) return;
  showAll = true;
  renderRoutes(lastResult.routes, optimal);
});

document.getElementById('btn-optimal').addEventListener('click', () => {
  if (!optimal) return;
  showAll = false;
  const revealed = collectRevealed(lastResult.routes, optimal);
  render(revealed, optimal.path, optimal.path);
  renderRoutes(lastResult.routes, optimal);
});

document.getElementById('btn-new').addEventListener('click', () => {
  initNewMap();
});

document.getElementById('btn-reset').addEventListener('click', () => {
  if (playerState) {
    playerState = createInitialState(LEVEL, MINES);
    facingDir = [-1, 0];
    renderBoard(playerState.revealed, [], []);
    renderInventory(playerState.inventory);
  } else {
    lastResult = null; optimal = null; showAll = false;
    routesEl.innerHTML = '';
    renderInventory({});
    renderStats(null);
    renderBoard(['0,0']);
  }
});

/* --- Инициализация --- */
const initNewMap = () => {
  const { grid, mines } = generateMap();
  LEVEL = grid;
  MINES = mines;
  lastResult = null;
  optimal = null;
  showAll = false;
  routesEl.innerHTML = '';
  
  playerState = createInitialState(LEVEL, MINES);
  facingDir = [-1, 0];
  
  runAlgorithm();
};

// Първоначално зареждане
initNewMap();