const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const timeText = document.getElementById('timeText');
const scoreText = document.getElementById('scoreText');
const grazeText = document.getElementById('grazeText');
const overlay = document.getElementById('overlay');
const panelKicker = document.getElementById('panelKicker');
const panelTitle = document.getElementById('panelTitle');
const panelText = document.getElementById('panelText');
const startButton = document.getElementById('startButton');
const muteButton = document.getElementById('muteButton');
const soundIndicator = document.getElementById('soundIndicator');
const rankForm = document.getElementById('rankForm');
const nicknameInput = document.getElementById('nicknameInput');
const saveRankButton = document.getElementById('saveRankButton');
const rankHelp = document.getElementById('rankHelp');
const rankingList = document.getElementById('rankingList');
const clearRankingButton = document.getElementById('clearRankingButton');

const GAME_TIME = 45;
const GRAZE_DISTANCE = 24;
const RANKING_STORAGE_KEY = 'bulletDodgeRankingV2';
const MAX_RANKING_COUNT = 10;

let gameState = 'ready';
let player = null;
let bullets = [];
let particles = [];
let stars = [];
let elapsedTime = 0;
let score = 0;
let grazeCount = 0;
let lastTime = 0;
let patternTimer = 0;
let aimedTimer = 0;
let difficultyTimer = 0;
let difficulty = 1;
let animationId = null;
let lastShotSoundTime = 0;
let lastGrazeSoundTime = 0;
let pendingRankLog = null;
let hasSavedCurrentLog = false;

let audioContext = null;
let masterGain = null;
let bgmGain = null;
let bgmOscillator = null;
let bgmLfo = null;
let bgmLfoGain = null;
let isMuted = false;

function initAudio() {
  if (audioContext) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  audioContext = new AudioContextClass();
  masterGain = audioContext.createGain();
  masterGain.gain.value = isMuted ? 0 : 0.42;
  masterGain.connect(audioContext.destination);
}

function resumeAudio() {
  initAudio();

  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function setMasterVolume(value, duration = 0.04) {
  if (!audioContext || !masterGain) return;

  const now = audioContext.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
  masterGain.gain.linearRampToValueAtTime(isMuted ? 0 : value, now + duration);
}

function updateSoundUI() {
  soundIndicator.textContent = isMuted ? 'SOUND OFF' : 'SOUND ON';
  muteButton.textContent = isMuted ? '사운드 켜기' : '사운드 끄기';

  if (audioContext && masterGain) {
    setMasterVolume(0.42, 0.08);
  }
}

function createTone({ frequency, type = 'sine', start = 0, duration = 0.18, volume = 0.2, destination = masterGain }) {
  if (!audioContext || !destination || isMuted) return;

  const startTime = audioContext.currentTime + start;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.03);
}

function createNoise({ start = 0, duration = 0.22, volume = 0.22, filterFrequency = 900 }) {
  if (!audioContext || !masterGain || isMuted) return;

  const startTime = audioContext.currentTime + start;
  const sampleRate = audioContext.sampleRate;
  const frameCount = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = audioContext.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < frameCount; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();

  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFrequency, startTime);

  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start(startTime);
}

function playStartSound() {
  createTone({ frequency: 440, type: 'triangle', start: 0, duration: 0.1, volume: 0.15 });
  createTone({ frequency: 660, type: 'triangle', start: 0.08, duration: 0.12, volume: 0.18 });
  createTone({ frequency: 880, type: 'triangle', start: 0.17, duration: 0.18, volume: 0.2 });
}

function playShotSound() {
  if (!audioContext || isMuted) return;

  const now = audioContext.currentTime;
  if (now - lastShotSoundTime < 0.11) return;
  lastShotSoundTime = now;

  createTone({ frequency: 760 + Math.random() * 90, type: 'square', duration: 0.045, volume: 0.045 });
}

function playGrazeSound() {
  if (!audioContext || isMuted) return;

  const now = audioContext.currentTime;
  if (now - lastGrazeSoundTime < 0.055) return;
  lastGrazeSoundTime = now;

  createTone({ frequency: 1180 + Math.random() * 240, type: 'sine', duration: 0.07, volume: 0.055 });
}

function playVictoryEndingSound() {
  stopBgm();
  setMasterVolume(0.5, 0.04);

  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((note, index) => {
    createTone({
      frequency: note,
      type: 'triangle',
      start: index * 0.12,
      duration: 0.28,
      volume: 0.18,
    });
  });

  createTone({ frequency: 1318.51, type: 'sine', start: 0.52, duration: 0.42, volume: 0.15 });
  createTone({ frequency: 1567.98, type: 'sine', start: 0.62, duration: 0.34, volume: 0.12 });
  createTone({ frequency: 2093, type: 'sine', start: 0.74, duration: 0.28, volume: 0.08 });
}

function playDefeatEndingSound() {
  stopBgm();
  setMasterVolume(0.5, 0.04);

  createNoise({ duration: 0.28, volume: 0.24, filterFrequency: 520 });

  const notes = [392, 329.63, 261.63, 196, 130.81];
  notes.forEach((note, index) => {
    createTone({
      frequency: note,
      type: 'sawtooth',
      start: 0.08 + index * 0.16,
      duration: 0.24,
      volume: 0.13,
    });
  });

  createTone({ frequency: 65.41, type: 'sine', start: 0.72, duration: 0.5, volume: 0.18 });
}

function startBgm() {
  if (!audioContext || !masterGain || isMuted || bgmOscillator) return;

  bgmGain = audioContext.createGain();
  bgmGain.gain.value = 0.025;

  bgmOscillator = audioContext.createOscillator();
  bgmOscillator.type = 'sawtooth';
  bgmOscillator.frequency.value = 110;

  bgmLfo = audioContext.createOscillator();
  bgmLfo.type = 'sine';
  bgmLfo.frequency.value = 5.2;

  bgmLfoGain = audioContext.createGain();
  bgmLfoGain.gain.value = 18;

  bgmLfo.connect(bgmLfoGain);
  bgmLfoGain.connect(bgmOscillator.frequency);
  bgmOscillator.connect(bgmGain);
  bgmGain.connect(masterGain);

  bgmOscillator.start();
  bgmLfo.start();
}

function stopBgm() {
  if (bgmOscillator) {
    bgmOscillator.stop();
    bgmOscillator.disconnect();
    bgmOscillator = null;
  }

  if (bgmLfo) {
    bgmLfo.stop();
    bgmLfo.disconnect();
    bgmLfo = null;
  }

  if (bgmLfoGain) {
    bgmLfoGain.disconnect();
    bgmLfoGain = null;
  }

  if (bgmGain) {
    bgmGain.disconnect();
    bgmGain = null;
  }
}

function getRankings() {
  try {
    const saved = localStorage.getItem(RANKING_STORAGE_KEY);
    const rankings = saved ? JSON.parse(saved) : [];
    return Array.isArray(rankings) ? rankings : [];
  } catch (error) {
    console.warn('랭킹 데이터를 불러오지 못했습니다.', error);
    return [];
  }
}

function saveRankings(rankings) {
  try {
    localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(rankings));
  } catch (error) {
    console.warn('랭킹 데이터를 저장하지 못했습니다.', error);
  }
}

function sortAndLimitRankings(rankings) {
  return rankings
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.survivalTime !== a.survivalTime) return b.survivalTime - a.survivalTime;
      if (b.grazeCount !== a.grazeCount) return b.grazeCount - a.grazeCount;
      return b.createdAt - a.createdAt;
    })
    .slice(0, MAX_RANKING_COUNT);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function renderRankingList() {
  const rankings = sortAndLimitRankings(getRankings());
  rankingList.innerHTML = '';

  if (rankings.length === 0) {
    rankingList.innerHTML = '<li class="ranking-empty">아직 저장된 기록이 없습니다.</li>';
    return;
  }

  rankings.forEach((ranking, index) => {
    const listItem = document.createElement('li');
    const resultClass = ranking.result === 'WIN' ? 'win' : 'lose';
    const resultText = ranking.result === 'WIN' ? '승리' : '패배';
    const nickname = escapeHtml(ranking.nickname || 'PLAYER');
    const safeScore = Number(ranking.score || 0);
    const safeSurvivalTime = Number(ranking.survivalTime || 0);
    const safeGrazeCount = Number(ranking.grazeCount || 0);

    listItem.className = 'ranking-item';
    listItem.innerHTML = `
      <span class="ranking-rank">${index + 1}</span>
      <div class="ranking-content">
        <div class="ranking-name-row">
          <span class="ranking-name">${nickname}</span>
          <span class="result-badge ${resultClass}">${resultText}</span>
        </div>
        <div class="ranking-score-row">
          <span class="ranking-meta">${safeSurvivalTime.toFixed(1)}초 · G ${safeGrazeCount}</span>
          <strong class="ranking-score">${safeScore}점</strong>
        </div>
        <div class="ranking-meta">${formatDate(ranking.createdAt || Date.now())}</div>
      </div>
    `;

    rankingList.appendChild(listItem);
  });
}

function createPendingRankLog(isWin) {
  return {
    result: isWin ? 'WIN' : 'LOSE',
    score,
    survivalTime: Number(Math.min(elapsedTime, GAME_TIME).toFixed(1)),
    grazeCount,
    createdAt: Date.now(),
  };
}

function showRankForm() {
  rankForm.classList.remove('hidden');
  rankForm.reset();
  nicknameInput.disabled = false;
  saveRankButton.disabled = false;
  rankHelp.textContent = '점수 기준 상위 10개 기록만 저장됩니다.';

  window.setTimeout(() => {
    nicknameInput.focus();
  }, 100);
}

function hideRankForm() {
  rankForm.classList.add('hidden');
  rankForm.reset();
  rankHelp.textContent = '점수 기준 상위 10개 기록만 저장됩니다.';
}

function saveCurrentRankLog(event) {
  event.preventDefault();

  if (!pendingRankLog || hasSavedCurrentLog) return;

  const nickname = nicknameInput.value.trim() || 'PLAYER';
  const newRanking = {
    ...pendingRankLog,
    nickname: nickname.slice(0, 12),
  };

  const rankings = sortAndLimitRankings([...getRankings(), newRanking]);
  saveRankings(rankings);
  renderRankingList();

  hasSavedCurrentLog = true;
  nicknameInput.disabled = true;
  saveRankButton.disabled = true;
  rankHelp.textContent = '기록이 저장되었습니다. 다시 플레이하면 새 기록을 남길 수 있습니다.';
}

function clearRankingLogs() {
  if (getRankings().length === 0) return;

  const isConfirmed = window.confirm('저장된 랭킹 기록을 모두 삭제할까요?');
  if (!isConfirmed) return;

  try {
    localStorage.removeItem(RANKING_STORAGE_KEY);
  } catch (error) {
    console.warn('랭킹 데이터를 삭제하지 못했습니다.', error);
  }

  renderRankingList();
}

function resetGame() {
  player = {
    x: canvas.width / 2,
    y: canvas.height - 90,
    radius: 11,
    hitRadius: 6,
    targetX: canvas.width / 2,
    targetY: canvas.height - 90,
    invincibleTime: 1.2,
  };

  bullets = [];
  particles = [];
  elapsedTime = 0;
  score = 0;
  grazeCount = 0;
  lastTime = 0;
  patternTimer = 0;
  aimedTimer = 0;
  difficultyTimer = 0;
  difficulty = 1;
  lastShotSoundTime = 0;
  lastGrazeSoundTime = 0;

  stars = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 2 + 0.5,
    speed: Math.random() * 24 + 12,
  }));

  updateHud();
}

function startGame() {
  resumeAudio();
  playStartSound();
  stopBgm();
  startBgm();
  hideRankForm();
  pendingRankLog = null;
  hasSavedCurrentLog = false;

  resetGame();
  gameState = 'playing';
  overlay.classList.remove('active');
  startButton.textContent = '다시 시작';

  if (animationId) {
    cancelAnimationFrame(animationId);
  }

  animationId = requestAnimationFrame(gameLoop);
}

function endGame(isWin) {
  if (gameState === 'end') return;

  gameState = 'end';

  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  pendingRankLog = createPendingRankLog(isWin);
  hasSavedCurrentLog = false;

  if (isWin) {
    playVictoryEndingSound();
    panelKicker.textContent = 'MISSION CLEAR';
    panelTitle.textContent = '승리!';
    panelText.textContent = `45초 동안 살아남았습니다. 최종 점수: ${score} / Graze: ${grazeCount}`;
  } else {
    playDefeatEndingSound();
    panelKicker.textContent = 'GAME OVER';
    panelTitle.textContent = '패배!';
    panelText.textContent = `탄막에 피격되었습니다. 생존 시간: ${elapsedTime.toFixed(1)}초 / 점수: ${score} / Graze: ${grazeCount}`;
  }

  showRankForm();
  renderRankingList();
  overlay.classList.add('active');
}

function updateHud() {
  const remainTime = Math.max(0, GAME_TIME - elapsedTime);
  timeText.textContent = remainTime.toFixed(1);
  scoreText.textContent = String(score);
  grazeText.textContent = String(grazeCount);
}

function getPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function movePlayerTo(x, y) {
  if (!player) return;

  player.targetX = Math.max(player.radius, Math.min(canvas.width - player.radius, x));
  player.targetY = Math.max(player.radius, Math.min(canvas.height - player.radius, y));
}

function handleMouseMove(event) {
  if (gameState !== 'playing') return;

  const pos = getPointerPosition(event);
  movePlayerTo(pos.x, pos.y);
}

function handleTouchMove(event) {
  if (gameState !== 'playing') return;

  event.preventDefault();
  const touch = event.touches[0];
  if (!touch) return;

  const pos = getPointerPosition(touch);
  movePlayerTo(pos.x, pos.y);
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
    grazed: false,
    rotation: Math.random() * Math.PI * 2,
  });
}

function createCirclePattern() {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const count = Math.floor(14 + difficulty * 2);
  const speed = 80 + difficulty * 14;
  const offset = elapsedTime * 0.7;

  for (let i = 0; i < count; i += 1) {
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
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const arms = 4;
  const speed = 110 + difficulty * 12;

  for (let i = 0; i < arms; i += 1) {
    const angle = elapsedTime * 3 + (Math.PI * 2 / arms) * i;
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
  const fromLeft = Math.random() > 0.5;
  const x = fromLeft ? -20 : canvas.width + 20;
  const dir = fromLeft ? 1 : -1;
  const gapY = 90 + Math.random() * (canvas.height - 180);
  const speed = 90 + difficulty * 14;

  for (let y = 35; y < canvas.height; y += 34) {
    if (Math.abs(y - gapY) < 58) continue;

    createBullet(
      x,
      y,
      dir * speed,
      Math.sin(y * 0.03) * 18,
      7,
      '#ffd166',
      'rgba(255, 209, 102, 0.75)'
    );
  }

  playShotSound();
}

function createAimedBullet() {
  if (!player) return;

  const side = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;

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
  const speed = 120 + difficulty * 16;

  createBullet(
    x,
    y,
    dx / distance * speed,
    dy / distance * speed,
    6,
    '#4df3ff',
    'rgba(77, 243, 255, 0.75)'
  );
}

function createHitParticles(x, y) {
  for (let i = 0; i < 26; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 210;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.75,
      maxLife: 0.75,
      radius: 2 + Math.random() * 3.2,
      color: Math.random() > 0.45 ? '#ffffff' : '#ff6bba',
    });
  }
}

function createGrazeParticles(x, y) {
  for (let i = 0; i < 4; i += 1) {
    particles.push({
      x: x + (Math.random() - 0.5) * 18,
      y: y + (Math.random() - 0.5) * 18,
      vx: (Math.random() - 0.5) * 80,
      vy: (Math.random() - 0.5) * 80,
      life: 0.28,
      maxLife: 0.28,
      radius: 1.2 + Math.random() * 1.8,
      color: '#73f7ff',
    });
  }
}

function updateGame(deltaTime) {
  elapsedTime += deltaTime;
  patternTimer += deltaTime;
  aimedTimer += deltaTime;
  difficultyTimer += deltaTime;

  if (elapsedTime >= GAME_TIME) {
    elapsedTime = GAME_TIME;
    score = Math.floor(elapsedTime * 100 + grazeCount * 75);
    updateHud();
    endGame(true);
    return;
  }

  if (difficultyTimer >= 5) {
    difficultyTimer = 0;
    difficulty += 0.35;
  }

  player.invincibleTime = Math.max(0, player.invincibleTime - deltaTime);
  player.x += (player.targetX - player.x) * 0.25;
  player.y += (player.targetY - player.y) * 0.25;

  if (patternTimer >= Math.max(0.72, 1.45 - difficulty * 0.08)) {
    patternTimer = 0;

    const random = Math.random();
    if (random < 0.42) {
      createCirclePattern();
    } else if (random < 0.78) {
      createSpiralPattern();
    } else {
      createWallPattern();
    }
  }

  if (aimedTimer >= Math.max(0.32, 0.8 - difficulty * 0.045)) {
    aimedTimer = 0;
    createAimedBullet();
  }

  bullets.forEach((bullet) => {
    bullet.x += bullet.vx * deltaTime;
    bullet.y += bullet.vy * deltaTime;
    bullet.rotation += deltaTime * 5;
  });

  bullets = bullets.filter((bullet) => (
    bullet.x > -80 &&
    bullet.x < canvas.width + 80 &&
    bullet.y > -80 &&
    bullet.y < canvas.height + 80
  ));

  particles.forEach((particle) => {
    particle.x += particle.vx * deltaTime;
    particle.y += particle.vy * deltaTime;
    particle.life -= deltaTime;
  });

  particles = particles.filter((particle) => particle.life > 0);

  stars.forEach((star) => {
    star.y += star.speed * deltaTime;
    if (star.y > canvas.height) {
      star.x = Math.random() * canvas.width;
      star.y = -5;
    }
  });

  checkCollisionAndGraze();
  score = Math.floor(elapsedTime * 100 + grazeCount * 75);
  updateHud();
}

function checkCollisionAndGraze() {
  if (!player || player.invincibleTime > 0) return;

  for (const bullet of bullets) {
    const distance = Math.hypot(player.x - bullet.x, player.y - bullet.y);

    if (distance < player.hitRadius + bullet.radius) {
      createHitParticles(player.x, player.y);
      drawGame();
      endGame(false);
      return;
    }

    if (!bullet.grazed && distance < player.hitRadius + bullet.radius + GRAZE_DISTANCE) {
      bullet.grazed = true;
      grazeCount += 1;
      createGrazeParticles(player.x, player.y);
      playGrazeSound();
    }
  }
}

function drawBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    80,
    canvas.width / 2,
    canvas.height / 2,
    620
  );
  gradient.addColorStop(0, '#111a3c');
  gradient.addColorStop(1, '#040611');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  stars.forEach((star) => {
    ctx.globalAlpha = 0.25 + star.size * 0.2;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, bullet.radius * 0.48, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  });
}

function drawPlayer() {
  if (!player) return;

  const blink = player.invincibleTime > 0 && Math.floor(player.invincibleTime * 12) % 2 === 0;
  if (blink) return;

  ctx.save();
  ctx.translate(player.x, player.y);

  ctx.shadowBlur = 22;
  ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -player.radius - 4);
  ctx.lineTo(player.radius + 5, player.radius + 6);
  ctx.lineTo(0, player.radius);
  ctx.lineTo(-player.radius - 5, player.radius + 6);
  ctx.closePath();
  ctx.fill();

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
    ctx.fillStyle = particle.color || '#ffffff';
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawWarningText() {
  if (!player || player.invincibleTime <= 0 || gameState !== 'playing') return;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.font = '18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('무적 시간', canvas.width / 2, 36);
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

  if (gameState === 'playing') {
    animationId = requestAnimationFrame(gameLoop);
  }
}

function toggleMute() {
  resumeAudio();
  isMuted = !isMuted;

  if (isMuted) {
    stopBgm();
  } else if (gameState === 'playing') {
    startBgm();
  }

  updateSoundUI();
}

canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
startButton.addEventListener('click', startGame);
muteButton.addEventListener('click', toggleMute);
rankForm.addEventListener('submit', saveCurrentRankLog);
clearRankingButton.addEventListener('click', clearRankingLogs);

resetGame();
updateSoundUI();
renderRankingList();
drawGame();
