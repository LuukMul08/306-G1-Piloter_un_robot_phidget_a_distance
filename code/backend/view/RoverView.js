/**
 * Vue du Rover côté serveur.
 * Permet d'envoyer le statut du Rover aux clients WebSocket.
 */
export default class RoverView {
  constructor() {}

  /**
   * Envoie le statut actuel au client via WebSocket.
   * @param {WebSocket} ws - La connexion WebSocket du client
   * @param {number} distance - La dernière distance mesurée (cm)
   * @param {boolean} distanceAvailable - Indique si le capteur de distance est disponible
   */
  sendStatus(ws, distance, distanceAvailable) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        distance: distanceAvailable ? distance.toFixed(1) : null
      }));
    }
  }
}