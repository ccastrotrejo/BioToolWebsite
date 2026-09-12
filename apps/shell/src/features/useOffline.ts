import { useEffect, useState } from 'react';

export function useOffline() {
  const [online, setOnline] = useState(navigator.onLine);
  const [state, setState] = useState<'preparing' | 'ready' | 'unavailable'>('preparing');
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    let active = true;
    let timeout: number | undefined;
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
        .then(() => Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_resolve, reject) => {
            timeout = window.setTimeout(() => reject(new Error('Offline app installation timed out. Reload while online to retry.')), 45_000);
          }),
        ]))
        .then(() => { if (active) setState('ready'); })
        .catch((error: unknown) => {
          console.error('BioTool offline setup failed', error);
          if (active) setState('unavailable');
        }).finally(() => window.clearTimeout(timeout));
    } else setState('unavailable');
    return () => {
      active = false;
      window.clearTimeout(timeout);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return { online, state };
}
