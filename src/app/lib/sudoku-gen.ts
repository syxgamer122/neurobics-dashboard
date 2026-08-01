// Shared sudoku generator — single source for worker + main-thread fallback.
// Worker imports these; App must NOT redefine countSolutions/generateSudoku.

export const shuffleArray = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const countSolutions = (grid: (number | null)[][], limit = 2): number => {
  const g = grid.map((r) => [...r]);
  let count = 0;

  const ok = (r: number, c: number, n: number) => {
    for (let i = 0; i < 9; i++) {
      if (g[r][i] === n || g[i][c] === n) return false;
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (g[br + i][bc + j] === n) return false;
      }
    }
    return true;
  };

  const solve = (): void => {
    let r = -1;
    let c = -1;
    outer: for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        if (g[i][j] == null || g[i][j] === 0) {
          r = i;
          c = j;
          break outer;
        }
      }
    }
    if (r === -1) {
      count++;
      return;
    }
    for (let n = 1; n <= 9; n++) {
      if (!ok(r, c, n)) continue;
      g[r][c] = n;
      solve();
      g[r][c] = null;
      if (count >= limit) return;
    }
  };

  solve();
  return count;
};

export function generateSudoku(clues = 34): {
  puzzle: (number | null)[][];
  solution: number[][];
} {
  const base: number[][] = [
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    [4, 5, 6, 7, 8, 9, 1, 2, 3],
    [7, 8, 9, 1, 2, 3, 4, 5, 6],
    [2, 3, 4, 5, 6, 7, 8, 9, 1],
    [5, 6, 7, 8, 9, 1, 2, 3, 4],
    [8, 9, 1, 2, 3, 4, 5, 6, 7],
    [3, 4, 5, 6, 7, 8, 9, 1, 2],
    [6, 7, 8, 9, 1, 2, 3, 4, 5],
    [9, 1, 2, 3, 4, 5, 6, 7, 8],
  ];

  const numMap = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  let grid = base.map((row) => row.map((n) => numMap[n - 1]));

  for (let band = 0; band < 3; band++) {
    const perm = shuffleArray([0, 1, 2]);
    const rows = [
      grid[band * 3 + perm[0]],
      grid[band * 3 + perm[1]],
      grid[band * 3 + perm[2]],
    ];
    grid[band * 3] = rows[0];
    grid[band * 3 + 1] = rows[1];
    grid[band * 3 + 2] = rows[2];
  }

  for (let stack = 0; stack < 3; stack++) {
    const perm = shuffleArray([0, 1, 2]);
    grid = grid.map((row) => {
      const newRow = [...row];
      newRow[stack * 3] = row[stack * 3 + perm[0]];
      newRow[stack * 3 + 1] = row[stack * 3 + perm[1]];
      newRow[stack * 3 + 2] = row[stack * 3 + perm[2]];
      return newRow;
    });
  }

  const bandPerm = shuffleArray([0, 1, 2]);
  const shuffledGrid: number[][] = [];
  for (const b of bandPerm) {
    shuffledGrid.push(grid[b * 3], grid[b * 3 + 1], grid[b * 3 + 2]);
  }

  const solution = shuffledGrid.map((r) => [...r]);
  const puzzle: (number | null)[][] = solution.map((r) => [...r] as (number | null)[]);
  let remaining = 81;

  for (const pos of shuffleArray(Array.from({ length: 81 }, (_, i) => i))) {
    if (remaining <= clues) break;
    const r = Math.floor(pos / 9);
    const c = pos % 9;
    const backup = puzzle[r][c];
    if (backup == null) continue;
    puzzle[r][c] = null;
    if (countSolutions(puzzle) === 1) remaining--;
    else puzzle[r][c] = backup;
  }
  return { puzzle, solution };
}
