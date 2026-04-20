import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Типы ───────────────────────────────────────────────────────────────────

export type PlayerId = 1 | 2;
export type BuildingType = 'hq' | 'windmill' | 'factory';
export type CellContent = 'empty' | 'water' | 'island';

export interface Building {
  id: string;
  type: BuildingType;
  owner: PlayerId;
  hp: number; // max 2
  row: number;
  col: number;
}

export interface Unit {
  id: string;
  owner: PlayerId;
  hp: number; // max 1
  row: number;
  col: number;
}

export interface DeadCell {
  row: number;
  col: number;
  killer: PlayerId;
}

export interface GameState {
  grid: boolean[][]; // true = island, false = water
  rows: number;
  cols: number;
  buildings: Building[];
  units: Unit[];
  deadCells: DeadCell[];
  currentPlayer: PlayerId;
  turn: number;
  winner: PlayerId | null;
  log: string[];
  // Какие действия уже выполнены в этом ходу
  builtBuildingThisTurn: boolean;
  placedUnitsThisTurn: number; // сколько юнитов уже поставлено
  attackedThisTurn: boolean;
}

// ─── Генерация карты с двумя островами ──────────────────────────────────────

function generateTwoIslands(rows: number, cols: number): boolean[][] {
  const grid: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));

  // Два острова: левый и правый
  const islandDefs = [
    { centerR: Math.floor(rows / 2), centerC: Math.floor(cols * 0.22), size: 28 },
    { centerR: Math.floor(rows / 2), centerC: Math.floor(cols * 0.78), size: 28 },
  ];

  for (const { centerR, centerC, size } of islandDefs) {
    const frontier: [number, number][] = [[centerR, centerC]];
    let added = 0;
    const visited = new Set<string>();

    while (frontier.length > 0 && added < size) {
      const idx = Math.floor(Math.random() * frontier.length);
      const [r, c] = frontier.splice(idx, 1)[0];
      const key = `${r},${c}`;
      if (visited.has(key)) continue;
      if (r < 1 || r >= rows - 1 || c < 1 || c >= cols - 1) continue;
      visited.add(key);
      grid[r][c] = true;
      added++;

      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
        if (Math.random() < 0.6) frontier.push([r + dr, c + dc]);
      }
    }
  }

  return grid;
}

// Найти все клетки острова (левый или правый)
function getIslandCells(grid: boolean[][], cols: number, side: 'left' | 'right'): [number, number][] {
  const cells: [number, number][] = [];
  const midCol = Math.floor(cols / 2);
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c]) continue;
      if (side === 'left' && c < midCol) cells.push([r, c]);
      if (side === 'right' && c >= midCol) cells.push([r, c]);
    }
  }
  return cells;
}

function randomCell(cells: [number, number][], exclude: [number, number][] = []): [number, number] | null {
  const excSet = new Set(exclude.map(([r, c]) => `${r},${c}`));
  const avail = cells.filter(([r, c]) => !excSet.has(`${r},${c}`));
  if (avail.length === 0) return null;
  return avail[Math.floor(Math.random() * avail.length)];
}

// ─── Создать начальное состояние ─────────────────────────────────────────────

export function createInitialState(rows: number, cols: number): GameState {
  const grid = generateTwoIslands(rows, cols);

  const leftCells = getIslandCells(grid, cols, 'left');
  const rightCells = getIslandCells(grid, cols, 'right');

  const buildings: Building[] = [];
  const used: [number, number][] = [];

  // Игрок 1 (левый остров): HQ + ветряк
  const hq1pos = randomCell(leftCells, used);
  if (hq1pos) {
    buildings.push({ id: 'b1-hq', type: 'hq', owner: 1, hp: 2, row: hq1pos[0], col: hq1pos[1] });
    used.push(hq1pos);
  }
  const wm1pos = randomCell(leftCells, used);
  if (wm1pos) {
    buildings.push({ id: 'b1-wm', type: 'windmill', owner: 1, hp: 2, row: wm1pos[0], col: wm1pos[1] });
    used.push(wm1pos);
  }

  // Игрок 2 (правый остров): HQ + ветряк
  const hq2pos = randomCell(rightCells, used);
  if (hq2pos) {
    buildings.push({ id: 'b2-hq', type: 'hq', owner: 2, hp: 2, row: hq2pos[0], col: hq2pos[1] });
    used.push(hq2pos);
  }
  const wm2pos = randomCell(rightCells, used);
  if (wm2pos) {
    buildings.push({ id: 'b2-wm', type: 'windmill', owner: 2, hp: 2, row: wm2pos[0], col: wm2pos[1] });
    used.push(wm2pos);
  }

  return {
    grid,
    rows,
    cols,
    buildings,
    units: [],
    deadCells: [],
    currentPlayer: 1,
    turn: 1,
    winner: null,
    log: ['Игра начата! Ход игрока 1 🔵'],
    builtBuildingThisTurn: false,
    placedUnitsThisTurn: 0,
    attackedThisTurn: false,
  };
}

// ─── Игровая логика ──────────────────────────────────────────────────────────

function isAdjacent(r1: number, c1: number, r2: number, c2: number): boolean {
  return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1 && !(r1 === r2 && c1 === c2);
}

function isFree(state: GameState, r: number, c: number): boolean {
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return false;
  if (state.buildings.some(b => b.row === r && b.col === c)) return false;
  if (state.units.some(u => u.row === r && u.col === c)) return false;
  if (state.deadCells.some(d => d.row === r && d.col === c)) return false;
  return true;
}

// isFree только для зданий — только на острове
function isFreeIsland(state: GameState, r: number, c: number): boolean {
  if (!state.grid[r]?.[c]) return false;
  return isFree(state, r, c);
}

// Подсчёт активных слотов зданий для игрока
function getActiveSlots(state: GameState, player: PlayerId): number {
  const windmills = state.buildings.filter(b => b.owner === player && b.type === 'windmill').length;
  return windmills * 2; // каждый ветряк даёт 2 слота
}

// Подсчёт работающих зданий игрока (не считая ветряки сами по себе)
function getWorkingBuildingCount(state: GameState, player: PlayerId): number {
  return state.buildings.filter(b => b.owner === player && b.type !== 'windmill').length;
}

// Можно ли строить новое здание
export function canBuildBuilding(state: GameState, player: PlayerId): boolean {
  if (state.builtBuildingThisTurn) return false;
  const hasHQ = state.buildings.some(b => b.owner === player && b.type === 'hq');
  if (!hasHQ) return false;
  const slots = getActiveSlots(state, player);
  const working = getWorkingBuildingCount(state, player);
  return working < slots;
}

// Сколько юнитов можно поставить в этот ход
export function maxUnitsThisTurn(state: GameState, player: PlayerId): number {
  const factories = state.buildings.filter(b => b.owner === player && b.type === 'factory');
  const slots = getActiveSlots(state, player);
  const working = getWorkingBuildingCount(state, player);
  // Завод работает если working <= slots
  const activeFactories = factories.filter(() => working <= slots).length;
  return activeFactories;
}

// Проверить что клетка связана с заводом через цепочку юнитов игрока
function isConnectedToFactory(state: GameState, player: PlayerId, row: number, col: number): boolean {
  const factories = state.buildings.filter(b => b.owner === player && b.type === 'factory');
  const playerUnits = state.units.filter(u => u.owner === player);

  // BFS от завода
  for (const factory of factories) {
    const visited = new Set<string>();
    const queue: [number, number][] = [[factory.row, factory.col]];
    visited.add(`${factory.row},${factory.col}`);

    while (queue.length > 0) {
      const [cr, cc] = queue.shift()!;
      // Проверяем соседей (расстояние 1)
      for (const u of playerUnits) {
        const key = `${u.row},${u.col}`;
        if (!visited.has(key) && isAdjacent(cr, cc, u.row, u.col)) {
          visited.add(key);
          queue.push([u.row, u.col]);
        }
      }
    }

    // Проверяем, является ли (row, col) соседом любой посещённой клетки
    for (const key of visited) {
      const [vr, vc] = key.split(',').map(Number);
      if (isAdjacent(vr, vc, row, col)) return true;
    }
  }
  return false;
}

// Может ли игрок поставить юнита на (row, col)
export function canPlaceUnit(state: GameState, player: PlayerId, row: number, col: number): boolean {
  if (state.placedUnitsThisTurn >= maxUnitsThisTurn(state, player)) return false;
  if (!isFree(state, row, col)) return false;
  return isConnectedToFactory(state, player, row, col);
}

// Юниты которые могут атаковать (рядом с врагом)
export function getAttackingUnits(state: GameState, player: PlayerId): { unit: Unit; targets: (Building | Unit)[] }[] {
  const enemies = [
    ...state.buildings.filter(b => b.owner !== player),
    ...state.units.filter(u => u.owner !== player),
  ];
  const result: { unit: Unit; targets: (Building | Unit)[] }[] = [];

  for (const unit of state.units.filter(u => u.owner === player)) {
    const targets = enemies.filter(e => isAdjacent(unit.row, unit.col, e.row, e.col));
    if (targets.length > 0) result.push({ unit, targets });
  }
  return result;
}

// ─── Выполнить ход ───────────────────────────────────────────────────────────

export function placeUnit(state: GameState, row: number, col: number): GameState {
  const player = state.currentPlayer;
  if (!canPlaceUnit(state, player, row, col)) return state;

  const newUnit: Unit = {
    id: `u${Date.now()}-${Math.random()}`,
    owner: player,
    hp: 1,
    row,
    col,
  };

  return {
    ...state,
    units: [...state.units, newUnit],
    placedUnitsThisTurn: state.placedUnitsThisTurn + 1,
    log: [...state.log, `Игрок ${player} поставил юнита на (${row},${col})`],
  };
}

export function buildBuilding(state: GameState, type: BuildingType, row: number, col: number): GameState {
  const player = state.currentPlayer;
  if (!canBuildBuilding(state, player)) return state;
  if (!isFreeIsland(state, row, col)) return state;
  // Здание должно быть на своём острове
  const midCol = Math.floor(state.cols / 2);
  const isOwnIsland = (player === 1 && col < midCol) || (player === 2 && col >= midCol);
  if (!isOwnIsland) return state;

  const building: Building = {
    id: `b${Date.now()}-${Math.random()}`,
    type,
    owner: player,
    hp: 2,
    row,
    col,
  };

  const names: Record<BuildingType, string> = { hq: 'главное здание', windmill: 'ветряк', factory: 'завод' };

  return {
    ...state,
    buildings: [...state.buildings, building],
    builtBuildingThisTurn: true,
    log: [...state.log, `Игрок ${player} построил ${names[type]} на (${row},${col})`],
  };
}

// Автоатака всеми юнитами игрока
export function performAttacks(state: GameState): GameState {
  const player = state.currentPlayer;
  let newBuildings = state.buildings.map(b => ({ ...b }));
  let newUnits = state.units.map(u => ({ ...u }));
  const newDeadCells = [...state.deadCells];
  const newLog = [...state.log];

  const attackers = getAttackingUnits({ ...state, buildings: newBuildings, units: newUnits }, player);

  for (const { unit, targets } of attackers) {
    for (const target of targets) {
      target.hp -= 1;
      const isBuilding = 'type' in target;
      newLog.push(`Юнит игрока ${player} атакует ${isBuilding ? 'здание' : 'юнита'} в (${target.row},${target.col})`);

      if (target.hp <= 0) {
        newDeadCells.push({ row: target.row, col: target.col, killer: player });
        if (isBuilding) {
          newBuildings = newBuildings.filter(b => b.id !== (target as Building).id);
          newLog.push(`💥 Здание в (${target.row},${target.col}) уничтожено!`);
        } else {
          newUnits = newUnits.filter(u => u.id !== (target as Unit).id);
          newLog.push(`💀 Юнит в (${target.row},${target.col}) уничтожен!`);
        }
      }
    }
  }

  // Проверяем победителя: у кого нет HQ — проигрывает
  const p1HasHQ = newBuildings.some(b => b.owner === 1 && b.type === 'hq');
  const p2HasHQ = newBuildings.some(b => b.owner === 2 && b.type === 'hq');
  let winner: PlayerId | null = null;
  if (!p1HasHQ) winner = 2;
  if (!p2HasHQ) winner = 1;

  return {
    ...state,
    buildings: newBuildings,
    units: newUnits,
    deadCells: newDeadCells,
    attackedThisTurn: true,
    winner,
    log: newLog,
  };
}

export function endTurn(state: GameState): GameState {
  const next: PlayerId = state.currentPlayer === 1 ? 2 : 1;
  const emoji = next === 1 ? '🔵' : '🔴';
  return {
    ...state,
    currentPlayer: next,
    turn: state.turn + 1,
    builtBuildingThisTurn: false,
    placedUnitsThisTurn: 0,
    attackedThisTurn: false,
    log: [...state.log, `─── Ход ${state.turn + 1}: Игрок ${next} ${emoji} ───`],
  };
}

// ─── Canvas рендер ────────────────────────────────────────────────────────────

const P1_COLOR = '#3a7bd5';
const P2_COLOR = '#d53a3a';
const P1_LIGHT = '#a8c8f0';
const P2_LIGHT = '#f0a8a8';

interface WarMapProps {
  state: GameState;
  onCellClick: (row: number, col: number) => void;
  highlightCells?: Set<string>; // "r,c"
  cellSize?: number;
}

export function WarMap({ state, onCellClick, highlightCells, cellSize = 28 }: WarMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { rows, cols, grid } = state;
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;

    // Вода
    ctx.fillStyle = '#b8d8e8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Волны воды
    ctx.strokeStyle = 'rgba(80, 140, 175, 0.35)';
    ctx.lineWidth = 0.8;
    for (let y = 5; y < canvas.height; y += 8) {
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x += 10) {
        const w = Math.sin((x + y) * 0.25) * 1.2;
        if (x === 0) { ctx.moveTo(x, y + w); } else { ctx.lineTo(x, y + w); }
      }
      ctx.stroke();
    }

    // Острова
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c]) continue;
        const x = c * cellSize;
        const y = r * cellSize;

        // Проверяем мёртвые клетки
        const dead = state.deadCells.find(d => d.row === r && d.col === c);
        if (dead) {
          ctx.fillStyle = dead.killer === 1 ? P1_LIGHT : P2_LIGHT;
          ctx.fillRect(x, y, cellSize, cellSize);
          // Небрежная штриховка ручкой
          ctx.strokeStyle = dead.killer === 1 ? P1_COLOR : P2_COLOR;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.7;
          for (let i = -cellSize; i < cellSize * 2; i += 5) {
            const wobble1 = (Math.random() - 0.5) * 2;
            const wobble2 = (Math.random() - 0.5) * 2;
            ctx.beginPath();
            ctx.moveTo(x + Math.max(0, i) + wobble1, y + wobble1);
            ctx.lineTo(x + Math.min(cellSize, i + cellSize) + wobble2, y + cellSize + wobble2);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = '#c8d89a';
          ctx.fillRect(x, y, cellSize + 0.5, cellSize + 0.5);
        }
      }
    }

    // Подсветка доступных клеток
    if (highlightCells) {
      for (const key of highlightCells) {
        const [r, c] = key.split(',').map(Number);
        const x = c * cellSize;
        const y = r * cellSize;
        const onWater = !grid[r]?.[c];
        // На воде подсветка ярче
        ctx.fillStyle = onWater ? 'rgba(255, 220, 50, 0.55)' : 'rgba(255, 220, 50, 0.35)';
        ctx.fillRect(x, y, cellSize, cellSize);
        ctx.strokeStyle = 'rgba(200, 160, 0, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      }
    }

    // Контуры островов — рукописные
    ctx.lineCap = 'round';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!grid[r][c]) continue;
        const x = c * cellSize;
        const y = r * cellSize;
        const sides = [
          { dr: -1, dc: 0, x1: x, y1: y, x2: x + cellSize, y2: y },
          { dr: 1, dc: 0, x1: x, y1: y + cellSize, x2: x + cellSize, y2: y + cellSize },
          { dr: 0, dc: -1, x1: x, y1: y, x2: x, y2: y + cellSize },
          { dr: 0, dc: 1, x1: x + cellSize, y1: y, x2: x + cellSize, y2: y + cellSize },
        ];
        for (const { dr, dc, x1, y1, x2, y2 } of sides) {
          const nr = r + dr; const nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || !grid[nr][nc]) {
            ctx.beginPath();
            ctx.strokeStyle = '#2c1f14';
            ctx.lineWidth = 1.8 + Math.random() * 0.5;
            const j = 0.7;
            ctx.moveTo(x1 + (Math.random() - 0.5) * j, y1 + (Math.random() - 0.5) * j);
            ctx.lineTo(x2 + (Math.random() - 0.5) * j, y2 + (Math.random() - 0.5) * j);
            ctx.stroke();
          }
        }
      }
    }

    // Сетка
    ctx.strokeStyle = 'rgba(44, 31, 20, 0.1)';
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * cellSize); ctx.lineTo(cols * cellSize, r * cellSize); ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath(); ctx.moveTo(c * cellSize, 0); ctx.lineTo(c * cellSize, rows * cellSize); ctx.stroke();
    }

    // Здания
    ctx.font = `bold ${cellSize * 0.65}px Caveat, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const buildingEmoji: Record<BuildingType, string> = { hq: '🏰', windmill: '⚙️', factory: '🏭' };

    for (const b of state.buildings) {
      const x = b.col * cellSize + cellSize / 2;
      const y = b.row * cellSize + cellSize / 2;

      // Фон здания
      ctx.fillStyle = b.owner === 1 ? P1_LIGHT : P2_LIGHT;
      ctx.beginPath();
      ctx.roundRect(b.col * cellSize + 1, b.row * cellSize + 1, cellSize - 2, cellSize - 2, 3);
      ctx.fill();

      // Рамка
      ctx.strokeStyle = b.owner === 1 ? P1_COLOR : P2_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(b.col * cellSize + 1, b.row * cellSize + 1, cellSize - 2, cellSize - 2, 3);
      ctx.stroke();

      // Эмодзи здания
      ctx.font = `${cellSize * 0.52}px serif`;
      ctx.fillText(buildingEmoji[b.type], x, y - 1);

      // HP точки
      for (let i = 0; i < b.hp; i++) {
        ctx.fillStyle = b.owner === 1 ? P1_COLOR : P2_COLOR;
        ctx.beginPath();
        ctx.arc(b.col * cellSize + 5 + i * 7, b.row * cellSize + cellSize - 5, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Юниты — точки (могут быть на воде)
    for (const u of state.units) {
      const x = u.col * cellSize + cellSize / 2;
      const y = u.row * cellSize + cellSize / 2;
      const color = u.owner === 1 ? P1_COLOR : P2_COLOR;
      const onWater = !state.grid[u.row]?.[u.col];

      // На воде — белая подложка чтобы точка была видна
      if (onWater) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.arc(x, y, cellSize * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }

      // Тень
      ctx.fillStyle = 'rgba(44,31,20,0.2)';
      ctx.beginPath();
      ctx.arc(x + 1.5, y + 1.5, cellSize * 0.28, 0, Math.PI * 2);
      ctx.fill();

      // Сама точка
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, cellSize * 0.28, 0, Math.PI * 2);
      ctx.fill();

      // Белый центр
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(x - 2, y - 2, cellSize * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

  }, [state, highlightCells, cellSize]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const col = Math.floor(((e.clientX - rect.left) * scaleX) / cellSize);
    const row = Math.floor(((e.clientY - rect.top) * scaleY) / cellSize);
    if (row >= 0 && row < state.rows && col >= 0 && col < state.cols) {
      onCellClick(row, col);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{ maxWidth: '100%', height: 'auto', cursor: 'crosshair', imageRendering: 'pixelated', borderRadius: 4 }}
    />
  );
}