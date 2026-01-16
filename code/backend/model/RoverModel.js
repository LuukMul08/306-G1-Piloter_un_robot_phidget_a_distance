import * as phidget22 from 'phidget22';

/**
 * Modèle du Rover côté serveur.
 * Gère les moteurs et le capteur de distance.
 */
export default class RoverModel {
  motorLeft;
  motorRight;
  distanceSensor;
  distanceAvailable = false;
  lastDistance = 100; // Distance initiale très grande pour sécurité (cm)

  constructor() {}

  /**
   * Initialise les moteurs gauche et droit.
   * @param {number} serialLeft - Numéro de série du moteur gauche
   * @param {number} serialRight - Numéro de série du moteur droit
   * @param {number} channelLeft - Canal du moteur gauche (par défaut 0)
   * @param {number} channelRight - Canal du moteur droit (par défaut 1)
   */
  async initMotors(channelLeft, channelRight) {
    this.motorLeft = new phidget22.DCMotor();
    this.motorLeft.setIsRemote(true);
    this.motorLeft.setChannel(channelLeft);

    this.motorRight = new phidget22.DCMotor();
    this.motorRight.setIsRemote(true);
    this.motorRight.setChannel(channelRight);

    // --- Ouverture des moteurs avec timeout ---
    await this.motorLeft.open(10000);
    await this.motorRight.open(10000);
  }

  /**
   * Initialise le capteur de distance.
   * @param {number} channel - Canal du capteur (par défaut 0)
   */
  async initDistanceSensor(channel) {
    try {
      this.distanceSensor = new phidget22.DistanceSensor();
      this.distanceSensor.setIsRemote(true);
      this.distanceSensor.setChannel(channel);

      // --- Met à jour la distance à chaque changement ---
      this.distanceSensor.onDistanceChange = (distance) => {
        this.lastDistance = distance; // Distance en cm
      };

      await this.distanceSensor.open(5000);
      this.distanceAvailable = true;
    } catch {
      this.distanceAvailable = false;
      console.warn('⚠️ Capteur de distance optionnel : capteur non détecté');
    }
  }

  /**
   * Définit les vitesses des moteurs.
   * Applique une zone morte (deadzone) et limite la vitesse entre -1 et 1.
   * @param {number} left - Vitesse moteur gauche
   * @param {number} right - Vitesse moteur droit
   */
  setMotorSpeeds(left, right) {
    if (!this.motorLeft || !this.motorRight) {
      console.warn("⚠️ Moteurs non initialisés – commande ignorée");
      return;
    }

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const deadzone = 0.15; // Ignorer les petites valeurs pour éviter les mouvements involontaires
    const maxSpeed = 1;

    const speedLeft = Math.abs(left) > deadzone ? clamp(left * maxSpeed, -1, 1) : 0;
    const speedRight = Math.abs(right) > deadzone ? clamp(right * maxSpeed, -1, 1) : 0;

    this.motorLeft.setTargetVelocity(speedLeft);
    this.motorRight.setTargetVelocity(speedRight);
  }

  /**
   * Ferme les moteurs et le capteur de distance.
   * À utiliser lors de l'arrêt du serveur pour libérer les ressources.
   */
  async shutdown() {
    try { await this.motorLeft.close(); } catch {}
    try { await this.motorRight.close(); } catch {}
    if (this.distanceAvailable) { try { await this.distanceSensor.close(); } catch {} }
  }
}
