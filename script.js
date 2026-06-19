const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const stageText = document.getElementById('stageText');
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

const STAGES = [
  {
    level: 1,
    name: '1단계',
    duration: 15,
    label: '입문 탄막',
    patternInterval: 1.05,
    aimedInterval: 1.25,
    speedScale: 0.9,
    circleCount: 12,
    patterns: ['circle', 'aimed'],
  },
  {
    level: 2,
    name: '2단계',
    duration: 20,
    label: '압박 탄막',
    patternInterval: 0.82,
    aimedInterval: 0.95,
    speedScale: 1.12,
    circleCount: 16,
    patterns: ['circle', 'spiral', 'wall', 'aimed'],
  },
  {
    level: 3,
    name: '3단계',
    duration: 25,
    label: '최종 탄막',
    patternInterval: 0.58,
    aimedInterval: 0.68,
    speedScale: 1.35,
    circleCount: 20,
    patterns: ['circle', 'spiral', 'wall', 'rain', 'cross', 'aimed'],
  },
];

const RANKING_KEY = 'bullet-dodge-ranking-stage-v1';
const MAX_RANKING = 10;

let gameState = 'ready';
let player;
let bullets = [];
let particles = [];
let stars = [];
let stageIndex = 0;
let stageElapsed = 0;
let totalElapsed = 0;
let patternTimer = 0;
let aimedTimer = 0;
let score = 0;
let grazeCount = 0;
let lastTime = 0;
let animationId = null;
let stageBannerText = '';
let stageBannerTimer = 0;
let lastRunData = null;
let savedCurrentRun = false;
let lastShotSoundAt = 0;

let audioCtx = null;
let masterGain = null;
let bgmOscA = null;
let bgmOscB = null;
let bgmGain = null;
let isMuted = false;

function getCurrentStage() {
  return STAGES[stageIndex];
}

function resetGame() {
  player = {
    x: canvas.width / 2,
    y: canvas.height - 82,
    radius: 12,
    hitRadius: 6,
    targetX: canvas.width / 2,
    targetY: canvas.height - 82,
    invincibleTime: 1.2,
  };

  bullets = [];
  particles = [];
  stageIndex = 0;
  stageElapsed = 0;
  totalElapsed = 0;
  patternTimer = 0;
  aimedTimer = 0;
  score = 0;
  grazeCount = 0;
  lastTime = 0;
  stageBannerText = '1단계 시작';
  stageBannerTimer = 1.8;
  lastRunData = null;
  savedCurrentRun = false;

  stars = Array.from({ length: 110 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 2 + 0.5,
    speed: Math.random() * 26 + 12,
  }));

  rankForm.classList.add('hidden');
  saveRankButton.disabled = false;
  rankHelp.textContent = '점수 기준 상위 10개 기록만 저장됩니다.';
  updateHud();
}

function startGame() {
  setupAudio();
  resetGame();
  gameState = 'playing';
  overlay.classList.remove('active');
  startButton.textContent = '다시 시작';
  playStartSound();
  startBgm();

  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(gameLoop);
}

function endGame(isWin) {
  if (gameState === 'ended') return;

  gameState = 'ended';
  cancelAnimationFrame(animationId);
  stopBgm();

  const reachedStage = getCurrentStage();
  const resultText = isWin ? '승리' : '패배';

  lastRunData = {
    nickname: '',
    result: resultText,
    score: Math.floor(score),
    graze: grazeCount,
    stage: isWin ? 3 : reachedStage.level,
    elapsed: totalElapsed,
    date: new Date().toLocaleString('ko-KR'),
  };

  if (isWin) {
    panelKicker.textContent = 'ALL CLEAR';
    panelTitle.textContent = '최종 승리!';
    panelText.textContent = `3단계를 모두 돌파했습니다. 최종 점수 ${Math.floor(score)}점, Graze ${grazeCount}회입니다.`;
    playVictoryEndingSound();
  } else {
    panelKicker.textContent = 'GAME OVER';
    panelTitle.textContent = '패배!';
    panelText.textContent = `${reachedStage.name}에서 피격되었습니다. 생존 시간 ${totalElapsed.toFixed(1)}초, 점수 ${Math.floor(score)}점입니다.`;
    playDefeatEndingSound();
  }

  nicknameInput.value = '';
  rankForm.classList.remove('hidden');
  overlay.classList.add('active');
  updateHud();
}

function advanceStage() {
  const currentStage = getCurrentStage();

  score += currentStage.level * 500;

  if (stageIndex >= STAGES.length - 1) {
    endGame(true);
    return;
  }

  stageIndex += 1;
  stageElapsed = 0;
  patternTimer = 0;
  aimedTimer = 0;
  bullets = [];
  player.invincibleTime = 1.4;
  stageBannerText = `${getCurrentStage().name} 시작`;
  stageBannerTimer = 2;
  playStageUpSound();
  updateHud();
}

function updateHud() {
  const currentStage = getCurrentStage();
  const remainTime = Math.max(0, currentStage.duration - stageElapsed);

  stageText.textContent = currentStage.level;
  timeText.textContent = remainTime.toFixed(1);
  scoreText.textContent = Math.floor(score);
  grazeText.textContent = grazeCount;
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
    rotation: Math.random() * Math.PI * 2,
    grazed: false,
  });
}

function createPattern() {
  const stage = getCurrentStage();
  const patternName = stage.patterns[Math.floor(Math.random() * stage.patterns.length)];

  if (patternName === 'circle') createCirclePattern();
  if (patternName === 'spiral') createSpiralPattern();
  if (patternName === 'wall') createWallPattern();
  if (patternName === 'rain') createRainPattern();
  if (patternName === 'cross') createCrossPattern();
  if (patternName === 'aimed') createAimedBurst(stage.level);

  playShotSound();
}

function createCirclePattern() {
  const stage = getCurrentStage();
  const centerX = canvas.width / 2 + Math.sin(totalElapsed * 1.2) * 90;
  const centerY = canvas.height / 2 + Math.cos(totalElapsed * 0.9) * 50;
  const count = stage.circleCount;
  const speed = 95 * stage.speedScale + stage.level * 12;
  const offset = totalElapsed * (0.6 + stage.level * 0.22);

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + offset;
    createBullet(
      centerX,
      centerY,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      stage.level === 3 ? 5.7 : 6.5,
      '#ff6bba',
      'rgba(255, 107, 186, 0.75)'
    );
  }
}

function createSpiralPattern() {
  const stage = getCurrentStage();
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const arms = stage.level === 2 ? 4 : 6;
  const speed = 112 * stage.speedScale;

  for (let i = 0; i < arms; i++) {
    const angle = totalElapsed * (2.3 + stage.level * 0.34) + (Math.PI * 2 / arms) * i;
    createBullet(
      centerX,
      centerY,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      5.5,
      '#8ea2ff',
      'rgba(142, 162, 255, 0.75)'
    );
  }
}

function createWallPattern() {
  const stage = getCurrentStage();
  const fromLeft = Math.random() > 0.5;
  const x = fromLeft ? -24 : canvas.width + 24;
  const dir = fromLeft ? 1 : -1;
  const gapY = 85 + Math.random() * (canvas.height - 170);
  const speed = 95 * stage.speedScale + stage.level * 12;
  const spacing = stage.level === 3 ? 28 : 34;
  const gapSize = stage.level === 3 ? 46 : 58;

  for (let y = 32; y < canvas.height; y += spacing) {
    if (Math.abs(y - gapY) < gapSize) continue;

    createBullet(
      x,
      y,
      dir * speed,
      Math.sin(y * 0.04 + totalElapsed) * 24,
      6.2,
      '#ffd166',
      'rgba(255, 209, 102, 0.75)'
    );
  }
}

function createRainPattern() {
  const stage = getCurrentStage();
  const count = 7 + stage.level * 2;
  const speed = 130 * stage.speedScale;

  for (let i = 0; i < count; i++) {
    const x = Math.random() * canvas.width;
    const angle = Math.PI / 2 + (Math.random() - 0.5) * 0.42;

    createBullet(
      x,
      -24,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      5.2,
      '#4df3ff',
      'rgba(77, 243, 255, 0.75)'
    );
  }
}

function createCrossPattern() {
  const stage = getCurrentStage();
  const points = [
    { x: -20, y: -20 },
    { x: canvas.width + 20, y: -20 },
    { x: canvas.width + 20, y: canvas.height + 20 },
    { x: -20, y: canvas.height + 20 },
  ];
  const targetX = canvas.width / 2 + Math.sin(totalElapsed * 2) * 120;
  const targetY = canvas.height / 2 + Math.cos(totalElapsed * 2) * 80;
  const speed = 145 * stage.speedScale;

  points.forEach((point) => {
    const dx = targetX - point.x;
    const dy = targetY - point.y;
    const distance = Math.hypot(dx, dy) || 1;

    createBullet(
      point.x,
      point.y,
      dx / distance * speed,
      dy / distance * speed,
      5.4,
      '#b388ff',
      'rgba(179, 136, 255, 0.75)'
    );
  });
}

function createAimedBurst(amount) {
  for (let i = 0; i < amount; i++) {
    createAimedBullet(i, amount);
  }
}

function createAimedBullet(index = 0, total = 1) {
  const stage = getCurrentStage();
  const side = Math.floor(Math.random() * 4);
  let x;
  let y;

  if (side === 0) {
    x = Math.random() * canvas.width;
    y = -24;
  } else if (side === 1) {
    x = canvas.width + 24;
    y = Math.random() * canvas.height;
  } else if (side === 2) {
    x = Math.random() * canvas.width;
    y = canvas.height + 24;
  } else {
    x = -24;
    y = Math.random() * canvas.height;
  }

  const spread = (index - (total - 1) / 2) * 0.13;
  const baseAngle = Math.atan2(player.y - y, player.x - x) + spread;
  const speed = 130 * stage.speedScale + stage.level * 14;

  createBullet(
    x,
    y,
    Math.cos(baseAngle) * speed,
    Math.sin(baseAngle) * speed,
    5.6,
    '#4df3ff',
    'rgba(77, 243, 255, 0.75)'
  );
}

function createHitParticles(x, y, color = '#ffffff') {
  for (let i = 0; i < 28; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 220;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.72,
      maxLife: 0.72,
      radius: 2 + Math.random() * 3.2,
      color,
    });
  }
}

function updateGame(deltaTime) {
  const stage = getCurrentStage();

  totalElapsed += deltaTime;
  stageElapsed += deltaTime;
  patternTimer += deltaTime;
  aimedTimer += deltaTime;
  stageBannerTimer = Math.max(0, stageBannerTimer - deltaTime);

  if (stageElapsed >= stage.duration) {
    advanceStage();
    return;
  }

  score += deltaTime * (15 + stage.level * 12);

  if (patternTimer >= stage.patternInterval) {
    patternTimer = 0;
    createPattern();
  }

  if (aimedTimer >= stage.aimedInterval) {
    aimedTimer = 0;
    createAimedBurst(stage.level);
    playShotSound();
  }

  player.x += (player.targetX - player.x) * Math.min(1, deltaTime * 14);
  player.y += (player.targetY - player.y) * Math.min(1, deltaTime * 14);
  player.invincibleTime = Math.max(0, player.invincibleTime - deltaTime);

  updateStars(deltaTime);
  updateBullets(deltaTime);
  updateParticles(deltaTime);
  updateHud();
}

function updateStars(deltaTime) {
  const stage = getCurrentStage();

  stars.forEach((star) => {
    star.y += (star.speed + stage.level * 8) * deltaTime;

    if (star.y > canvas.height) {
      star.y = -5;
      star.x = Math.random() * canvas.width;
    }
  });
}

function updateBullets(deltaTime) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.x += bullet.vx * deltaTime;
    bullet.y += bullet.vy * deltaTime;
    bullet.rotation += deltaTime * 4;

    const distance = Math.hypot(player.x - bullet.x, player.y - bullet.y);

    if (!bullet.grazed && distance < player.radius + bullet.radius + 22 && distance > player.hitRadius + bullet.radius) {
      bullet.grazed = true;
      grazeCount += 1;
      score += 80 + getCurrentStage().level * 35;
      createHitParticles(bullet.x, bullet.y, bullet.color);
      playGrazeSound();
    }

    if (player.invincibleTime <= 0 && distance < player.hitRadius + bullet.radius) {
      createHitParticles(player.x, player.y, '#ff5fb7');
      playHitSound();
      endGame(false);
      return;
    }

    if (
      bullet.x < -90 ||
      bullet.x > canvas.width + 90 ||
      bullet.y < -90 ||
      bullet.y > canvas.height + 90
    ) {
      bullets.splice(i, 1);
    }
  }
}

function updateParticles(deltaTime) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    particle.x += particle.vx * deltaTime;
    particle.y += particle.vy * deltaTime;
    particle.vx *= 0.985;
    particle.vy *= 0.985;
    particle.life -= deltaTime;

    if (particle.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function drawGame() {
  drawBackground();
  drawStars();
  drawStageGuide();
  drawBullets();
  drawParticles();
  drawPlayer();
  drawStageBanner();
}

function drawBackground() {
  const stage = getCurrentStage();
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);

  if (stage.level === 1) {
    gradient.addColorStop(0, '#081026');
    gradient.addColorStop(1, '#050712');
  } else if (stage.level === 2) {
    gradient.addColorStop(0, '#111034');
    gradient.addColorStop(1, '#080716');
  } else {
    gradient.addColorStop(0, '#1c0b2d');
    gradient.addColorStop(1, '#060510');
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.globalAlpha = 0.08 + stage.level * 0.02;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;

  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawStars() {
  ctx.save();
  ctx.fillStyle = 'rgba(220, 230, 255, 0.8)';

  stars.forEach((star) => {
    ctx.globalAlpha = 0.28 + star.size * 0.18;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawStageGuide() {
  const stage = getCurrentStage();
  const progress = stageElapsed / stage.duration;
  const barWidth = canvas.width * progress;

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(0, 0, canvas.width, 7);

  ctx.fillStyle = stage.level === 1 ? '#8ea2ff' : stage.level === 2 ? '#ffd166' : '#ff5fb7';
  ctx.fillRect(0, 0, barWidth, 7);

  ctx.font = '700 13px Arial';
  ctx.fillStyle = 'rgba(244, 247, 255, 0.7)';
  ctx.fillText(`${stage.name} · ${stage.label}`, 16, 28);
  ctx.restore();
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-bullet.radius * 0.7, 0);
    ctx.lineTo(bullet.radius * 0.7, 0);
    ctx.stroke();

    ctx.restore();
  });
}

function drawParticles() {
  particles.forEach((particle) => {
    const alpha = particle.life / particle.maxLife;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawPlayer() {
  if (!player) return;

  const blink = player.invincibleTime > 0 && Math.floor(totalElapsed * 12) % 2 === 0;

  ctx.save();
  ctx.translate(player.x, player.y);

  ctx.globalAlpha = blink ? 0.48 : 1;
  ctx.shadowBlur = 24;
  ctx.shadowColor = 'rgba(77, 243, 255, 0.9)';
  ctx.fillStyle = '#4df3ff';
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, player.hitRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, player.radius + 8, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawStageBanner() {
  if (stageBannerTimer <= 0) return;

  const alpha = Math.min(1, stageBannerTimer / 0.7);
  const stage = getCurrentStage();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(5, 7, 18, 0.62)';
  roundRect(canvas.width / 2 - 170, canvas.height / 2 - 48, 340, 96, 24);
  ctx.fill();

  ctx.fillStyle = stage.level === 1 ? '#8ea2ff' : stage.level === 2 ? '#ffd166' : '#ff5fb7';
  ctx.font = '900 34px Arial';
  ctx.fillText(stageBannerText, canvas.width / 2, canvas.height / 2 - 4);

  ctx.fillStyle = 'rgba(244, 247, 255, 0.8)';
  ctx.font = '700 14px Arial';
  ctx.fillText(stage.label, canvas.width / 2, canvas.height / 2 + 24);
  ctx.restore();
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function gameLoop(timestamp) {
  if (gameState !== 'playing') return;

  if (!lastTime) lastTime = timestamp;
  const deltaTime = Math.min((timestamp - lastTime) / 1000, 0.033);
  lastTime = timestamp;

  updateGame(deltaTime);
  drawGame();

  if (gameState === 'playing') {
    animationId = requestAnimationFrame(gameLoop);
  }
}

function loadRankings() {
  try {
    const rawData = localStorage.getItem(RANKING_KEY);
    return rawData ? JSON.parse(rawData) : [];
  } catch (error) {
    console.warn('랭킹 데이터를 불러오지 못했습니다.', error);
    return [];
  }
}

function saveRankings(rankings) {
  localStorage.setItem(RANKING_KEY, JSON.stringify(rankings));
}

function addRanking(record) {
  const rankings = loadRankings();
  const nextRankings = [...rankings, record]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.elapsed - a.elapsed;
    })
    .slice(0, MAX_RANKING);

  saveRankings(nextRankings);
  renderRankings();
}

function renderRankings() {
  const rankings = loadRankings();
  rankingList.innerHTML = '';

  if (rankings.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'empty-rank';
    emptyItem.textContent = '아직 저장된 기록이 없습니다.';
    rankingList.appendChild(emptyItem);
    return;
  }

  rankings.forEach((rank, index) => {
    const item = document.createElement('li');
    const resultIcon = rank.result === '승리' ? 'CLEAR' : 'FAIL';

    item.innerHTML = `
      <div class="rank-top">
        <span class="rank-name">#${index + 1} ${escapeHtml(rank.nickname)}</span>
        <span class="rank-score">${rank.score}점</span>
      </div>
      <div class="rank-meta">${resultIcon} · ${rank.stage}단계 · ${Number(rank.elapsed).toFixed(1)}초 · Graze ${rank.graze}회<br>${rank.date}</div>
    `;

    rankingList.appendChild(item);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function handleRankSubmit(event) {
  event.preventDefault();

  if (!lastRunData || savedCurrentRun) return;

  const nickname = nicknameInput.value.trim() || 'PLAYER';
  const record = {
    ...lastRunData,
    nickname: nickname.slice(0, 12),
  };

  addRanking(record);
  savedCurrentRun = true;
  saveRankButton.disabled = true;
  rankHelp.textContent = '기록이 저장되었습니다.';
}

function clearRankings() {
  const ok = confirm('저장된 TOP 10 기록을 모두 삭제할까요?');
  if (!ok) return;

  localStorage.removeItem(RANKING_KEY);
  renderRankings();
}

function setupAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContextClass();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = isMuted ? 0 : 1;
  masterGain.connect(audioCtx.destination);
}

function playTone(frequency, duration, type = 'sine', volume = 0.08, delay = 0) {
  if (isMuted) return;
  setupAudio();

  const startAt = audioCtx.currentTime + delay;
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.04);
}

function playNoise(duration, volume = 0.07) {
  if (isMuted) return;
  setupAudio();

  const sampleRate = audioCtx.sampleRate;
  const bufferSize = sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();

  gain.gain.value = volume;
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(masterGain);
  source.start();
}

function startBgm() {
  if (isMuted) return;
  setupAudio();
  stopBgm();

  bgmOscA = audioCtx.createOscillator();
  bgmOscB = audioCtx.createOscillator();
  bgmGain = audioCtx.createGain();

  bgmOscA.type = 'triangle';
  bgmOscB.type = 'sawtooth';
  bgmOscA.frequency.value = 55;
  bgmOscB.frequency.value = 110;
  bgmGain.gain.value = 0.018;

  bgmOscA.connect(bgmGain);
  bgmOscB.connect(bgmGain);
  bgmGain.connect(masterGain);

  bgmOscA.start();
  bgmOscB.start();
}

function stopBgm() {
  [bgmOscA, bgmOscB].forEach((oscillator) => {
    if (!oscillator) return;
    try {
      oscillator.stop();
    } catch (error) {
      // 이미 정지된 오실레이터는 무시합니다.
    }
  });

  bgmOscA = null;
  bgmOscB = null;
  bgmGain = null;
}

function playStartSound() {
  playTone(330, 0.08, 'square', 0.08);
  playTone(660, 0.12, 'square', 0.08, 0.08);
}

function playShotSound() {
  const now = performance.now();
  if (now - lastShotSoundAt < 110) return;
  lastShotSoundAt = now;

  playTone(880, 0.05, 'square', 0.025);
}

function playGrazeSound() {
  playTone(1240, 0.05, 'triangle', 0.045);
}

function playHitSound() {
  playNoise(0.22, 0.12);
  playTone(120, 0.24, 'sawtooth', 0.09);
}

function playStageUpSound() {
  playTone(440, 0.08, 'triangle', 0.07);
  playTone(660, 0.08, 'triangle', 0.07, 0.09);
  playTone(990, 0.16, 'triangle', 0.08, 0.18);
}

function playVictoryEndingSound() {
  playTone(523.25, 0.12, 'triangle', 0.09);
  playTone(659.25, 0.12, 'triangle', 0.09, 0.12);
  playTone(783.99, 0.16, 'triangle', 0.1, 0.24);
  playTone(1046.5, 0.32, 'triangle', 0.11, 0.42);
}

function playDefeatEndingSound() {
  playTone(220, 0.16, 'sawtooth', 0.09);
  playTone(174.61, 0.18, 'sawtooth', 0.08, 0.15);
  playTone(130.81, 0.36, 'sawtooth', 0.08, 0.32);
  playNoise(0.18, 0.07);
}

function toggleMute() {
  isMuted = !isMuted;

  if (masterGain) {
    masterGain.gain.value = isMuted ? 0 : 1;
  }

  if (isMuted) {
    stopBgm();
  } else if (gameState === 'playing') {
    setupAudio();
    startBgm();
  }

  muteButton.textContent = isMuted ? '사운드 켜기' : '사운드 끄기';
  soundIndicator.textContent = isMuted ? 'SOUND OFF' : 'SOUND ON';
}

canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
startButton.addEventListener('click', startGame);
muteButton.addEventListener('click', toggleMute);
rankForm.addEventListener('submit', handleRankSubmit);
clearRankingButton.addEventListener('click', clearRankings);

resetGame();
drawGame();
renderRankings();
