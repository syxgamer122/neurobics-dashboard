import type React from "react";
import { useMemo } from "react";

export type InputType = "touch" | "mouse" | "pen" | "key";

/**
 * Returns a factory function that generates props to handle press events accurately.
 * Call this hook ONCE at the top of your component: const press = usePress();
 * Then use the returned function in JSX: {...press((type, ts) => handlePress(type, ts))}
 */
export function usePress() {
  return useMemo(() => {
    return (onPress: (type: InputType, ts: number) => void) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (e.target instanceof HTMLElement && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) {
            e.preventDefault(); 
        }
        onPress((e.pointerType || "mouse") as InputType, e.timeStamp);
      },
      onClick: (e: React.MouseEvent) => {
        if (e.target instanceof HTMLElement && (e.target.tagName === 'BUTTON' || e.target.closest('button'))) {
            e.preventDefault();
        }
      },
    });
  }, []);
}
