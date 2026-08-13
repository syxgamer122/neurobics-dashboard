import { useEffect, useRef } from "react";

export function useCanvasLoop(
  callback: (deltaTime: number, frameCount: number) => void,
  isRunning: boolean,
) {
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();
  const frameCountRef = useRef(0);

  useEffect(() => {
    const animate = (time: number) => {
      if (previousTimeRef.current !== undefined) {
        const deltaTime = time - previousTimeRef.current;
        callback(deltaTime, frameCountRef.current);
        frameCountRef.current++;
      }
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    if (isRunning) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      previousTimeRef.current = undefined; // Reset time so resumption doesn't jump
    }

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [callback, isRunning]);
}
