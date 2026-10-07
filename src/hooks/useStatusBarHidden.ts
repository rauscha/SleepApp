import { useEffect, useState } from 'react';
import { isStatusBarHidden } from '../utils/fullscreen';

/** Tracks whether Android's status bar is hidden, so UI standing in for it
 *  shows only when the real one is gone. The display mode can flip while
 *  the app runs (Chrome updating the WebAPK, a tab entering fullscreen). */
export function useStatusBarHidden(): boolean {
  const [hidden, setHidden] = useState(isStatusBarHidden);

  useEffect(() => {
    const update = () => setHidden(isStatusBarHidden());
    const mq = window.matchMedia?.('(display-mode: fullscreen)');
    mq?.addEventListener?.('change', update);
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      mq?.removeEventListener?.('change', update);
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return hidden;
}
