/**
 * Modèle du Rover.
 * Contient l'état du rover, la gestion des vitesses,
 * des boutons, de l'arrêt et des distances.
 */
export default class RoverModel {
  // --- Vitesse ---
  speedMode = 2; // Modes de vitesse : 1 = 30%, 2 = 60%, 3 = 100%
  speedFactors = { 1: 0.30, 2: 0.60, 3: 1.00 };

  speedLock = false;      // Verrouillage automatique de la vitesse
  prevSpeedMode = 2;      // Mode de vitesse précédent
  stopActive = false;     // État du STOP

  // --- Capteurs ---
  distance = null;        // Distance mesurée par le capteur
  battery = null;         // Batterie (non utilisé pour l'instant)

  // --- Seuils de distance ---
  minDistanceBlock = 300; // mm → arrêt complet
  minDistanceSlow = 1000; // mm → réduction de vitesse

  // --- État des boutons pour debounce ---
  lastBtnA = false;
  lastBtnY = false;
  lastBtnX = false;

  /**
   * Limite une valeur entre min et max.
   */
  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /**
   * Applique une zone morte aux axes du joystick.
   */
  deadzone(v, dz = 0.12) {
    return (v === undefined || Math.abs(v) < dz) ? 0 : v;
  }

  /**
   * Met à jour la distance mesurée.
   */
  updateDistance(distance) {
    this.distance = distance;
  }

  /**
   * Active ou désactive le STOP avec le bouton X.
   */
  toggleStop(btnX) {
    if (btnX && !this.lastBtnX) this.stopActive = !this.stopActive;
    this.lastBtnX = btnX;
  }

  /**
   * Met à jour le verrouillage automatique de la vitesse
   * en fonction de la distance mesurée.
   */
  updateSpeedLock() {
    if (this.distance === null) return;

    if (this.distance < this.minDistanceSlow && this.distance >= this.minDistanceBlock) {
      if (!this.speedLock) {
        this.prevSpeedMode = this.speedMode;
        this.speedLock = true;
      }
      this.speedMode = 1;
    } else if (this.distance >= this.minDistanceSlow && this.speedLock) {
      this.speedMode = this.prevSpeedMode;
      this.speedLock = false;
    }
  }

  /**
   * Gère les boutons A et Y pour changer manuellement la vitesse,
   * sauf si le verrouillage automatique est actif.
   */
  handleSpeedButtons(btnA, btnY) {
    if (!this.speedLock) {
      if (btnY && !this.lastBtnY) this.speedMode = Math.min(3, this.speedMode + 1);
      if (btnA && !this.lastBtnA) this.speedMode = Math.max(1, this.speedMode - 1);
    }
    this.lastBtnA = btnA;
    this.lastBtnY = btnY;
  }

  /**
   * Calcule la vitesse des moteurs gauche et droite
   * en fonction de la commande forward/steer et du facteur de vitesse.
   * Applique également le STOP si actif.
   */
  computeMotors(forward, steer) {
    const factor = this.speedFactors[this.speedMode];

    let left = this.clamp((forward + steer) * factor, -1, 1);
    let right = this.clamp((forward - steer) * factor, -1, 1);

    if (this.stopActive) {
      left = 0;
      right = 0;
    }

    return { left, right, factor };
  }
}
