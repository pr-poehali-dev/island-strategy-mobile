import { useState, useCallback } from 'react';
import { generateIslandGrid, IslandGrid, GeneratedIsland } from '@/components/IslandGenerator';
import Icon from '@/components/ui/icon';

type Screen = 'home' | 'game' | 'rules' | 'progress';
type Tool = 'count' | 'erase';

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

export default function Index() {
  const [screen, setScreen] = useState<Screen>('home');
  const [grid, setGrid] = useState<GeneratedIsland | null>(null);
  const [tool, setTool] = useState<Tool>('count');
  const [selectedIsland, setSelectedIsland] = useState<number>(-1);
  const [colorIdx, setColorIdx] = useState(0);
  const [records, setRecords] = useState<GameRecord[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('island-records') || '[]');
    } catch { return []; }
  });
  const [gameStartTime, setGameStartTime] = useState<number>(0);
  const [gridConfig, setGridConfig] = useState({ rows: 14, cols: 18 });
  const [islandCounts, setIslandCounts] = useState<Map<number, number>>(new Map());

  const startGame = useCallback((rows: number, cols: number) => {
    const newGrid = generateIslandGrid(rows, cols);
    setGrid(newGrid);
    setGridConfig({ rows, cols });
    setColorIdx(0);
    setSelectedIsland(-1);
    setIslandCounts(new Map());
    setGameStartTime(Date.now());
    setScreen('game');
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
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        if (grid.islands[r][c] >= 0) uniqueIslands.add(grid.islands[r][c]);
      }
    }
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

  const formatDuration = (s: number) => {
    if (s < 60) return `${s} сек`;
    return `${Math.floor(s / 60)} мин ${s % 60} сек`;
  };

  const totalGames = records.length;
  const completedGames = records.filter(r => r.completed).length;
  const totalCells = records.reduce((a, r) => a + r.cellsCounted, 0);
  const avgIslands = totalGames > 0
    ? Math.round(records.reduce((a, r) => a + r.islandsCount, 0) / totalGames)
    : 0;

  const uniqueIslandsInGame = grid ? new Set(
    grid.islands.flat().filter(id => id >= 0)
  ).size : 0;

  return (
    <div className="min-h-screen font-caveat" style={{ background: 'var(--paper)' }}>

      {/* ======================== ГЛАВНЫЙ ЭКРАН ======================== */}
      {screen === 'home' && (
        <div className="flex flex-col items-center justify-center min-h-screen px-4 py-12 animate-fade-in">
          <div className="text-center mb-10">
            <div className="text-7xl mb-2" style={{ filter: 'drop-shadow(2px 3px 0 rgba(44,31,20,0.2))' }}>🏝️</div>
            <h1 className="text-6xl font-bold mb-2" style={{ color: 'var(--ink)', fontFamily: 'Caveat Brush, Caveat, cursive' }}>
              Острова
            </h1>
            <p className="text-2xl" style={{ color: 'var(--ink-light)' }}>
              считай клетки на картах от руки
            </p>
          </div>

          <div className="flex flex-col gap-4 w-full max-w-sm">
            <div className="paper-card p-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">⚡</span>
                <div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Быстрая игра</div>
                  <div className="text-base" style={{ color: 'var(--ink-light)' }}>случайная карта</div>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button className="btn-ink text-lg flex-1" onClick={() => startGame(10, 14)}>
                  Маленькая
                </button>
                <button className="btn-ink text-lg flex-1" onClick={() => startGame(14, 18)}>
                  Средняя
                </button>
                <button className="btn-ink text-lg flex-1" onClick={() => startGame(18, 24)}>
                  Большая
                </button>
              </div>
            </div>

            <button
              className="paper-card p-5 text-left w-full animate-fade-in-up"
              style={{ animationDelay: '0.2s', cursor: 'pointer' }}
              onClick={() => setScreen('progress')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">📊</span>
                  <div>
                    <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Прогресс</div>
                    <div className="text-base" style={{ color: 'var(--ink-light)' }}>
                      {totalGames > 0 ? `${totalGames} партий сыграно` : 'ещё нет партий'}
                    </div>
                  </div>
                </div>
                <Icon name="ChevronRight" size={24} />
              </div>
            </button>

            <button
              className="paper-card p-5 text-left w-full animate-fade-in-up"
              style={{ animationDelay: '0.3s', cursor: 'pointer' }}
              onClick={() => setScreen('rules')}
            >
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

      {/* ======================== ИГРОВОЙ ЭКРАН ======================== */}
      {screen === 'game' && grid && (
        <div className="flex flex-col min-h-screen">
          <div className="flex items-center justify-between px-4 py-3 border-b-2" style={{ borderColor: 'var(--ink)', background: 'rgba(245,240,232,0.97)' }}>
            <button className="btn-outline-ink text-lg px-3 py-1" onClick={() => setScreen('home')}>
              ← Назад
            </button>
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                {islandCounts.size} / {uniqueIslandsInGame} островов
              </div>
              <div className="text-sm" style={{ color: 'var(--ink-light)' }}>
                {Array.from(islandCounts.values()).reduce((a, b) => a + b, 0)} клеток отмечено
              </div>
            </div>
            <button className="btn-ink text-lg px-3 py-1" onClick={saveAndFinish}>
              Готово ✓
            </button>
          </div>

          <div className="flex items-center gap-3 px-4 py-2 border-b flex-wrap" style={{ borderColor: 'rgba(44,31,20,0.2)', background: 'rgba(245,240,232,0.9)' }}>
            <span className="text-base" style={{ color: 'var(--ink-light)' }}>Инструмент:</span>
            <button
              className={`text-lg px-3 py-1 rounded transition-all ${tool === 'count' ? 'btn-ink' : 'btn-outline-ink'}`}
              onClick={() => setTool('count')}
            >
              🖊 Считать
            </button>
            <button
              className={`text-lg px-3 py-1 rounded transition-all ${tool === 'erase' ? 'btn-ink' : 'btn-outline-ink'}`}
              onClick={() => setTool('erase')}
            >
              ✕ Стереть
            </button>
            <button
              className="btn-outline-ink text-lg px-3 py-1 ml-auto"
              onClick={() => startGame(gridConfig.rows, gridConfig.cols)}
            >
              🔄 Новая карта
            </button>
          </div>

          <div className="px-4 py-2 text-sm" style={{ color: 'var(--ink-light)', background: 'rgba(168,204,215,0.2)' }}>
            Нажми на остров — он раскрасится целиком. Повторный клик — снять метку.
          </div>

          <div className="flex-1 overflow-auto p-4 flex justify-center items-start">
            <div className="paper-card p-3 inline-block animate-scale-in">
              <IslandGrid
                data={grid}
                onCellClick={handleCellClick}
                cellSize={26}
                showNumbers={false}
              />
            </div>
          </div>

          {islandCounts.size > 0 && (
            <div className="px-4 py-3 border-t-2 flex flex-wrap gap-2" style={{ borderColor: 'rgba(44,31,20,0.2)', background: 'rgba(245,240,232,0.97)' }}>
              {Array.from(islandCounts.entries()).map(([id, count], i) => (
                <div
                  key={id}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-lg font-bold"
                  style={{
                    background: COUNTING_COLORS[i % COUNTING_COLORS.length] + '40',
                    border: `2px solid ${COUNTING_COLORS[i % COUNTING_COLORS.length]}`,
                    color: 'var(--ink)',
                  }}
                >
                  <div className="w-3 h-3 rounded-sm" style={{ background: COUNTING_COLORS[i % COUNTING_COLORS.length] }} />
                  {count} кл.
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================== ПРАВИЛА ======================== */}
      {screen === 'rules' && (
        <div className="max-w-lg mx-auto px-4 py-8 animate-fade-in">
          <button className="btn-outline-ink text-xl mb-6" onClick={() => setScreen('home')}>
            ← Назад
          </button>

          <h2 className="text-5xl font-bold mb-8 text-center" style={{ color: 'var(--ink)', fontFamily: 'Caveat Brush, Caveat, cursive' }}>
            Как играть
          </h2>

          <div className="flex flex-col gap-5">
            {[
              { icon: '🗺️', title: 'Генерируй карту', text: 'Выбери размер карты — маленькая, средняя или большая. Появится случайная карта с островами, нарисованная как будто от руки.' },
              { icon: '🖊', title: 'Считай острова', text: 'Нажми на любой остров — он сразу раскрасится целиком и покажет, сколько клеток в нём. Каждый остров получит свой цвет.' },
              { icon: '🔢', title: 'Запоминай числа', text: 'Внизу экрана собирается список всех островов с количеством клеток. Это помогает сравнивать острова между собой.' },
              { icon: '✓', title: 'Заверши и сохрани', text: 'Когда отметишь все острова — жми "Готово". Результат сохранится в историю партий.' },
              { icon: '📊', title: 'Следи за прогрессом', text: 'В разделе "Прогресс" хранится вся история игр: сколько партий, сколько клеток посчитано, среднее число островов.' },
            ].map((rule, i) => (
              <div key={i} className="paper-card p-5 animate-fade-in-up" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="flex gap-4 items-start">
                  <div className="text-4xl flex-shrink-0 mt-0.5">{rule.icon}</div>
                  <div>
                    <div className="text-2xl font-bold mb-1" style={{ color: 'var(--ink)' }}>{rule.title}</div>
                    <div className="text-xl leading-snug" style={{ color: 'var(--ink-light)' }}>{rule.text}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <button className="btn-ink text-2xl px-8 py-3" onClick={() => startGame(14, 18)}>
              Начать игру ⚡
            </button>
          </div>
        </div>
      )}

      {/* ======================== ПРОГРЕСС ======================== */}
      {screen === 'progress' && (
        <div className="max-w-lg mx-auto px-4 py-8 animate-fade-in">
          <button className="btn-outline-ink text-xl mb-6" onClick={() => setScreen('home')}>
            ← Назад
          </button>

          <h2 className="text-5xl font-bold mb-8 text-center" style={{ color: 'var(--ink)', fontFamily: 'Caveat Brush, Caveat, cursive' }}>
            Прогресс
          </h2>

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

          <h3 className="text-3xl font-bold mb-4" style={{ color: 'var(--ink)' }}>История партий</h3>

          {records.length === 0 ? (
            <div className="paper-card p-8 text-center">
              <div className="text-5xl mb-3">🗺️</div>
              <div className="text-2xl" style={{ color: 'var(--ink-light)' }}>
                Ещё нет сыгранных партий.<br />Начни первую игру!
              </div>
              <button className="btn-ink text-xl mt-4 px-6 py-2" onClick={() => startGame(14, 18)}>
                Играть
              </button>
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
                    Карта {r.gridSize} · {r.islandsCount} островов · {r.cellsCounted} клеток
                  </div>
                  <div className="text-base" style={{ color: 'var(--ink-light)' }}>
                    Время: {formatDuration(r.duration)}
                  </div>
                </div>
              ))}

              <button
                className="btn-outline-ink text-lg mt-2 self-center"
                onClick={() => {
                  if (confirm('Очистить всю историю?')) {
                    setRecords([]);
                    localStorage.removeItem('island-records');
                  }
                }}
              >
                Очистить историю
              </button>
            </div>
          )}

          <div className="mt-8 text-center">
            <button className="btn-ink text-2xl px-8 py-3" onClick={() => startGame(14, 18)}>
              Новая игра ⚡
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
