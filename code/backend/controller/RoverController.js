import * as phidget22 from 'phidget22';

/**
 * Modèle du Rover côté serveur.
 * Gère les moteurs et le capteur de distance.
 */
export default class RoverModel {
  motorLeft = null;
  motorRight = null;
  distanceSensor = null;
  distanceAvailable = false;
  lastDistance = 100; // Distance initiale très éloignée (cm)
  ready = false; // ⚠️ Indique si les moteurs sont prêts

  constructor() { }

  /**
   * Initialise les moteurs gauche et droit.
   * @param {number} serialLeft - Numéro de série moteur gauche
   * @param {number} serialRight - Numéro de série moteur droit
   * @param {number} channelLeft - Canal moteur gauche (par défaut 0)
   * @param {number} channelRight - Canal moteur droit (par défaut 1)
   */
  async initMotors(serialLeft, serialRight, channelLeft = 0, channelRight = 1) {
    try {
      this.motorLeft = new phidget22.DCMotor();
      this.motorLeft.setIsRemote(true);
      this.motorLeft.setDeviceSerialNumber(serialLeft);
      this.motorLeft.setChannel(channelLeft);

      this.motorRight = new phidget22.DCMotor();
      this.motorRight.setIsRemote(true);
      this.motorRight.setDeviceSerialNumber(serialRight);
      this.motorRight.setChannel(channelRight);

      await this.motorLeft.open(10000);
      await this.motorRight.open(10000);

      this.ready = true;
      console.log('✅ Moteurs initialisés');
    } catch (err) {
      this.ready = false;
      console.error('❌ Erreur lors de l’initialisation des moteurs :', err.message);
    }
  }

  /**
   * Initialise le capteur de distance.
   * @param {number} serial - Numéro de série du capteur
   * @param {number} channel - Canal du capteur (par défaut 0)
   */
  async initDistanceSensor(serial, channel = 0) {
    try {
      this.distanceSensor = new phidget22.DistanceSensor();
      this.distanceSensor.setIsRemote(true);
      this.distanceSensor.setDeviceSerialNumber(serial);
      this.distanceSensor.setChannel(channel);

      // --- Mise à jour de la distance à chaque changement ---
      this.distanceSensor.onDistanceChange = (distance) => {
        this.lastDistance = distance; // cm
      };

      await this.distanceSensor.open(5000);
      this.distanceAvailable = true;
      console.log('✅ Capteur de distance initialisé');
    } catch (err) {
      this.distanceAvailable = false;
      console.warn('⚠️ Capteur de distance optionnel non trouvé');
    }
  }

  /**
   * Définit les vitesses des moteurs.
   * Applique une deadzone et limite la vitesse entre -1 et 1.
   * Ne fait rien si les moteurs ne sont pas prêts.
   * @param {number} left - Vitesse moteur gauche
   * @param {number} right - Vitesse moteur droit
   */
  setMotorSpeeds(left, right) {
    if (!this.ready || !this.motorLeft || !this.motorRight) {
      console.warn('⚠️ Motors not ready, command ignored');
      return;
    }

    try {
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      const deadzone = 0.15;
      const maxSpeed = 1;

      const speedLeft = Math.abs(left) > deadzone ? clamp(left * maxSpeed, -1, 1) : 0;
      const speedRight = Math.abs(right) > deadzone ? clamp(right * maxSpeed, -1, 1) : 0;

      this.motorLeft.setTargetVelocity(speedLeft);
      this.motorRight.setTargetVelocity(speedRight);
    } catch (err) {
      console.error('❌ Impossible de définir la vitesse des moteurs :', err.message);
    }
  }

  /**
   * Ferme les moteurs et le capteur de distance.
   * Utilisé lors de l'arrêt du serveur.
   */
  async shutdown() {
    this.ready = false;

    try { if (this.motorLeft) await this.motorLeft.close(); } catch { }
    try { if (this.motorRight) await this.motorRight.close(); } catch { }
    if (this.distanceAvailable && this.distanceSensor) {
      try { await this.distanceSensor.close(); } catch { }
    }

    console.log('🛑 Matériel fermé proprement');
  }
}
