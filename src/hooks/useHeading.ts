import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { angleDiff } from '../lib/geo';

/**
 * Boussole de l'appareil (cap instantané, même à l'arrêt). Sur iOS, utilise
 * `webkitCompassHeading` ; ailleurs `alpha` absolu. Lissage léger pour limiter
 * le tremblement. L'autorisation iOS doit être demandée via requestCompass()
 * dans un geste utilisateur (voir PermissionGate).
 */
export function useHeading(): void {
  const setCompass = useAppStore((s) => s.setCompass);

  useEffect(() => {
    let smoothed: number | null = null;
    const handler = (e: DeviceOrientationEvent) => {
      const ev = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      let h: number | null = null;
      if (typeof ev.webkitCompassHeading === 'number' && !Number.isNaN(ev.webkitCompassHeading)) {
        h = ev.webkitCompassHeading;
      } else if (e.absolute && typeof e.alpha === 'number') {
        h = (360 - e.alpha) % 360;
      }
      if (h === null) return;
      smoothed = smoothed === null ? h : (smoothed + angleDiff(smoothed, h) * 0.25 + 360) % 360;
      setCompass(smoothed);
    };
    window.addEventListener('deviceorientation', handler, true);
    window.addEventListener('deviceorientationabsolute', handler, true);
    return () => {
      window.removeEventListener('deviceorientation', handler, true);
      window.removeEventListener('deviceorientationabsolute', handler, true);
    };
  }, [setCompass]);
}

/** Demande l'autorisation boussole (iOS 13+). À appeler dans un geste utilisateur. */
export async function requestCompassPermission(): Promise<void> {
  const DOE = window.DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  if (DOE && typeof DOE.requestPermission === 'function') {
    try {
      await DOE.requestPermission();
    } catch {
      /* non bloquant */
    }
  }
}
