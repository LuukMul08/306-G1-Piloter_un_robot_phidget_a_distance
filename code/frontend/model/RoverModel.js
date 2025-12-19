export default class RoverModel {
  speedMode = 2;
  speedFactors = { 1: 0.30, 2: 0.60, 3: 1.00 };

  speedLock = false;
  prevSpeedMode = 2;
  stopActive = false;

  distance = null;
  battery = null;

  minDistanceBlock = 300;
  minDistanceSlow = 1000;

  lastBtnA = false;
  lastBtnY = false;
  lastBtnX = false;

  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  deadzone(v, dz = 0.12) {
    return (v === undefined || Math.abs(v) < dz) ? 0 : v;
  }

  updateDistance(distance) {
    this.distance = distance;
  }

  toggleStop(btnX) {
    if (btnX && !this.lastBtnX) this.stopActive = !this.stopActive;
    this.lastBtnX = btnX;
  }

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

  handleSpeedButtons(btnA, btnY) {
    if (!this.speedLock) {
      if (btnY && !this.lastBtnY) this.speedMode = Math.min(3, this.speedMode + 1);
      if (btnA && !this.lastBtnA) this.speedMode = Math.max(1, this.speedMode - 1);
    }
    this.lastBtnA = btnA;
    this.lastBtnY = btnY;
  }

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
    