export default class RoverModel {
  // Mode de vitesse actuel : 1=Bas, 2=Normal, 3=Haut
  speedMode = 2;
  // Facteurs multiplicateurs pour chaque mode de vitesse
  speedFactors = { 1: 0.30, 2: 0.60, 3: 1.00 };

  speedLock = false;       // Indique si la vitesse est verrouillée (réduction automatique)
  prevSpeedMode = 2;       // Mode de vitesse précédent pour restaurer après déverrouillage
  stopActive = false;      // Indique si le mode STOP est actif

  distance = null;         // Distance actuelle détectée (cm)
  battery = null;          // Niveau de batterie (optionnel)

  // Seuils de distance pour le contrôle automatique
  minDistanceBlock = 300;  // Distance minimale pour blocage complet (cm)
  minDistanceSlow = 1000;  // Distance minimale pour ralentir (cm)

  // Suivi de l'état précédent des boutons pour détecter les pressions
  lastBtnA = false;
  lastBtnY = false;
  lastBtnX = false;

  /**
   * Limite une valeur entre min et max
   */
  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /**
   * Applique une zone morte (deadzone) pour éviter les petites valeurs parasites
   */
  deadzone(v, dz = 0.12) {
    return (v === undefined || Math.abs(v) < dz) ? 0 : v;
  }

  /**
   * Met à jour la distance actuelle
   */
  updateDistance(distance) {
    this.distance = distance;
  }

  /**
   * Basculer le mode STOP lors de l'appui sur le bouton X
   */
  toggleStop(btnX) {
    if (btnX && !this.lastBtnX) this.stopActive = !this.stopActive;
    this.lastBtnX = btnX;
  }

  /**
   * Met à jour le verrouillage automatique de la vitesse selon la distance
   */
  updateSpeedLock() {
    if (this.distance === null) return;

    // Si distance < seuil lent mais >= seuil blocage, vitesse réduite
    if (this.distance < this.minDistanceSlow && this.distance >= this.minDistanceBlock) {
      if (!this.speedLock) {
        this.prevSpeedMode = this.speedMode;
        this.speedLock = true;
      }
      this.speedMode = 1; // Mode lent
    } 
    // Restaurer la vitesse précédente si la distance est suffisante
    else if (this.distance >= this.minDistanceSlow && this.speedLock) {
      this.speedMode = this.prevSpeedMode;
      this.speedLock = false;
    }
  }

  /**
   * Gère les boutons de changement de vitesse (A et Y)
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
   * Calcule les vitesses des moteurs gauche et droit
   * Applique le facteur de vitesse et le mode STOP si activé
   */
  computeMotors(forward, steer) {
    const factor = this.speedFactors[this.speedMode];

    let left = this.clamp((forward + steer) * factor, -1, 1);
    let right = this.clamp((forward - steer) * factor, -1, 1);

    // STOP actif → arrête les moteurs
    if (this.stopActive) {
      left = 0;
      right = 0;
    }

    return { left, right, factor };
  }
}
