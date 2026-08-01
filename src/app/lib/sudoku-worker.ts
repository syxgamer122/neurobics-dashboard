// Web Worker: generate a unique-solution sudoku off the main thread.
import { generateSudoku } from "./sudoku-gen";

export type SudokuWorkerRequest = { clues: number; requestId: number };
export type SudokuWorkerResponse = {
  requestId: number;
  puzzle: (number | null)[][];
  solution: number[][];
};

self.onmessage = (ev: MessageEvent<SudokuWorkerRequest>) => {
  const { clues, requestId } = ev.data;
  const result = generateSudoku(clues);
  const response: SudokuWorkerResponse = {
    requestId,
    puzzle: result.puzzle,
    solution: result.solution,
  };
  (self as DedicatedWorkerGlobalScope).postMessage(response);
};
