"use client";

import { useEffect, useRef } from "react";

export function useSheetHistory(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    history.pushState({ funaabSheet: true }, "");
    pushedRef.current = true;

    const onPop = () => {
      pushedRef.current = false;
      onCloseRef.current();
    };

    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [open]);

  function requestClose() {
    if (pushedRef.current) {
      pushedRef.current = false;
      history.back();
    } else {
      onCloseRef.current();
    }
  }

  return { requestClose };
}
