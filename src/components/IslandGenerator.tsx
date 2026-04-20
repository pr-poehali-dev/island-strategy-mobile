import { useEffect, useRef, useCallback } from 'react';

export interface IslandCell {
  row: number;
  col: number;
  type: 'water' | 'island' | 'counted';
  color?: string;
}

export interface GeneratedIsland {
  cells: IslandCell[][];
  islands: number[][];
  rows: number;
  cols: number;
  totalIslandCells: number;
}

const ISLAND_COLORS = [
  '#7ab87a', '#8fc98f', '#a0d4a0',  // зелёный
  '#d4b896', '#c9a87a', '#e0c8a0',  // песок
  '#d4887a', '#c87a6a', '#e09a8a',  // розовый
  '#9a7ab8', '#8a6aaa', '#b090cc',  // фиолетовый
  '#e8a855', '#d4984a', '#f0b870',  // оранжевый
];

// BFS flood fill to find connected island regions
function findIslands(grid: IslandCell[][]): number[][] {
  const rows = grid.length;
  const cols = grid[0].length;
  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const islandMap = Array.from({ length: rows }, () => new Array(cols).fill(-1));
  let islandIndex = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].type === 'island' && !visited[r][c]) {
        // BFS
        const queue: [number, number][] = [[r, c]];
        visited[r][c] = true;
        const currentIsland: [number, number][] = [];

        while (queue.length > 0) {
          const [cr, cc] = queue.shift()!;
          currentIsland.push([cr, cc]);
          islandMap[cr][cc] = islandIndex;

          for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nr = cr + dr;
            const nc = cc + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
                !visited[nr][nc] && grid[nr][nc].type === 'island') {
              visited[nr][nc] = true;
              queue.push([nr, nc]);
            }
          }
        }
        islandIndex++;
      }
    }
  }

  return islandMap;
}

export function generateIslandGrid(rows: number, cols: number): GeneratedIsland {
  // Случайная генерация островов через шум
  const grid: IslandCell[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({
      row: r, col: c, type: 'water' as const
    }))
  );

  // Генерируем 3-6 "ядер" островов
  const numIslands = Math.floor(Math.random() * 4) + 3;
  const seeds: [number, number][] = [];

  for (let i = 0; i < numIslands; i++) {
    const r = Math.floor(Math.random() * (rows - 4)) + 2;
    const c = Math.floor(Math.random() * (cols - 4)) + 2;
    seeds.push([r, c]);
  }

  // Расширяем каждый остров случайным образом
  for (const [seedR, seedC] of seeds) {
    const islandSize = Math.floor(Math.random() * 18) + 8; // 8-25 клеток
    const frontier: [number, number][] = [[seedR, seedC]];
    let added = 0;

    while (frontier.length > 0 && added < islandSize) {
      const idx = Math.floor(Math.random() * frontier.length);
      const [r, c] = frontier.splice(idx, 1)[0];

      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      if (grid[r][c].type === 'island') continue;

      grid[r][c] = { row: r, col: c, type: 'island' };
      added++;

      // Добавляем соседей с некоторой вероятностью (неровные края)
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
        if (Math.random() < 0.65) {
          frontier.push([r + dr, c + dc]);
        }
      }
    }
  }

  const islands = findIslands(grid);
  const totalIslandCells = grid.flat().filter(c => c.type === 'island').length;

  return { cells: grid, islands, rows, cols, totalIslandCells };
}

interface IslandGridProps {
  data: GeneratedIsland;
  onCellClick?: (row: number, col: number) => void;
  cellSize?: number;
  showNumbers?: boolean;
}

export function IslandGrid({ data, onCellClick, cellSize = 22, showNumbers = false }: IslandGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { cells, rows, cols } = data;
    const w = cols * cellSize;
    const h = rows * cellSize;
    canvas.width = w;
    canvas.height = h;

    // Фон — вода
    ctx.fillStyle = '#c8dfe8';
    ctx.fillRect(0, 0, w, h);

    // Лёгкая текстура воды — волнистые линии
    ctx.strokeStyle = 'rgba(100, 160, 185, 0.4)';
    ctx.lineWidth = 0.8;
    for (let y = 6; y < h; y += 9) {
      ctx.beginPath();
      for (let x = 0; x < w; x += 12) {
        const wobble = Math.sin((x + y * 0.7) * 0.3) * 1.5;
        if (x === 0) ctx.moveTo(x, y + wobble);
        else ctx.lineTo(x, y + wobble);
      }
      ctx.stroke();
    }

    // Собираем острова по индексам
    const islandGroups: Map<number, [number, number][]> = new Map();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = data.islands[r][c];
        if (id >= 0) {
          if (!islandGroups.has(id)) islandGroups.set(id, []);
          islandGroups.get(id)!.push([r, c]);
        }
      }
    }

    // Цвета островов
    const islandColorMap: Map<number, string> = new Map();
    const baseColors = ['#8fc88a', '#d4c090', '#c87a6a', '#9a85c0', '#e0b060', '#7ab8b0'];
    let colorIdx = 0;
    islandGroups.forEach((_, id) => {
      islandColorMap.set(id, baseColors[colorIdx % baseColors.length]);
      colorIdx++;
    });

    // Рисуем острова
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = cells[r][c];
        if (cell.type === 'water') continue;

        const islandId = data.islands[r][c];
        const x = c * cellSize;
        const y = r * cellSize;

        if (cell.type === 'counted' && cell.color) {
          ctx.fillStyle = cell.color;
        } else {
          ctx.fillStyle = islandColorMap.get(islandId) || '#8fc88a';
        }

        // Немного смещаем края для живости
        const jitter = 0.8;
        ctx.fillRect(
          x + (Math.random() < 0.3 ? (Math.random() - 0.5) * jitter : 0),
          y + (Math.random() < 0.3 ? (Math.random() - 0.5) * jitter : 0),
          cellSize + 0.5,
          cellSize + 0.5
        );
      }
    }

    // Рисуем "рукописные" контуры островов
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r][c].type === 'water') continue;
        const x = c * cellSize;
        const y = r * cellSize;

        // Проверяем каждую сторону
        const neighbors = [
          { dr: -1, dc: 0, x1: x, y1: y, x2: x + cellSize, y2: y },           // верх
          { dr: 1, dc: 0, x1: x, y1: y + cellSize, x2: x + cellSize, y2: y + cellSize }, // низ
          { dr: 0, dc: -1, x1: x, y1: y, x2: x, y2: y + cellSize },             // лево
          { dr: 0, dc: 1, x1: x + cellSize, y1: y, x2: x + cellSize, y2: y + cellSize }, // право
        ];

        for (const { dr, dc, x1, y1, x2, y2 } of neighbors) {
          const nr = r + dr;
          const nc = c + dc;
          const isEdge = nr < 0 || nr >= rows || nc < 0 || nc >= cols || cells[nr][nc].type === 'water';

          if (isEdge) {
            // Рукописная линия с лёгким дрожанием
            ctx.beginPath();
            ctx.strokeStyle = '#2c1f14';
            ctx.lineWidth = 1.6 + Math.random() * 0.6;
            const wobble1 = (Math.random() - 0.5) * 1.2;
            const wobble2 = (Math.random() - 0.5) * 1.2;
            ctx.moveTo(x1 + wobble1, y1 + wobble1);
            ctx.lineTo(x2 + wobble2, y2 + wobble2);
            ctx.stroke();
          }
        }
      }
    }

    // Сетка
    ctx.strokeStyle = 'rgba(44, 31, 20, 0.12)';
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cellSize);
      ctx.lineTo(w, r * cellSize);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cellSize, 0);
      ctx.lineTo(c * cellSize, h);
      ctx.stroke();
    }

    // Числа на подсчитанных клетках
    if (showNumbers) {
      ctx.font = `bold ${cellSize * 0.55}px Caveat, cursive`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const counted = new Map<number, number>();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (cells[r][c].type === 'counted') {
            const id = data.islands[r][c];
            counted.set(id, (counted.get(id) || 0) + 1);
          }
        }
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (cells[r][c].type === 'counted') {
            const id = data.islands[r][c];
            const num = counted.get(id) || 0;
            const x = c * cellSize + cellSize / 2;
            const y = r * cellSize + cellSize / 2;
            ctx.fillStyle = 'rgba(44, 31, 20, 0.85)';
            ctx.fillText(String(num), x, y);
          }
        }
      }
    }

  }, [data, cellSize, showNumbers]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onCellClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    if (row >= 0 && row < data.rows && col >= 0 && col < data.cols) {
      onCellClick(row, col);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{
        maxWidth: '100%',
        height: 'auto',
        cursor: onCellClick ? 'crosshair' : 'default',
        imageRendering: 'pixelated',
        borderRadius: 4,
      }}
    />
  );
}

export default IslandGrid;
