const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const gameArea = document.getElementById("gameArea");
const overlay = document.getElementById("overlay");
const panelKicker = document.getElementById("panelKicker");
const panelTitle = document.getElementById("panelTitle");
const panelText = document.getElementById("panelText");
const startButton = document.getElementById("startButton");
const muteButton = document.getElementById("muteButton");
const soundIndicator = document.getElementById("soundIndicator");
const timeText = document.getElementById("timeText");
const scoreText = document.getElementById("scoreText");
const grazeText = document.getElementById("grazeText");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const SURVIVE_TIME = 45;

let state = "ready";
let lastTime = 0;
let elapsed = 0;
let score = 0;
let grazeCount = 0;
let bullets = [];
let particles = [];
let stars = [];
let radialTimer = 0;
let aimedTimer = 0;
let rainTimer = 0;
let spiralAngle = 0;
let grazeSoundTimer = 0;

const player = {
  x: WIDTH / 2,
  y: HEIGHT - 74,
  radius: 10,
  targetX: WIDTH / 2,
  targetY: HEIGHT - 74,
  invincibleTime: 0
};

const boss = {
  x: WIDTH / 2,
  y: 84,
  radius: 28,
  pulse: 0
};

const audio = {
  context: null,
  master: null,
  isMuted: false,
  bgmTimer: null,
  noteIndex: 0,

  init() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.context.createGain();
      this.master.gain.value = this.isMuted ? 0 : 0.18;
      this.master.connect(this.context.destination);
    }

    if (this.context.state === "suspended") {
      this.context.resume();
    }
  },

  setMuted(value) {
    this.isMuted = value;

    if (this.master) {
      this.master.gain.setTargetAtTime(value ? 0 : 0.18, this.context.currentTime, 0.03);
    }

    soundIndicator.textContent = value ? "SOUND OFF" : "SOUND ON";
    muteButton.textContent = value ? "사운드 켜기" : "사운드 끄기";
  },

  tone(frequency, duration, type = "sine", volume = 0.18, startFrequency = frequency, endFrequency = frequency) {
    if (!this.context || this.isMuted) return;

    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFrequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  },

  noise(duration = 0.18, volume = 0.18) {
    if (!this.context || this.isMuted) return;

    const now = this.context.currentTime;
    const bufferSize = this.context.sampleRate * duration;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();

    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1600, now);
    filter.frequency.exponentialRampToValueAtTime(240, now + duration);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(now);
  },

  playClick() {
    this.tone(660, 0.07, "triangle", 0.08, 880, 660);
  },

  playStart() {
    this.tone(392, 0.12, "sine", 0.11, 392, 588);
    setTimeout(() => this.tone(588, 0.14, "sine", 0.11, 588, 784), 90);
    setTimeout(() => this.tone(784, 0.18, "sine", 0.12, 784, 1176), 180);
  },

  playShoot() {
    this.tone(880, 0.08, "square", 0.045, 880, 440);
  },

  playGraze() {
    this.tone(1320, 0.045, "triangle", 0.055, 1320, 1760);
  },

  playHit() {
    this.noise(0.36, 0.22);
    this.tone(120, 0.32, "sawtooth", 0.14, 180, 60);
  },

  playWin() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((note, index) => {
      setTimeout(() => this.tone(note, 0.18, "triangle", 0.1, note, note * 1.2), index * 120);
    });
  },

  startBgm() {
    this.stopBgm();
    const notes = [196, 246.94, 293.66, 392, 293.66, 246.94];

    this.bgmTimer = setInterval(() => {
      if (state !== "playing" || this.isMuted) return;
      const note = notes[this.noteIndex % notes.length];
      this.tone(note, 0.18, "sine", 0.035, note, note * 1.01);
      this.noteIndex += 1;
    }, 480);
  },

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
};

function createStars() {
  stars = [];

  for (let i = 0; i < 70; i += 1) {
    stars.push({
      x: Math.random() * WIDTH,
      y: Math.random() * HEIGHT,
      radius: Math.random() * 1.8 + 0.4,
      speed: Math.random() * 18 + 8,
      alpha: Math.random() * 0.5 + 0.2
    });
  }
}

function startGame() {
  audio.init();
  audio.playStart();
  audio.startBgm();

  state = "playing";
  lastTime = performance.now();
  elapsed = 0;
  score = 0;
  grazeCount = 0;
  bullets = [];
  particles = [];
  radialTimer = 0.4;
  aimedTimer = 0.9;
  rainTimer = 0.18;
  spiralAngle = 0;
  grazeSoundTimer = 0;

  player.x = WIDTH / 2;
  player.y = HEIGHT - 74;
  player.targetX = player.x;
  player.targetY = player.y;
  player.invincibleTime = 1.2;

  updateHud();
  overlay.classList.add("is-hidden");
  requestAnimationFrame(gameLoop);
}

function endGame(result) {
  state = result;
  audio.stopBgm();

  if (result === "win") {
    audio.playWin();
    showPanel("CLEAR", "생존 성공!", `최종 점수 ${Math.floor(score)}점 / Graze ${grazeCount}회`, "다시 시작");
  } else {
    audio.playHit();
    createExplosion(player.x, player.y, "#ff4d6d", 38);
    showPanel("GAME OVER", "탄막에 피격되었습니다", `최종 점수 ${Math.floor(score)}점 / Graze ${grazeCount}회`, "다시 도전");
  }
}

function showPanel(kicker, title, text, buttonText) {
  panelKicker.textContent = kicker;
  panelTitle.textContent = title;
  panelText.textContent = text;
  startButton.textContent = buttonText;
  overlay.classList.remove("is-hidden");
}

function updateHud() {
  const timeLeft = Math.max(0, SURVIVE_TIME - elapsed);
  timeText.textContent = timeLeft.toFixed(1);
  scoreText.textContent = String(Math.floor(score));
  grazeText.textContent = String(grazeCount);
}

function gameLoop(time) {
  const delta = Math.min((time - lastTime) / 1000, 0.033);
  lastTime = time;

  update(delta);
  draw();

  if (state === "playing") {
    requestAnimationFrame(gameLoop);
  }
}

function update(delta) {
  updateStars(delta);
  updateParticles(delta);

  if (state !== "playing") return;

  elapsed += delta;
  score += delta * 12;
  boss.pulse += delta * 4;

  player.x += (player.targetX - player.x) * 0.25;
  player.y += (player.targetY - player.y) * 0.25;
  player.x = clamp(player.x, player.radius, WIDTH - player.radius);
  player.y = clamp(player.y, 128, HEIGHT - player.radius);
  player.invincibleTime = Math.max(0, player.invincibleTime - delta);
  grazeSoundTimer = Math.max(0, grazeSoundTimer - delta);

  spawnPatterns(delta);
  updateBullets(delta);
  updateHud();

  if (elapsed >= SURVIVE_TIME) {
    endGame("win");
  }
}

function updateStars(delta) {
  stars.forEach((star) => {
    star.y += star.speed * delta;
    if (star.y > HEIGHT) {
      star.y = -4;
      star.x = Math.random() * WIDTH;
    }
  });
}

function spawnPatterns(delta) {
  const difficulty = 1 + elapsed / SURVIVE_TIME;

  radialTimer -= delta;
  aimedTimer -= delta;
  rainTimer -= delta;

  if (radialTimer <= 0) {
    spawnRadialBurst(12 + Math.floor(difficulty * 4), 92 + difficulty * 18);
    radialTimer = Math.max(0.92, 1.6 - difficulty * 0.18);
    audio.playShoot();
  }

  if (aimedTimer <= 0) {
    spawnAimedBurst(5 + Math.floor(difficulty), 150 + difficulty * 22);
    aimedTimer = Math.max(0.65, 1.25 - difficulty * 0.13);
    audio.playShoot();
  }

  if (rainTimer <= 0) {
    spawnEdgeBullet(105 + difficulty * 34);
    rainTimer = Math.max(0.07, 0.18 - difficulty * 0.025);
  }
}

function spawnRadialBurst(count, speed) {
  const offset = spiralAngle;
  spiralAngle += 0.28;

  for (let i = 0; i < count; i += 1) {
    const angle = offset + (Math.PI * 2 * i) / count;
    addBullet(boss.x, boss.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 6, "pink");
  }
}

function spawnAimedBurst(count, speed) {
  const baseAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
  const spread = 0.42;

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const angle = baseAngle - spread / 2 + spread * t;
    addBullet(boss.x, boss.y, Math.cos(angle) * speed, Math.sin(angle) * speed, 5.5, "cyan");
  }
}

function spawnEdgeBullet(speed) {
  const side = Math.floor(Math.random() * 3);
  let x = 0;
  let y = 0;

  if (side === 0) {
    x = Math.random() * WIDTH;
    y = -10;
  } else if (side === 1) {
    x = -10;
    y = Math.random() * HEIGHT * 0.72 + 80;
  } else {
    x = WIDTH + 10;
    y = Math.random() * HEIGHT * 0.72 + 80;
  }

  const targetX = player.x + (Math.random() * 120 - 60);
  const targetY = player.y + (Math.random() * 120 - 60);
  const angle = Math.atan2(targetY - y, targetX - x);
  addBullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 4.8, "yellow");
}

function addBullet(x, y, vx, vy, radius, type) {
  bullets.push({
    x,
    y,
    vx,
    vy,
    radius,
    type,
    grazed: false,
    spin: Math.random() * Math.PI * 2
  });
}

function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    bullet.x += bullet.vx * delta;
    bullet.y += bullet.vy * delta;
    bullet.spin += delta * 8;

    const distance = getDistance(player.x, player.y, bullet.x, bullet.y);
    const hitDistance = player.radius + bullet.radius;

    if (player.invincibleTime <= 0 && distance < hitDistance) {
      endGame("gameover");
      return;
    }

    if (!bullet.grazed && distance < hitDistance + 18 && distance >= hitDistance) {
      bullet.grazed = true;
      grazeCount += 1;
      score += 35;
      createGrazeParticle(player.x, player.y);

      if (grazeSoundTimer <= 0) {
        audio.playGraze();
        grazeSoundTimer = 0.045;
      }
    }

    if (bullet.x < -60 || bullet.x > WIDTH + 60 || bullet.y < -60 || bullet.y > HEIGHT + 60) {
      bullets.splice(i, 1);
    }
  }
}

function createGrazeParticle(x, y) {
  for (let i = 0; i < 5; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 40 + 20;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: Math.random() * 2 + 1,
      life: 0.35,
      maxLife: 0.35,
      color: "#80ffea"
    });
  }
}

function createExplosion(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 180 + 50;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: Math.random() * 3 + 2,
      life: Math.random() * 0.45 + 0.35,
      maxLife: 0.8,
      color
    });
  }
}

function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vx *= 0.98;
    particle.vy *= 0.98;
    particle.life -= delta;

    if (particle.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();
  drawBoss();
  drawBullets();
  drawParticles();
  drawPlayer();
}

function drawBackground() {
  ctx.save();
  stars.forEach((star) => {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawBoss() {
  const pulse = Math.sin(boss.pulse) * 4;

  ctx.save();
  ctx.translate(boss.x, boss.y);

  const gradient = ctx.createRadialGradient(0, 0, 8, 0, 0, boss.radius + 24 + pulse);
  gradient.addColorStop(0, "rgba(255, 107, 214, 0.95)");
  gradient.addColorStop(0.5, "rgba(255, 107, 214, 0.22)");
  gradient.addColorStop(1, "rgba(255, 107, 214, 0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius + 26 + pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius + pulse * 0.25, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#ff6bd6";
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius - 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(-7, -8, 4, 0, Math.PI * 2);
  ctx.arc(8, -8, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBullets() {
  bullets.forEach((bullet) => {
    const colors = getBulletColors(bullet.type);

    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.rotate(bullet.spin);

    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, bullet.radius * 4);
    glow.addColorStop(0, colors.core);
    glow.addColorStop(0.35, colors.glow);
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, bullet.radius * 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors.core;
    ctx.beginPath();
    ctx.ellipse(0, 0, bullet.radius * 0.75, bullet.radius * 1.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.beginPath();
    ctx.arc(-bullet.radius * 0.2, -bullet.radius * 0.4, bullet.radius * 0.24, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });
}

function drawParticles() {
  particles.forEach((particle) => {
    const alpha = Math.max(0, particle.life / particle.maxLife);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawPlayer() {
  const blink = player.invincibleTime > 0 && Math.floor(player.invincibleTime * 12) % 2 === 0;
  if (blink) return;

  ctx.save();
  ctx.translate(player.x, player.y);

  const aura = ctx.createRadialGradient(0, 0, 1, 0, 0, 32);
  aura.addColorStop(0, "rgba(128, 255, 234, 0.65)");
  aura.addColorStop(0.55, "rgba(128, 255, 234, 0.18)");
  aura.addColorStop(1, "rgba(128, 255, 234, 0)");

  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#80ffea";
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(12, 13);
  ctx.lineTo(0, 8);
  ctx.lineTo(-12, 13);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function getBulletColors(type) {
  if (type === "cyan") {
    return {
      core: "#80ffea",
      glow: "rgba(128, 255, 234, 0.42)"
    };
  }

  if (type === "yellow") {
    return {
      core: "#ffd166",
      glow: "rgba(255, 209, 102, 0.42)"
    };
  }

  return {
    core: "#ff6bd6",
    glow: "rgba(255, 107, 214, 0.42)"
  };
}

function updatePointerPosition(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = WIDTH / rect.width;
  const scaleY = HEIGHT / rect.height;

  player.targetX = (clientX - rect.left) * scaleX;
  player.targetY = (clientY - rect.top) * scaleY;
}

gameArea.addEventListener("mousemove", (event) => {
  updatePointerPosition(event.clientX, event.clientY);
});

gameArea.addEventListener("touchmove", (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  updatePointerPosition(touch.clientX, touch.clientY);
}, { passive: false });

startButton.addEventListener("click", () => {
  audio.playClick();
  startGame();
});

muteButton.addEventListener("click", () => {
  audio.init();
  audio.setMuted(!audio.isMuted);
  audio.playClick();
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getDistance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

createStars();
updateHud();
draw();
