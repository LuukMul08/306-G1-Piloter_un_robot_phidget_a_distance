/**
 * Vue du Rover.
 * Gère l'affichage des informations sur le front-end
 * telles que l'état de la manette, la vitesse, le STOP, les sticks et la distance.
 */
export default class RoverView {
  // --- Élément DOM pour le statut général ---
  status = document.getElementById("status");

  /**
   * Met à jour le statut général affiché en haut.
   * @param {string} text - Le texte à afficher.
   */
  updateStatus(text) {
    this.status.textContent = text;
  }

  /**
   * Met à jour l'interface utilisateur avec l'état actuel du rover.
   * @param {Object} param0 - Contient tous les états du rover.
   * @param {number} param0.speedMode - Mode de vitesse actuel.
   * @param {number} param0.factor - Facteur de vitesse.
   * @param {boolean} param0.speedLock - Verrouillage automatique de la vitesse.
   * @param {boolean} param0.stopActive - État du STOP.
   * @param {number} param0.forward - Valeur d'avance/arrière.
   * @param {number} param0.steer - Valeur de direction.
   * @param {string} param0.buttons - État des boutons sous forme de texte.
   * @param {number|null} param0.distance - Distance mesurée par le capteur.
   */
  updateUI({ speedMode, factor, speedLock, stopActive, forward, steer, buttons, distance }) {
    // --- Mode de vitesse ---
    document.getElementById("speedMode").textContent =
      `Vitesse: ${speedMode} (${Math.round(factor * 100)}%)${speedLock ? " 🔒" : ""}`;

    // --- État du STOP ---
    document.getElementById("stopState").textContent =
      `STOP: ${stopActive ? "ON" : "OFF"}`;

    // --- Valeurs des sticks (Drive / Steer) ---
    document.getElementById("stickValues").textContent =
      `Avance: ${forward.toFixed(2)} | Direction: ${steer.toFixed(2)}`;

    // --- Boutons ---
    document.getElementById("buttons").textContent = buttons;

    // --- Distance mesurée ---
    document.getElementById("distance").textContent =
      distance !== null ? `Distance: ${(distance / 10).toFixed(1)} cm` : "Distance: --";
  }
}
