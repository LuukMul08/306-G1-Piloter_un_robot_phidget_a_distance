const ws = new WebSocket('ws://localhost:8080');

function updateGamepad() {
  const gamepads = navigator.getGamepads();
  if (!gamepads) return;

  const gp = gamepads[0];
  if (!gp) return;

  // Bouton A → gp.buttons[0]
  const moveForward = gp.buttons[0].pressed;

  const message = {
    leftY: moveForward ? 1 : 0,   // 1 pour avancer
    rightY: moveForward ? 1 : 0,  // 1 pour avancer
    headlight: gp.buttons[1].pressed, // exemple B pour headlight
    shootLB: gp.buttons[4].pressed,
    shootRB: gp.buttons[5].pressed
  };

  ws.send(JSON.stringify(message));

  requestAnimationFrame(updateGamepad);
}

window.addEventListener("gamepadconnected", () => {
  console.log("🎮 Manette connectée !");
  updateGamepad();
});
