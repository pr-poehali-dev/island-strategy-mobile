import { useState, useCallback } from 'react';
import { generateIslandGrid, IslandGrid, GeneratedIsland } from '@/components/IslandGenerator';
import {
  GameState, BuildingType, PlayerId,
  createInitialState, canBuildBuilding, canBuildWindmill, canBuildFactory,
  canPlaceUnit, maxUnitsThisTurn,
  getAttackingUnits, placeUnit, buildBuilding, performAttacks, endTurn,
  WarMap,
} from '@/components/WarGame';
import Icon from '@/components/ui/icon';

type Screen = 'home' | 'count-game' | 'rules' | 'progress' | 'war';
type Tool = 'count' | 'erase';
type WarAction = 'idle' | 'build' | 'place-unit';

interface GameRecord {
  id: number;
  date: string;
  gridSize: string;
  islandsCount: number;
  cellsCounted: number;
  completed: boolean;
  duration: number;
}

const COUNTING_COLORS = [
  '#7ab87a', '#d4887a', '#9a7ab8', '#e8a855',
  '#7ab8b0', '#c87060', '#a0c870', '#b07840',
];

const P1_COLOR = '#3a7bd5';
const P2_COLOR = '#d53a3a';

const BUILDING_NAMES: Record<BuildingType, string> = {
  hq: '🏰 Главное здание',
  windmill: '⚙️ Ветряк',
  factory: '🏭 Завод',
};

const BUILDING_DESC: Record<BuildingType, string> = {
  hq: 'Позволяет строить здания',
  windmill: 'Даёт 2 слота для зданий',
  factory: 'Производит 1 юнита в ход',
};

export default function Index() {
  const [screen, setScreen] = useState<Screen>('home');

  // ── Счётная игра ──
  const [grid, setGrid] = useState<GeneratedIsland | null>(null);
  const [tool, setTool] = useState<Tool>('count');
  const [selectedIsland, setSelectedIsland] = useState<number>(-1);
  const [colorIdx, setColorIdx] = useState(0);
  const [records, setRecords] = useState<GameRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem('island-records') || '[]'); } catch { return []; }
  });
  const [gameStartTime, setGameStartTime] = useState<number>(0);
  const [gridConfig, setGridConfig] = useState({ rows: 14, cols: 18 });
  const [islandCounts, setIslandCounts] = useState<Map<number, number>>(new Map());

  // ── Война ──
  const [warState, setWarState] = useState<GameState | null>(null);
  const [warAction, setWarAction] = useState<WarAction>('idle');
  const [buildType, setBuildType] = useState<BuildingType>('factory');
  const [highlightCells, setHighlightCells] = useState<Set<string>>(new Set());
  const [showLog, setShowLog] = useState(false);

  // ─── Счётная игра ───────────────────────────────────────────────────────────

  const startCountGame = useCallback((rows: number, cols: number) => {
    const newGrid = generateIslandGrid(rows, cols);
    setGrid(newGrid);
    setGridConfig({ rows, cols });
    setColorIdx(0);
    setSelectedIsland(-1);
    setIslandCounts(new Map());
    setGameStartTime(Date.now());
    setScreen('count-game');
  }, []);

  const handleCellClick = useCallback((row: number, col: number) => {
    setGrid(prevGrid => {
      if (!prevGrid) return prevGrid;
      const cell = prevGrid.cells[row][col];
      if (cell.type === 'water') return prevGrid;
      const islandId = prevGrid.islands[row][col];
      const newCells = prevGrid.cells.map(r => r.map(c => ({ ...c })));
      if (tool === 'erase') {
        if (newCells[row][col].type === 'counted') {
          newCells[row][col].type = 'island';
          newCells[row][col].color = undefined;
        }
      } else {
        if (selectedIsland !== islandId) {
          setSelectedIsland(islandId);
          setColorIdx(prev => {
            const nextColor = COUNTING_COLORS[prev % COUNTING_COLORS.length];
            let count = 0;
            for (let r = 0; r < prevGrid.rows; r++) {
              for (let c = 0; c < prevGrid.cols; c++) {
                if (prevGrid.islands[r][c] === islandId && newCells[r][c].type !== 'water') {
                  newCells[r][c].type = 'counted';
                  newCells[r][c].color = nextColor;
                  count++;
                }
              }
            }
            setIslandCounts(m => new Map(m).set(islandId, count));
            return prev + 1;
          });
        } else {
          for (let r = 0; r < prevGrid.rows; r++) {
            for (let c = 0; c < prevGrid.cols; c++) {
              if (prevGrid.islands[r][c] === islandId && newCells[r][c].type === 'counted') {
                newCells[r][c].type = 'island';
                newCells[r][c].color = undefined;
              }
            }
          }
          setIslandCounts(m => { const nm = new Map(m); nm.delete(islandId); return nm; });
          setSelectedIsland(-1);
        }
      }
      return { ...prevGrid, cells: newCells };
    });
  }, [tool, selectedIsland]);

  const saveAndFinish = useCallback(() => {
    if (!grid) return;
    const duration = Math.round((Date.now() - gameStartTime) / 1000);
    const uniqueIslands = new Set<number>();
    for (let r = 0; r < grid.rows; r++)
      for (let c = 0; c < grid.cols; c++)
        if (grid.islands[r][c] >= 0) uniqueIslands.add(grid.islands[r][c]);
    const totalCells = Array.from(islandCounts.values()).reduce((a, b) => a + b, 0);
    const completed = islandCounts.size === uniqueIslands.size;
    const record: GameRecord = {
      id: Date.now(),
      date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }),
      gridSize: `${gridConfig.cols}×${gridConfig.rows}`,
      islandsCount: uniqueIslands.size,
      cellsCounted: totalCells,
      completed,
      duration,
    };
    const updated = [record, ...records].slice(0, 20);
    setRecords(updated);
    localStorage.setItem('island-records', JSON.stringify(updated));
    setScreen('progress');
  }, [grid, gameStartTime, islandCounts, gridConfig, records]);

  const formatDuration = (s: number) => s < 60 ? `${s} сек` : `${Math.floor(s / 60)} мин ${s % 60} сек`;

  const totalGames = records.length;
  const completedGames = records.filter(r => r.completed).length;
  const totalCells = records.reduce((a, r) => a + r.cellsCounted, 0);
  const avgIslands = totalGames > 0 ? Math.round(records.reduce((a, r) => a + r.islandsCount, 0) / totalGames) : 0;
  const uniqueIslandsInGame = grid ? new Set(grid.islands.flat().filter(id => id >= 0)).size : 0;

  // ─── Война ─────────────────────────────────────────────────────────────────

  const startWar = useCallback(() => {
    setWarState(createInitialState(16, 28));
    setWarAction('idle');
    setHighlightCells(new Set());
    setScreen('war');
  }, []);

  const computeHighlight = useCallback((state: GameState, action: WarAction, bType: BuildingType) => {
    if (!state) return new Set<string>();
    const player = state.currentPlayer;
    const cells = new Set<string>();

    if (action === 'place-unit') {
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          if (canPlaceUnit(state, player, r, c)) cells.add(`${r},${c}`);
        }
      }
    } else if (action === 'build') {
      const midCol = Math.floor(state.cols / 2);
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          const isOwn = (player === 1 && c < midCol) || (player === 2 && c >= midCol);
          if (!isOwn || !state.grid[r]?.[c]) continue;
          if (state.buildings.some(b => b.row === r && b.col === c)) continue;
          if (state.units.some(u => u.row === r && u.col === c)) continue;
          if (state.deadCells.some(d => d.row === r && d.col === c)) continue;
          cells.add(`${r},${c}`);
        }
      }
    }
    return cells;
  }, []);

  const handleWarCellClick = useCallback((row: number, col: number) => {
    if (!warState || warState.winner) return;

    if (warAction === 'place-unit') {
      const next = placeUnit(warState, row, col);
      if (next !== warState) {
        setWarState(next);
        const newHighlight = computeHighlight(next, 'place-unit', buildType);
        setHighlightCells(newHighlight);
        if (newHighlight.size === 0) setWarAction('idle');
      }
    } else if (warAction === 'build') {
      const next = buildBuilding(warState, buildType, row, col);
      if (next !== warState) {
        setWarState(next);
        setWarAction('idle');
        setHighlightCells(new Set());
      }
    }
  }, [warState, warAction, buildType, computeHighlight]);

  const handleSetAction = (action: WarAction, bType?: BuildingType) => {
    if (!warState) return;
    const bt = bType || buildType;
    if (bType) setBuildType(bt);
    if (warAction === action && (!bType || bType === buildType)) {
      setWarAction('idle');
      setHighlightCells(new Set());
    } else {
      setWarAction(action);
      setHighlightCells(computeHighlight(warState, action, bt));
    }
  };

  const handleAttack = () => {
    if (!warState || warState.attackedThisTurn) return;
    const next = performAttacks(warState);
    setWarState(next);
    setWarAction('idle');
    setHighlightCells(new Set());
  };

  const handleEndTurn = () => {
    if (!warState) return;
    const afterAttack = warState.attackedThisTurn ? warState : performAttacks(warState);
    const next = endTurn(afterAttack);
    setWarState(next);
    setWarAction('idle');
    setHighlightCells(new Set());
  };

  // ─── Рендер ────────────────────────────────────────────────────────────────

  const playerColor = (p: PlayerId) => p === 1 ? P1_COLOR : P2_COLOR;
  const playerName = (p: PlayerId) => p === 1 ? 'Игрок 1 🔵' : 'Игрок 2 🔴';

  return (
    <div className="min-h-screen font-caveat" style={{ background: 'var(--paper)' }}>

      {/* ── ГЛАВНЫЙ ЭКРАН ── */}
      {screen === 'home' && (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 py-12 animate-fade-in">
          <div className="text-center mb-10">
            <div className="text-7xl mb-2">🏝️</div>
            <h1 className="text-6xl font-bold mb-2" style={{ color: 'var(--ink)', fontFamily: 'Caveat Brush, Caveat, cursive' }}>
              Острова
            </h1>
            <p className="text-2xl" style={{ color: 'var(--ink-light)' }}>игры с картой на бумаге</p>
          </div>

          <div className="flex flex-col gap-4 w-full max-w-sm">
            {/* Война */}
            <div className="paper-card p-6 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">⚔️</span>
                <div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Война островов</div>
                  <div className="text-base" style={{ color: 'var(--ink-light)' }}>2 игрока · на одном устройстве</div>
                </div>
              </div>
              <button className="btn-ink text-xl w-full py-2" onClick={startWar}>
                Начать войну ⚔️
              </button>
            </div>

            {/* Счёт клеток */}
            <div className="paper-card p-6 animate-fade-in-up" style={{ animationDelay: '0.12s' }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">⚡</span>
                <div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Считай острова</div>
                  <div className="text-base" style={{ color: 'var(--ink-light)' }}>подсчёт клеток</div>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button className="btn-ink text-lg flex-1" onClick={() => startCountGame(10, 14)}>Малая</button>
                <button className="btn-ink text-lg flex-1" onClick={() => startCountGame(14, 18)}>Средняя</button>
                <button className="btn-ink text-lg flex-1" onClick={() => startCountGame(18, 24)}>Большая</button>
              </div>
            </div>

            <button className="paper-card p-5 text-left w-full animate-fade-in-up" style={{ animationDelay: '0.18s', cursor: 'pointer' }} onClick={() => setScreen('progress')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">📊</span>
                  <div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Прогресс</div>
                    <div className="text-base" style={{ color: 'var(--ink-light)' }}>{totalGames > 0 ? `${totalGames} партий` : 'нет партий'}</div>
                  </div>
                </div>
                <Icon name="ChevronRight" size={24} />
              </div>
            </button>

            <button className="paper-card p-5 text-left w-full animate-fade-in-up" style={{ animationDelay: '0.24s', cursor: 'pointer' }} onClick={() => setScreen('rules')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">📖</span>
                  <div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Правила</div>
                    <div className="text-base" style={{ color: 'var(--ink-light)' }}>как играть</div>
                  </div>
                </div>
                <Icon name="ChevronRight" size={24} />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── ВОЙНА ОСТРОВОВ ── */}
      {screen === 'war' && warState && (
        <div className="flex flex-col min-h-screen">

          {/* Шапка */}
          <div className="flex items-center justify-between px-3 py-2 border-b-2 flex-shrink-0"
            style={{ borderColor: 'var(--ink)', background: 'rgba(245,240,232,0.97)' }}>
            <button className="btn-outline-ink text-base px-2 py-1" onClick={() => setScreen('home')}>← Выйти</button>
            <div className="text-center flex-1 mx-2">
              {warState.winner ? (
                <div className="text-2xl font-bold animate-scale-in" style={{ color: playerColor(warState.winner) }}>
                  🏆 {playerName(warState.winner)} победил!
                </div>
              ) : (
                <>
                  <div className="text-xl font-bold" style={{ color: playerColor(warState.currentPlayer) }}>
                    {playerName(warState.currentPlayer)}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--ink-light)' }}>Ход {warState.turn}</div>
                </>
              )}
            </div>
            <button className="btn-outline-ink text-base px-2 py-1" onClick={() => setShowLog(v => !v)}>
              📋
            </button>
          </div>

          {/* Лог (выдвигается) */}
          {showLog && (
            <div className="border-b px-3 py-2 text-sm max-h-28 overflow-y-auto" style={{ background: 'rgba(240,235,225,0.97)', borderColor: 'rgba(44,31,20,0.2)' }}>
              {[...warState.log].reverse().map((l, i) => (
                <div key={i} style={{ color: 'var(--ink-light)' }}>{l}</div>
              ))}
            </div>
          )}

          {/* Карта */}
          <div className="flex-1 overflow-auto p-2 flex justify-center items-start">
            <div className="paper-card p-2 inline-block">
              <WarMap
                state={warState}
                onCellClick={handleWarCellClick}
                highlightCells={highlightCells}
                cellSize={24}
              />
            </div>
          </div>

          {/* Панель действий */}
          {!warState.winner && (
            <div className="border-t-2 px-3 py-3 flex-shrink-0" style={{ borderColor: 'var(--ink)', background: 'rgba(245,240,232,0.97)' }}>

              {/* Счётчики убитых клеток */}
              <div className="flex gap-4 mb-2 text-sm">
                {([1, 2] as PlayerId[]).map(p => {
                  const killed = warState.deadCells.filter(d => d.killer === p).length;
                  return (
                    <span key={p} style={{ color: p === 1 ? '#2563eb' : '#dc2626', fontWeight: 600 }}>
                      {p === 1 ? '🔵' : '🔴'} убито: {killed}
                    </span>
                  );
                })}
              </div>

              {/* Статус хода */}
              <div className="flex gap-3 mb-2 text-sm flex-wrap">
                {(() => {
                  const p = warState.currentPlayer;
                  const canBuild = canBuildBuilding(warState, p);
                  const maxU = maxUnitsThisTurn(warState, p);
                  const placed = warState.placedUnitsThisTurn;
                  const attacks = getAttackingUnits(warState, p);
                  return (
                    <>
                      <span style={{ color: canBuild && !warState.builtBuildingThisTurn ? 'var(--grass-dark)' : 'var(--ink-light)' }}>
                        {warState.builtBuildingThisTurn ? '✅ Здание построено' : canBuild ? '🔨 Строй ветряк или завод' : '🚫 Нет слотов'}
                      </span>
                      <span style={{ color: maxU > placed ? 'var(--grass-dark)' : 'var(--ink-light)' }}>
                        • Точек: {placed}/{maxU}
                      </span>
                      <span style={{ color: attacks.length > 0 ? '#d44' : 'var(--ink-light)' }}>
                        💥 Атак: {attacks.length}
                      </span>
                    </>
                  );
                })()}
              </div>

              {/* Кнопки */}
              <div className="flex flex-wrap gap-2">
                {/* Ветряк — если есть HQ и ещё не строили */}
                {canBuildWindmill(warState, warState.currentPlayer) && (
                  <button
                    className={`text-base px-3 py-1 rounded transition-all ${warAction === 'build' && buildType === 'windmill' ? 'btn-ink' : 'btn-outline-ink'}`}
                    onClick={() => handleSetAction('build', 'windmill')}
                  >
                    ⚙️ Ветряк
                  </button>
                )}
                {/* Завод — если есть HQ + свободный слот */}
                {canBuildFactory(warState, warState.currentPlayer) && (
                  <button
                    className={`text-base px-3 py-1 rounded transition-all ${warAction === 'build' && buildType === 'factory' ? 'btn-ink' : 'btn-outline-ink'}`}
                    onClick={() => handleSetAction('build', 'factory')}
                  >
                    🏭 Завод
                  </button>
                )}

                {/* Поставить юнита */}
                {maxUnitsThisTurn(warState, warState.currentPlayer) > warState.placedUnitsThisTurn && (
                  <button
                    className={`text-base px-3 py-1 rounded transition-all ${warAction === 'place-unit' ? 'btn-ink' : 'btn-outline-ink'}`}
                    onClick={() => handleSetAction('place-unit')}
                  >
                    • Поставить точку
                  </button>
                )}

                {/* Атаковать */}
                {getAttackingUnits(warState, warState.currentPlayer).length > 0 && !warState.attackedThisTurn && (
                  <button className="btn-ink text-base px-3 py-1" style={{ background: '#c0392b' }} onClick={handleAttack}>
                    💥 Атаковать
                  </button>
                )}

                {/* Завершить ход */}
                <button className="btn-ink text-base px-3 py-1 ml-auto" onClick={handleEndTurn}>
                  Завершить ход →
                </button>
              </div>

              {/* Подсказка активного действия */}
              {warAction !== 'idle' && (
                <div className="mt-2 text-sm px-3 py-1 rounded" style={{ background: 'rgba(232,168,85,0.2)', color: 'var(--ink)' }}>
                  {warAction === 'place-unit' && '👆 Нажми на жёлтую клетку рядом с заводом или юнитом'}
                  {warAction === 'build' && `👆 Выбери клетку на своём острове → ${BUILDING_NAMES[buildType]}`}
                </div>
              )}

              {/* Легенда зданий */}
              <div className="mt-2 flex gap-3 flex-wrap text-xs" style={{ color: 'var(--ink-light)' }}>
                {(['hq', 'windmill', 'factory'] as BuildingType[]).map(bt => (
                  <span key={bt}>{BUILDING_NAMES[bt]} — {BUILDING_DESC[bt]}</span>
                ))}
              </div>
            </div>
          )}

          {/* Кнопка новой игры при победе */}
          {warState.winner && (
            <div className="p-4 text-center border-t-2" style={{ borderColor: 'var(--ink)', background: 'rgba(245,240,232,0.97)' }}>
              <button className="btn-ink text-xl px-8 py-2" onClick={startWar}>
                🔄 Новая война
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── СЧЁТНАЯ ИГРА ── */}
      {screen === 'count-game' && grid && (
        <div className="flex flex-col min-h-screen">
          <div className="flex items-center justify-between px-4 py-3 border-b-2" style={{ borderColor: 'var(--ink)', background: 'rgba(245,240,232,0.97)' }}>
            <button className="btn-outline-ink text-lg px-3 py-1" onClick={() => setScreen('home')}>← Назад</button>
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{islandCounts.size} / {uniqueIslandsInGame} островов</div>
              <div className="text-sm" style={{ color: 'var(--ink-light)' }}>{Array.from(islandCounts.values()).reduce((a, b) => a + b, 0)} клеток</div>
            </div>
            <button className="btn-ink text-lg px-3 py-1" onClick={saveAndFinish}>Готово ✓</button>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 border-b flex-wrap" style={{ borderColor: 'rgba(44,31,20,0.2)', background: 'rgba(245,240,232,0.9)' }}>
            <button className={`text-lg px-3 py-1 rounded transition-all ${tool === 'count' ? 'btn-ink' : 'btn-outline-ink'}`} onClick={() => setTool('count')}>🖊 Считать</button>
            <button className={`text-lg px-3 py-1 rounded transition-all ${tool === 'erase' ? 'btn-ink' : 'btn-outline-ink'}`} onClick={() => setTool('erase')}>✕ Стереть</button>
            <button className="btn-outline-ink text-lg px-3 py-1 ml-auto" onClick={() => startCountGame(gridConfig.rows, gridConfig.cols)}>🔄 Новая</button>
          </div>
          <div className="flex-1 overflow-auto p-4 flex justify-center items-start">
            <div className="paper-card p-3 inline-block animate-scale-in">
              <IslandGrid data={grid} onCellClick={handleCellClick} cellSize={26} />
            </div>
          </div>
          {islandCounts.size > 0 && (
            <div className="px-4 py-3 border-t-2 flex flex-wrap gap-2" style={{ borderColor: 'rgba(44,31,20,0.2)', background: 'rgba(245,240,232,0.97)' }}>
              {Array.from(islandCounts.entries()).map(([id, count], i) => (
                <div key={id} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-lg font-bold"
                  style={{ background: COUNTING_COLORS[i % COUNTING_COLORS.length] + '40', border: `2px solid ${COUNTING_COLORS[i % COUNTING_COLORS.length]}`, color: 'var(--ink)' }}>
                  <div className="w-3 h-3 rounded-sm" style={{ background: COUNTING_COLORS[i % COUNTING_COLORS.length] }} />
                  {count} кл.
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ПРАВИЛА ── */}
      {screen === 'rules' && (
        <div className="max-w-lg mx-auto px-4 py-8 animate-fade-in">
          <button className="btn-outline-ink text-xl mb-6" onClick={() => setScreen('home')}>← Назад</button>
          <h2 className="text-5xl font-bold mb-8 text-center" style={{ color: 'var(--ink)', fontFamily: 'Caveat Brush, Caveat, cursive' }}>Правила</h2>

          <h3 className="text-3xl font-bold mb-4" style={{ color: P1_COLOR }}>⚔️ Война островов</h3>
          <div className="flex flex-col gap-4 mb-8">
            {[
              { icon: '🏰', title: 'Главное здание', text: 'Стартовое здание каждого игрока. Позволяет строить другие здания. Если уничтожено — проигрыш.' },
              { icon: '⚙️', title: 'Ветряк', text: 'Стартовое здание. Даёт 2 слота для зданий. Без ветряка ничего не работает.' },
              { icon: '🏭', title: 'Завод', text: 'Строится за один ход при наличии HQ + ветряка со свободным слотом. Производит 1 юнита в ход. Нужен для постройки точек.' },
              { icon: '⚙️+🏭', title: 'Выбор здания', text: 'За один ход можно построить одно здание на выбор — ветряк (даёт +2 слота) или завод (даёт +1 юнит в ход). Строить и точки, и здание в один ход можно.' },
              { icon: '•', title: 'Юнит (точка)', text: 'Ставится рядом с заводом или рядом с цепочкой юнитов от завода. 1 HP. Атакует соседние вражеские клетки (до 1 клетки).' },
              { icon: '💥', title: 'Атака', text: 'Автоматически: все твои юниты рядом с врагами атакуют. Юниты: 1 HP. Здания: 2 HP. Убитая клетка закрашивается цветом победителя.' },
            ].map((r, i) => (
              <div key={i} className="paper-card p-4">
                <div className="flex gap-3 items-start">
                  <div className="text-3xl flex-shrink-0">{r.icon}</div>
                  <div>
                    <div className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{r.title}</div>
                    <div className="text-lg" style={{ color: 'var(--ink-light)' }}>{r.text}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <button className="btn-ink text-2xl px-8 py-3" onClick={startWar}>Начать войну ⚔️</button>
          </div>
        </div>
      )}

      {/* ── ПРОГРЕСС ── */}
      {screen === 'progress' && (
        <div className="max-w-lg mx-auto px-4 py-8 animate-fade-in">
          <button className="btn-outline-ink text-xl mb-6" onClick={() => setScreen('home')}>← Назад</button>
          <h2 className="text-5xl font-bold mb-8 text-center" style={{ color: 'var(--ink)', fontFamily: 'Caveat Brush, Caveat, cursive' }}>Прогресс</h2>
          <div className="grid grid-cols-2 gap-3 mb-8">
            {[
              { label: 'Партий сыграно', value: totalGames, icon: '🎮' },
              { label: 'Завершено', value: completedGames, icon: '✅' },
              { label: 'Клеток посчитано', value: totalCells, icon: '🔢' },
              { label: 'Ср. островов', value: avgIslands || '—', icon: '🏝️' },
            ].map((stat, i) => (
              <div key={i} className="paper-card p-4 text-center animate-fade-in-up" style={{ animationDelay: `${i * 0.07}s` }}>
                <div className="text-3xl mb-1">{stat.icon}</div>
                <div className="text-4xl font-bold" style={{ color: 'var(--ink)' }}>{stat.value}</div>
                <div className="text-base" style={{ color: 'var(--ink-light)' }}>{stat.label}</div>
              </div>
            ))}
          </div>
          {records.length === 0 ? (
            <div className="paper-card p-8 text-center">
              <div className="text-5xl mb-3">🗺️</div>
              <div className="text-2xl" style={{ color: 'var(--ink-light)' }}>Ещё нет партий.<br />Начни первую игру!</div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {records.map((r, i) => (
                <div key={r.id} className="paper-card p-4 animate-fade-in-up" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">{r.completed ? '✅' : '⏸️'}</span>
                    <span className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{r.date}</span>
                  </div>
                  <div className="text-lg" style={{ color: 'var(--ink-light)' }}>
                    {r.gridSize} · {r.islandsCount} островов · {r.cellsCounted} кл. · {formatDuration(r.duration)}
                  </div>
                </div>
              ))}
              <button className="btn-outline-ink text-lg mt-2 self-center" onClick={() => { if (confirm('Очистить историю?')) { setRecords([]); localStorage.removeItem('island-records'); } }}>
                Очистить историю
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}