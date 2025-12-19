/**
 * Contrôleur du Rover côté serveur.
 * Reçoit les commandes via WebSocket et met à jour le modèle.
 */
export default class RoverController {
  model;
  view;
  ws;
  lastUpdate = 0;
  updateInterval = 50; // Intervalle minimum entre deux commandes (ms)

  /**
   * @param {RoverModel} model - Le modèle du Rover (motors, distance).
   * @param {RoverView} view - La vue pour envoyer le statut au client.
   * @param {WebSocket} ws - La connexion WebSocket avec le client.
   */
  constructor(model, view, ws) {
    this.model = model;
    this.view = view;
    this.ws = ws;

    // --- Gestion des messages du client ---
    ws.on('message', async (message) => this.handleMessage(message));

    // --- Gestion de la déconnexion du client ---
    ws.on('close', () => {
      console.log('❌ Client déconnecté → Arrêt des moteurs');
      this.model.setMotorSpeeds(0, 0); // Arrête les moteurs
    });
  }

  /**
   * Traite les messages reçus du client.
   * Met à jour les vitesses des moteurs et renvoie le statut.
   * @param {Buffer|string} message - Message JSON reçu via WebSocket
   */
  async handleMessage(message) {
    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval) return; // Limitation de fréquence
    this.lastUpdate = now;

    try {
      const data = JSON.parse(message.toString());
      const left = data.leftY ?? 0;
      const right = data.rightY ?? 0;

      // --- Mise à jour des vitesses des moteurs ---
      this.model.setMotorSpeeds(left, right);

      // --- Envoi du statut actuel au client ---
      this.view.sendStatus(this.ws, this.model.lastDistance, this.model.distanceAvailable);
    } catch (err) {
      console.error('❌ Erreur lors du traitement du message WS :', err);
    }
  }
}
