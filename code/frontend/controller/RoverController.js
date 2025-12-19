import RoverModel from "../model/RoverModel.js";
import RoverView from "../view/RoverView.js";

/**
 * Contrôleur du Rover.
 * Gère l'interaction entre le modèle (RoverModel) et la vue (RoverView)
 * ainsi que la communication WebSocket avec le serveur.
 */
export default class RoverController {
  // --- Initialisation du modèle et de la vue ---
  model = new RoverModel();
  view = new RoverView();
  ws = new WebSocket("ws://localhost:8080"); // Connexion WebSocket au serveur

  constructor() {
    // --- Gestion des messages reçus du serveur ---
    this.ws.onmessage = e => {
      try {
        const data = JSON.parse(e.data);
        if (data.distance != null) {
          // Mise à jour de la distance dans le modèle
          this.model.updateDistance(parseFloat(data.distance));
        }
      } catch (err) {
        console.warn("⚠️ Erreur lors de l'analyse du WebSocket :", err);
      }
    };

    // --- Détection de la connexion de la manette ---
    window.addEventListener("gamepadconnected", () => this.loop());
  }

  /**
   * Boucle principale de lecture de la manette
   * et mise à jour du modèle, de la vue et envoi des commandes au serveur.
   */
  loop = () => {
    const gp = navigator.getGamepads()[0]; // Récupère la première manette

    if (!gp) {
      // Manette non connectée → afficher message d'attente
      this.view.updateStatus("⏳ En attente de la manette...");
      requestAnimationFrame(this.loop);
      return;
    }

    this.view.updateStatus(`🎮 Manette connectée : ${gp.id}`);

    // --- BOUTONS ---
    const btnA = gp.buttons[0]?.pressed;
    const btnX = gp.buttons[2]?.pressed;
    const btnY = gp.buttons[3]?.pressed;

    // --- TRIGGERS ---
    const rt = gp.buttons[7]?.value || 0; // Gâchette droite → avancer
    const lt = gp.buttons[6]?.value || 0; // Gâchette gauche → reculer

    // --- MISE À JOUR DE L'ÉTAT DU MODÈLE ---
    this.model.toggleStop(btnX);         // Bouton X → activer/désactiver stop
    this.model.updateSpeedLock();        // Mise à jour du verrou de vitesse
    this.model.handleSpeedButtons(btnA, btnY); // Gestion boutons vitesse

    // --- DIRECTION ---
    const steer = this.model.deadzone(gp.axes[2]); // Axes de direction avec deadzone

    // --- AVANCE / RECULE ---
    let forward = -this.model.deadzone(gp.axes[1]); // Stick Y par défaut

    if (rt > 0 && lt === 0) {
      forward = rt;            // Avance avec RT
    } else if (lt > 0 && rt === 0) {
      forward = -lt;           // Recule avec LT
    } else if (rt > 0 && lt > 0) {
      forward = 0;             // Les deux triggers → neutre
    }

    // --- BLOQUAGE DISTANCE ---
    if (
      this.model.distance !== null &&
      this.model.distance < this.model.minDistanceBlock &&
      forward > 0
    ) {
      forward = 0; // Stoppe le rover si trop proche d'un obstacle
    }

    // --- CALCUL DES VITESSES DES MOTEURS ---
    const { left, right, factor } = this.model.computeMotors(forward, steer);

    // --- ENVOI DES COMMANDES AU SERVEUR ---
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          leftY: left,
          rightY: right,
          speedMode: this.model.speedMode,
          stop: this.model.stopActive
        })
      );
    }

    // --- MISE À JOUR DE L'AFFICHAGE ---
    this.view.updateUI({
      speedMode: this.model.speedMode,
      factor,
      speedLock: this.model.speedLock,
      stopActive: this.model.stopActive,
      forward,
      steer,
      buttons: `${btnA ? "A " : ""}${btnY ? "Y " : ""}${btnX ? "X " : ""}`.trim(),
      distance: this.model.distance
    });

    // --- Prochaine itération de la boucle ---
    requestAnimationFrame(this.loop);
  };
}
