/**
 * Filtre de Kalman simple pour lisser une position GPS (lat/lng) et réduire le
 * jitter. Modèle « marche aléatoire » : on suppose que le véhicule peut bouger
 * d'une vitesse `q` (m/s) entre deux mesures ; la variance de mesure provient de
 * la précision GPS rapportée. Adapté de l'approche KalmanLatLong (Android).
 */
import type { LatLng } from '../types';

export class GeoKalman {
  /** Bruit de process (incertitude de déplacement), en m/s. */
  private readonly q: number;
  private lat = 0;
  private lng = 0;
  private variance = -1; // < 0 = non initialisé (P, en m²)
  private timestamp = 0;

  constructor(processNoiseMetersPerSec = 3) {
    this.q = processNoiseMetersPerSec;
  }

  /** Réinitialise le filtre. */
  reset(): void {
    this.variance = -1;
  }

  /**
   * Intègre une nouvelle mesure et renvoie la position lissée.
   * @param accuracy précision horizontale (m) ; sert d'écart-type de mesure.
   */
  process(lat: number, lng: number, accuracy: number, timestamp: number): LatLng {
    const acc = Math.max(accuracy, 1);
    if (this.variance < 0) {
      // Première mesure : on initialise l'état.
      this.lat = lat;
      this.lng = lng;
      this.variance = acc * acc;
      this.timestamp = timestamp;
      return { lat, lng };
    }

    // Prédiction : la variance croît avec le temps écoulé.
    const dt = (timestamp - this.timestamp) / 1000;
    if (dt > 0) {
      this.variance += dt * this.q * this.q;
      this.timestamp = timestamp;
    }

    // Mise à jour : gain de Kalman pondéré par la précision de la mesure.
    const k = this.variance / (this.variance + acc * acc);
    this.lat += k * (lat - this.lat);
    this.lng += k * (lng - this.lng);
    this.variance *= 1 - k;

    return { lat: this.lat, lng: this.lng };
  }
}
