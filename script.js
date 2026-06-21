const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const stageText = document.getElementById('stageText');
const timeText = document.getElementById('timeText');
const scoreText = document.getElementById('scoreText');
const grazeText = document.getElementById('grazeText');
const modeIndicator = document.getElementById('modeIndicator');
const soundIndicator = document.getElementById('soundIndicator');

const overlay = document.getElementById('overlay');
const panelKicker = document.getElementById('panelKicker');
const panelTitle = document.getElementById('panelTitle');
const panelText = document.getElementById('panelText');
const startButton = document.getElementById('startButton');
const muteButton = document.getElementById('muteButton');
const finishRunButton = document.getElementById('finishRunButton');

const rankForm = document.getElementById('rankForm');
const nicknameInput = document.getElementById('nicknameInput');
const saveRankButton = document.getElementById('saveRankButton');
const rankHelp = document.getElementById('rankHelp');
const rankingList = document.getElementById('rankingList');
const clearRankingButton = document.getElementById('clearRankingButton');
const bgmAudioElement = document.getElementById('bgmAudio');

const STAGE_TIME = 15;
const RANKING_KEY = 'bulletDodgeRankingV4';
const PLAYER_KEYBOARD_SPEED = 360;
const PLAYER_IMAGE_PATH = 'Player/Player.png';
const PLAYER_DRAW_SIZE = 38;
const BGM_PATH = 'sound/bgm.mp3';

const stageConfigs = {
  1: {
    label: 'STAGE 1',
    bodyMode: 'stage1',
    spawnInterval: 1.05,
    aimedInterval: 0.72,
    speed: 1,
    scorePerSecond: 100,
    starColor: 'rgba(210, 224, 255, 0.78)',
    coreColor: '#111a3c',
    edgeColor: '#040611',
  },
  2: {
    label: 'STAGE 2',
    bodyMode: 'stage2',
    spawnInterval: 0.86,
    aimedInterval: 0.58,
    speed: 1.18,
    scorePerSecond: 170,
    starColor: 'rgba(223, 190, 255, 0.78)',
    coreColor: '#23154e',
    edgeColor: '#050614',
  },
  3: {
    label: 'STAGE 3',
    bodyMode: 'stage3',
    spawnInterval: 0.68,
    aimedInterval: 0.46,
    speed: 1.36,
    scorePerSecond: 260,
    starColor: 'rgba(255, 207, 206, 0.8)',
    coreColor: '#3c1022',
    edgeColor: '#07030a',
  },
  endless: {
    label: 'ENDLESS',
    bodyMode: 'endless',
    spawnInterval: 0.52,
    aimedInterval: 0.36,
    speed: 1.48,
    scorePerSecond: 360,
    starColor: 'rgba(214, 252, 255, 0.82)',
    coreColor: '#102535',
    edgeColor: '#02030a',
  },
};

let gameState = 'ready';
let player;
let bullets = [];
let particles = [];
let stars = [];
let currentStage = 1;
let stageElapsed = 0;
let totalElapsed = 0;
let endlessElapsed = 0;
let score = 0;
let grazeCount = 0;
let lastTime = 0;
let patternTimer = 0;
let aimedTimer = 0;
let rainTimer = 0;
let crossTimer = 0;
let animationId = 0;
let finalLog = null;
let isRankSaved = false;
const playerImage = new Image();
playerImage.src = PLAYER_IMAGE_PATH;
const keyboardInput = {
  up: false,
  down: false,
  left: false,
  right: false,
};

let audioContext = null;
let masterGain = null;
let isMuted = false;
let bgmAudio = null;
let shotSoundCooldown = 0;
let grazeSoundCooldown = 0;

function getConfig() {
  return currentStage === 'endless' ? stageConfigs.endless : stageConfigs[currentStage];
}

function initAudio() {
  if (!bgmAudio) {
    bgmAudio = bgmAudioElement || new Audio(BGM_PATH);
    bgmAudio.src = bgmAudio.src || new URL(BGM_PATH, document.baseURI).href;
    bgmAudio.loop = true;
    bgmAudio.volume = 0.36;
    bgmAudio.preload = 'auto';
  }

  if (audioContext) return;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audioContext = new AudioContext();
  masterGain = audioContext.createGain();
  masterGain.gain.value = isMuted ? 0 : 0.36;
  masterGain.connect(audioContext.destination);
}

function resumeAudio() {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function createTone(frequency, duration, type = 'sine', volume = 0.18, startTime = 0, slideTo = null) {
  if (!audioContext || isMuted) return;

  const now = audioContext.currentTime + startTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function createNoise(duration, volume = 0.18, startTime = 0) {
  if (!audioContext || isMuted) return;

  const now = audioContext.currentTime + startTime;
  const bufferSize = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();

  filter.type = 'highpass';
  filter.frequency.value = 520;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start(now);
  source.stop(now + duration);
}

function playStartSound() {
  createTone(330, 0.12, 'triangle', 0.14, 0, 660);
  createTone(660, 0.16, 'triangle', 0.14, 0.12, 990);
}

function playShotSound() {
  if (shotSoundCooldown > 0) return;
  shotSoundCooldown = 0.12;
  createTone(980, 0.06, 'square', 0.035, 0, 520);
}

function playGrazeSound() {
  if (grazeSoundCooldown > 0) return;
  grazeSoundCooldown = 0.08;
  createTone(1320, 0.05, 'sine', 0.045, 0, 1680);
}

function playStageUpSound() {
  createTone(440, 0.12, 'triangle', 0.12, 0, 660);
  createTone(660, 0.12, 'triangle', 0.12, 0.11, 880);
  createTone(880, 0.22, 'triangle', 0.12, 0.22, 1320);
}

function playEnterEndlessSound() {
  createTone(220, 0.15, 'sawtooth', 0.08, 0, 440);
  createTone(440, 0.15, 'sawtooth', 0.08, 0.12, 880);
  createTone(880, 0.35, 'triangle', 0.13, 0.25, 1760);
  createNoise(0.28, 0.08, 0.22);
}

function playDefeatEndingSound() {
  createNoise(0.35, 0.18, 0);
  createTone(240, 0.22, 'sawtooth', 0.16, 0, 120);
  createTone(120, 0.36, 'triangle', 0.13, 0.22, 60);
}

function playFinishRunSound() {
  createTone(520, 0.16, 'triangle', 0.1, 0, 620);
  createTone(720, 0.22, 'sine', 0.1, 0.14, 920);
}

function startBgm() {
  if (!bgmAudio || isMuted) return;

  bgmAudio.muted = false;
  bgmAudio.play().catch((error) => {
    console.warn('BGM 재생에 실패했습니다.', {
      src: bgmAudio.currentSrc || bgmAudio.src,
      error,
    });
  });
}

function stopBgm() {
  if (!bgmAudio) return;

  bgmAudio.pause();
  bgmAudio.currentTime = 0;
}

function updateSoundUi() {
  soundIndicator.textContent = isMuted ? 'SOUND OFF' : 'SOUND ON';
  muteButton.textContent = isMuted ? '사운드 켜기' : '사운드 끄기';

  if (masterGain) {
    masterGain.gain.value = isMuted ? 0 : 0.36;
  }

  if (bgmAudio) {
    bgmAudio.muted = isMuted;
    bgmAudio.volume = isMuted ? 0 : 0.36;
  }

  if (isMuted) {
    if (bgmAudio) bgmAudio.pause();
  } else if (gameState === 'playing') {
    startBgm();
  }
}

function toggleMute() {
  initAudio();
  resumeAudio();
  isMuted = !isMuted;
  updateSoundUi();
}

function resetGame() {
  resetKeyboardInput();

  player = {
    x: canvas.width / 2,
    y: canvas.height - 86,
    radius: 11,
    hitRadius: 6,
    grazeRadius: 28,
    targetX: canvas.width / 2,
    targetY: canvas.height - 86,
    invincibleTime: 1.15,
  };

  bullets = [];
  particles = [];
  currentStage = 1;
  stageElapsed = 0;
  totalElapsed = 0;
  endlessElapsed = 0;
  score = 0;
  grazeCount = 0;
  lastTime = 0;
  patternTimer = 0;
  aimedTimer = 0;
  rainTimer = 0;
  crossTimer = 0;
  shotSoundCooldown = 0;
  grazeSoundCooldown = 0;
  finalLog = null;
  isRankSaved = false;

  stars = Array.from({ length: 105 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 2 + 0.45,
    speed: Math.random() * 22 + 12,
    twinkle: Math.random() * Math.PI * 2,
  }));

  rankForm.classList.add('hidden');
  rankHelp.textContent = '점수 기준 상위 10개 기록만 저장됩니다.';
  nicknameInput.value = '';
  saveRankButton.disabled = false;
  finishRunButton.disabled = true;

  updateStageUi();
  updateHud();
}

function startGame() {
  initAudio();
  resumeAudio();
  resetGame();
  gameState = 'playing';
  overlay.classList.remove('active');
  finishRunButton.disabled = false;
  startButton.textContent = '다시 시작';
  playStartSound();
  startBgm();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(gameLoop);
}

function finishGame(resultType) {
  if (gameState !== 'playing') return;

  gameState = 'end';
  cancelAnimationFrame(animationId);
  stopBgm();
  finishRunButton.disabled = true;

  const stageLabel = getStageLabelForLog();
  finalLog = {
    result: resultType,
    score: Math.floor(score),
    totalTime: totalElapsed,
    stage: stageLabel,
    graze: grazeCount,
    date: new Date().toLocaleString('ko-KR'),
  };

  if (resultType === 'defeat') {
    playDefeatEndingSound();
    panelKicker.textContent = 'GAME OVER';
    panelTitle.textContent = '탄막에 피격되었습니다';
    panelText.textContent = `${stageLabel}에서 종료되었습니다. 생존 시간 ${totalElapsed.toFixed(1)}초 / 최종 점수 ${Math.floor(score)}점`;
  } else {
    playFinishRunSound();
    panelKicker.textContent = 'RUN FINISHED';
    panelTitle.textContent = '기록을 종료했습니다';
    panelText.textContent = `${stageLabel}까지 도달했습니다. 생존 시간 ${totalElapsed.toFixed(1)}초 / 최종 점수 ${Math.floor(score)}점`;
  }

  rankForm.classList.remove('hidden');
  overlay.classList.add('active');
  startButton.textContent = '다시 시작';
  nicknameInput.focus();
  updateHud();
}

function getStageLabelForLog() {
  if (currentStage === 'endless') {
    return `무한모드 ${endlessElapsed.toFixed(1)}초`;
  }
  return `${currentStage}단계`;
}

function updateStageUi() {
  const config = getConfig();
  const label = config.label;
  stageText.textContent = label.replace('STAGE ', 'S');
  modeIndicator.textContent = label;
  document.body.dataset.mode = config.bodyMode;
}

function updateHud() {
  if (currentStage === 'endless') {
    timeText.textContent = `${endlessElapsed.toFixed(1)}+`;
  } else {
    const remainTime = Math.max(0, STAGE_TIME - stageElapsed);
    timeText.textContent = remainTime.toFixed(1);
  }

  scoreText.textContent = Math.floor(score).toString();
  grazeText.textContent = grazeCount.toString();
}

function movePlayerTo(x, y) {
  player.targetX = Math.max(player.radius, Math.min(canvas.width - player.radius, x));
  player.targetY = Math.max(player.radius, Math.min(canvas.height - player.radius, y));
}

function resetKeyboardInput() {
  keyboardInput.up = false;
  keyboardInput.down = false;
  keyboardInput.left = false;
  keyboardInput.right = false;
}

function isTextInputTarget(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
}

function setKeyboardInput(code, isPressed) {
  if (code === 'KeyW' || code === 'ArrowUp') keyboardInput.up = isPressed;
  else if (code === 'KeyS' || code === 'ArrowDown') keyboardInput.down = isPressed;
  else if (code === 'KeyA' || code === 'ArrowLeft') keyboardInput.left = isPressed;
  else if (code === 'KeyD' || code === 'ArrowRight') keyboardInput.right = isPressed;
  else return false;

  return true;
}

function handleKeyDown(event) {
  if (isTextInputTarget(event.target)) return;
  if (setKeyboardInput(event.code, true)) {
    event.preventDefault();
  }
}

function handleKeyUp(event) {
  if (setKeyboardInput(event.code, false)) {
    event.preventDefault();
  }
}

function updateKeyboardMovement(deltaTime) {
  const directionX = Number(keyboardInput.right) - Number(keyboardInput.left);
  const directionY = Number(keyboardInput.down) - Number(keyboardInput.up);

  if (directionX === 0 && directionY === 0) return;

  const length = Math.hypot(directionX, directionY);
  const distance = PLAYER_KEYBOARD_SPEED * deltaTime;
  movePlayerTo(
    player.targetX + (directionX / length) * distance,
    player.targetY + (directionY / length) * distance
  );
}

function createBullet(x, y, vx, vy, radius, color, glowColor) {
  bullets.push({
    x,
    y,
    vx,
    vy,
    radius,
    color,
    glowColor,
    rotation: Math.random() * Math.PI * 2,
    grazed: false,
  });
}

function createCirclePattern() {
  const config = getConfig();
  const centerX = canvas.width / 2;
  const centerY = currentStage === 'endless' ? canvas.height / 2 + Math.sin(totalElapsed) * 80 : canvas.height / 2;
  const endlessBonus = currentStage === 'endless' ? Math.min(10, Math.floor(endlessElapsed / 8)) : 0;
  const count = Math.floor(12 + getDifficultyLevel() * 2 + endlessBonus);
  const speed = (82 + getDifficultyLevel() * 18 + endlessBonus * 5) * config.speed;
  const offset = totalElapsed * (0.8 + getDifficultyLevel() * 0.08);

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + offset;
    createBullet(
      centerX,
      centerY,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      6,
      '#ff6bba',
      'rgba(255, 107, 186, 0.75)'
    );
  }
  playShotSound();
}

function createSpiralPattern() {
  const config = getConfig();
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const arms = currentStage === 1 ? 3 : currentStage === 2 ? 4 : 5;
  const endlessBonus = currentStage === 'endless' ? Math.min(3, Math.floor(endlessElapsed / 15)) : 0;
  const speed = (105 + getDifficultyLevel() * 16) * config.speed;

  for (let i = 0; i < arms + endlessBonus; i++) {
    const angle = totalElapsed * (3.1 + getDifficultyLevel() * 0.16) + (Math.PI * 2 / (arms + endlessBonus)) * i;
    createBullet(
      centerX,
      centerY,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      5,
      '#8ea2ff',
      'rgba(142, 162, 255, 0.75)'
    );
  }
  playShotSound();
}

function createWallPattern() {
  const config = getConfig();
  const fromLeft = Math.random() > 0.5;
  const x = fromLeft ? -20 : canvas.width + 20;
  const dir = fromLeft ? 1 : -1;
  const gapY = 88 + Math.random() * (canvas.height - 176);
  const speed = (86 + getDifficultyLevel() * 18) * config.speed;
  const spacing = currentStage === 2 ? 36 : 32;

  for (let y = 34; y < canvas.height; y += spacing) {
    if (Math.abs(y - gapY) < 58) continue;

    createBullet(
      x,
      y,
      dir * speed,
      Math.sin(y * 0.03 + totalElapsed) * 20,
      7,
      '#ffd166',
      'rgba(255, 209, 102, 0.75)'
    );
  }
  playShotSound();
}

function createRainPattern() {
  const config = getConfig();
  const columns = currentStage === 3 ? 10 : 13;
  const gapIndex = Math.floor(Math.random() * columns);
  const speed = (150 + getDifficultyLevel() * 22) * config.speed;
  const width = canvas.width / columns;

  for (let i = 0; i < columns; i++) {
    if (i === gapIndex) continue;
    const x = i * width + width / 2 + (Math.random() - 0.5) * 18;
    createBullet(
      x,
      -20,
      Math.sin(totalElapsed + i) * 18,
      speed,
      6,
      '#4df3ff',
      'rgba(77, 243, 255, 0.75)'
    );
  }
  playShotSound();
}

function createCrossPattern() {
  const config = getConfig();
  const speed = (115 + getDifficultyLevel() * 18) * config.speed;
  const count = currentStage === 'endless' ? 10 : 8;

  for (let i = 0; i < count; i++) {
    const y = 55 + i * ((canvas.height - 110) / (count - 1));
    createBullet(-18, y, speed, 42 * Math.sin(i + totalElapsed), 5.5, '#ff4d6d', 'rgba(255, 77, 109, 0.75)');
    createBullet(canvas.width + 18, canvas.height - y, -speed, 42 * Math.cos(i + totalElapsed), 5.5, '#ff4d6d', 'rgba(255, 77, 109, 0.75)');
  }
  playShotSound();
}

function createAimedBullet() {
  const config = getConfig();
  const side = Math.floor(Math.random() * 4);
  let x;
  let y;

  if (side === 0) {
    x = Math.random() * canvas.width;
    y = -20;
  } else if (side === 1) {
    x = canvas.width + 20;
    y = Math.random() * canvas.height;
  } else if (side === 2) {
    x = Math.random() * canvas.width;
    y = canvas.height + 20;
  } else {
    x = -20;
    y = Math.random() * canvas.height;
  }

  const dx = player.x - x;
  const dy = player.y - y;
  const distance = Math.hypot(dx, dy) || 1;
  const speed = (116 + getDifficultyLevel() * 20) * config.speed;

  createBullet(
    x,
    y,
    dx / distance * speed,
    dy / distance * speed,
    6,
    '#ffffff',
    'rgba(255, 255, 255, 0.75)'
  );
}

function getDifficultyLevel() {
  if (currentStage === 'endless') {
    return 4 + Math.min(8, endlessElapsed / 12);
  }
  return currentStage;
}

function createHitParticles(x, y, color = '#ffffff') {
  for (let i = 0; i < 24; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 210;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.7,
      maxLife: 0.7,
      radius: 2 + Math.random() * 3,
      color,
    });
  }
}

function createStageTransitionParticles() {
  for (let i = 0; i < 44; i++) {
    createHitParticles(canvas.width / 2, canvas.height / 2, currentStage === 'endless' ? '#ffd166' : '#4df3ff');
  }
}

function updateGame(deltaTime) {
  const config = getConfig();

  totalElapsed += deltaTime;
  stageElapsed += deltaTime;
  patternTimer += deltaTime;
  aimedTimer += deltaTime;
  rainTimer += deltaTime;
  crossTimer += deltaTime;
  shotSoundCooldown = Math.max(0, shotSoundCooldown - deltaTime);
  grazeSoundCooldown = Math.max(0, grazeSoundCooldown - deltaTime);

  if (currentStage === 'endless') {
    endlessElapsed += deltaTime;
  } else if (stageElapsed >= STAGE_TIME) {
    goToNextStage();
    return;
  }

  player.invincibleTime = Math.max(0, player.invincibleTime - deltaTime);
  updateKeyboardMovement(deltaTime);
  player.x += (player.targetX - player.x) * 0.25;
  player.y += (player.targetY - player.y) * 0.25;

  const endlessScale = currentStage === 'endless' ? Math.min(0.22, endlessElapsed * 0.0025) : 0;
  const patternInterval = Math.max(0.28, config.spawnInterval - endlessScale);
  const aimedInterval = Math.max(0.2, config.aimedInterval - endlessScale * 0.6);

  if (patternTimer >= patternInterval) {
    patternTimer = 0;
    const random = Math.random();

    if (currentStage === 1) {
      random < 0.65 ? createCirclePattern() : createAimedBullet();
    } else if (currentStage === 2) {
      if (random < 0.38) createCirclePattern();
      else if (random < 0.74) createSpiralPattern();
      else createWallPattern();
    } else if (currentStage === 3) {
      if (random < 0.28) createCirclePattern();
      else if (random < 0.55) createSpiralPattern();
      else if (random < 0.78) createWallPattern();
      else createRainPattern();
    } else {
      if (random < 0.2) createCirclePattern();
      else if (random < 0.4) createSpiralPattern();
      else if (random < 0.6) createWallPattern();
      else if (random < 0.8) createRainPattern();
      else createCrossPattern();
    }
  }

  if (aimedTimer >= aimedInterval) {
    aimedTimer = 0;
    createAimedBullet();
    if (currentStage === 'endless' && endlessElapsed > 20) {
      createAimedBullet();
    }
  }

  if ((currentStage === 3 || currentStage === 'endless') && rainTimer >= 2.5) {
    rainTimer = 0;
    createRainPattern();
  }

  if (currentStage === 'endless' && crossTimer >= 4.2) {
    crossTimer = 0;
    createCrossPattern();
  }

  bullets.forEach((bullet) => {
    bullet.x += bullet.vx * deltaTime;
    bullet.y += bullet.vy * deltaTime;
    bullet.rotation += deltaTime * 5;
  });

  bullets = bullets.filter((bullet) => {
    return bullet.x > -90 && bullet.x < canvas.width + 90 && bullet.y > -90 && bullet.y < canvas.height + 90;
  });

  particles.forEach((particle) => {
    particle.x += particle.vx * deltaTime;
    particle.y += particle.vy * deltaTime;
    particle.vx *= 0.985;
    particle.vy *= 0.985;
    particle.life -= deltaTime;
  });
  particles = particles.filter((particle) => particle.life > 0);

  stars.forEach((star) => {
    const speedBonus = currentStage === 'endless' ? Math.min(24, endlessElapsed * 0.8) : currentStage * 4;
    star.y += (star.speed + speedBonus) * deltaTime;
    star.twinkle += deltaTime * 2;
    if (star.y > canvas.height + 5) {
      star.x = Math.random() * canvas.width;
      star.y = -8;
      star.size = Math.random() * 2 + 0.45;
    }
  });

  score += config.scorePerSecond * deltaTime;
  if (currentStage === 'endless') {
    score += endlessElapsed * 2.8 * deltaTime;
  }

  checkCollisionAndGraze();
  updateHud();
}

function goToNextStage() {
  if (currentStage === 1) {
    currentStage = 2;
    stageElapsed = 0;
    patternTimer = 0;
    aimedTimer = 0;
    player.invincibleTime = 0.85;
    bullets = bullets.slice(-20);
    updateStageUi();
    createStageTransitionParticles();
    playStageUpSound();
  } else if (currentStage === 2) {
    currentStage = 3;
    stageElapsed = 0;
    patternTimer = 0;
    aimedTimer = 0;
    player.invincibleTime = 0.85;
    bullets = bullets.slice(-24);
    updateStageUi();
    createStageTransitionParticles();
    playStageUpSound();
  } else if (currentStage === 3) {
    currentStage = 'endless';
    stageElapsed = 0;
    endlessElapsed = 0;
    patternTimer = 0;
    aimedTimer = 0;
    player.invincibleTime = 1.05;
    bullets = bullets.slice(-28);
    updateStageUi();
    createStageTransitionParticles();
    playEnterEndlessSound();
  }

  updateHud();
}

function checkCollisionAndGraze() {
  if (player.invincibleTime > 0) return;

  for (const bullet of bullets) {
    const distance = Math.hypot(player.x - bullet.x, player.y - bullet.y);

    if (distance < player.hitRadius + bullet.radius) {
      createHitParticles(player.x, player.y, '#ff5fb7');
      drawGame();
      finishGame('defeat');
      return;
    }

    if (!bullet.grazed && distance < player.grazeRadius + bullet.radius) {
      bullet.grazed = true;
      grazeCount += 1;
      score += currentStage === 'endless' ? 75 : 50;
      playGrazeSound();
    }
  }
}

function drawBackground() {
  const config = getConfig();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createRadialGradient(
    canvas.width / 2 + Math.sin(totalElapsed * 0.5) * 70,
    canvas.height / 2 + Math.cos(totalElapsed * 0.45) * 50,
    70,
    canvas.width / 2,
    canvas.height / 2,
    650
  );
  gradient.addColorStop(0, config.coreColor);
  gradient.addColorStop(1, config.edgeColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawStageNebula(config);
  drawStageGrid();

  ctx.fillStyle = config.starColor;
  stars.forEach((star) => {
    ctx.globalAlpha = 0.22 + Math.abs(Math.sin(star.twinkle)) * 0.42;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawStageNebula(config) {
  const time = totalElapsed;
  const spots = currentStage === 'endless' ? 5 : currentStage + 1;

  for (let i = 0; i < spots; i++) {
    const x = canvas.width * (0.18 + i * 0.17) + Math.sin(time * 0.4 + i) * 42;
    const y = canvas.height * (0.25 + (i % 3) * 0.22) + Math.cos(time * 0.35 + i) * 34;
    const radius = 90 + i * 24;
    const nebula = ctx.createRadialGradient(x, y, 5, x, y, radius);

    if (currentStage === 1) {
      nebula.addColorStop(0, 'rgba(77, 243, 255, 0.12)');
    } else if (currentStage === 2) {
      nebula.addColorStop(0, 'rgba(174, 95, 255, 0.14)');
    } else if (currentStage === 3) {
      nebula.addColorStop(0, 'rgba(255, 95, 130, 0.15)');
    } else {
      nebula.addColorStop(0, i % 2 === 0 ? 'rgba(255, 209, 102, 0.14)' : 'rgba(77, 243, 255, 0.13)');
    }

    nebula.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = nebula;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStageGrid() {
  const alpha = currentStage === 'endless' ? 0.12 : 0.07;
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = 1;

  const offset = (totalElapsed * (currentStage === 'endless' ? 52 : 28)) % 42;
  for (let y = -42 + offset; y < canvas.height; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y + 16);
    ctx.stroke();
  }
}

function drawBullets() {
  bullets.forEach((bullet) => {
    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.rotate(bullet.rotation);

    ctx.shadowBlur = 18;
    ctx.shadowColor = bullet.glowColor;
    ctx.fillStyle = bullet.color;
    ctx.beginPath();
    ctx.arc(0, 0, bullet.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, bullet.radius * 0.48, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  });
}

function drawPlayer() {
  const blink = player.invincibleTime > 0 && Math.floor(player.invincibleTime * 12) % 2 === 0;
  if (blink) return;

  ctx.save();
  ctx.translate(player.x, player.y);

  ctx.shadowBlur = 22;
  ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
  if (playerImage.complete && playerImage.naturalWidth > 0) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      playerImage,
      -PLAYER_DRAW_SIZE / 2,
      -PLAYER_DRAW_SIZE / 2,
      PLAYER_DRAW_SIZE,
      PLAYER_DRAW_SIZE
    );
    ctx.imageSmoothingEnabled = true;
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -player.radius - 4);
    ctx.lineTo(player.radius + 5, player.radius + 6);
    ctx.lineTo(0, player.radius);
    ctx.lineTo(-player.radius - 5, player.radius + 6);
    ctx.closePath();
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ff5fb7';
  ctx.beginPath();
  ctx.arc(0, 1, player.hitRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 1, player.hitRadius + 3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawParticles() {
  particles.forEach((particle) => {
    const alpha = particle.life / particle.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawWarningText() {
  ctx.textAlign = 'center';

  if (gameState === 'playing' && player.invincibleTime > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.font = '18px Arial';
    ctx.fillText('무적 시간', canvas.width / 2, 36);
  }

  if (gameState === 'playing' && currentStage === 'endless') {
    ctx.fillStyle = 'rgba(255, 209, 102, 0.86)';
    ctx.font = 'bold 18px Arial';
    ctx.fillText('ENDLESS MODE', canvas.width / 2, 64);
  }
}

function drawGame() {
  drawBackground();
  drawBullets();
  drawParticles();
  drawPlayer();
  drawWarningText();
}

function gameLoop(timestamp) {
  if (gameState !== 'playing') return;

  if (!lastTime) {
    lastTime = timestamp;
  }

  const deltaTime = Math.min((timestamp - lastTime) / 1000, 0.033);
  lastTime = timestamp;

  updateGame(deltaTime);
  drawGame();

  animationId = requestAnimationFrame(gameLoop);
}

function loadRankings() {
  try {
    return JSON.parse(localStorage.getItem(RANKING_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function saveRankings(rankings) {
  localStorage.setItem(RANKING_KEY, JSON.stringify(rankings));
}

function renderRankings() {
  const rankings = loadRankings();
  rankingList.innerHTML = '';

  if (rankings.length === 0) {
    rankingList.innerHTML = '<li class="empty-rank">아직 기록이 없습니다.<br />첫 번째 플레이 로그를 남겨보세요.</li>';
    return;
  }

  rankings.forEach((rank, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="rank-number">${index + 1}</span>
      <div>
        <div class="rank-main">
          <span class="rank-name"></span>
          <span class="rank-score">${rank.score}점</span>
        </div>
        <div class="rank-sub">${rank.stage} · ${rank.totalTime.toFixed(1)}초 · Graze ${rank.graze}<br />${rank.date}</div>
      </div>
    `;
    li.querySelector('.rank-name').textContent = rank.nickname;
    rankingList.appendChild(li);
  });
}

function handleRankSubmit(event) {
  event.preventDefault();

  if (!finalLog || isRankSaved) return;

  const nickname = nicknameInput.value.trim() || '익명 파일럿';
  const safeNickname = nickname.slice(0, 12);
  const rankings = loadRankings();

  rankings.push({
    nickname: safeNickname,
    result: finalLog.result,
    score: finalLog.score,
    totalTime: finalLog.totalTime,
    stage: finalLog.stage,
    graze: finalLog.graze,
    date: finalLog.date,
  });

  rankings.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.totalTime - a.totalTime;
  });

  saveRankings(rankings.slice(0, 10));
  isRankSaved = true;
  saveRankButton.disabled = true;
  rankHelp.textContent = '기록이 저장되었습니다.';
  renderRankings();
}

function clearRankings() {
  const shouldClear = confirm('TOP 10 기록을 모두 삭제할까요?');
  if (!shouldClear) return;
  localStorage.removeItem(RANKING_KEY);
  renderRankings();
}

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);
startButton.addEventListener('click', startGame);
muteButton.addEventListener('click', toggleMute);
finishRunButton.addEventListener('click', () => finishGame('finish'));
rankForm.addEventListener('submit', handleRankSubmit);
clearRankingButton.addEventListener('click', clearRankings);

resetGame();
renderRankings();
drawGame();
updateSoundUi();
