import { useEffect, useRef } from "react";

export function useGameLifecycle(opts: {
  isActive: () => boolean;
  onLeave: (reason: "hidden" | "pagehide" | "blur") => void;
  onReturn?: () => void;
}) {
  const ref = useRef(opts);
  ref.current = opts;
  
  useEffect(() => {
    const leave = (r: "hidden" | "pagehide" | "blur") => {
      if (ref.current.isActive()) ref.current.onLeave(r);
    };
    
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        leave("hidden");
      } else {
        ref.current.onReturn?.();
      }
    };
    
    const onHide = () => leave("pagehide");
    const onBlur = () => leave("blur");
    
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("blur", onBlur);
    
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
