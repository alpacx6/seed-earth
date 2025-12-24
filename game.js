// game.js (type="module")
import { baseStages7, rand } from "./stages.js";

/**
 * 이 game.js는 다음을 포함:
 * - (2번 사진) UI 레이아웃과 연결되는 DOM id 전부 반영
 * - 100vh 스크롤 없는 전체 화면 구성(canvas가 gameFrame을 꽉 채움)
 * - Stage1~7 스테이지 데이터(stages.js) 사용
 * - 씨앗 획득(Seed spot) + E 심기 + F 물주기 + 성장 모션
 * - 성장 완료 시: 빛 파동(ripple) + 초록 파티클
 * - 토네이도 장애물: obstacles/tornado.png 이미지로 생성(스테이지4 windZones)
 * - 시작 화면(ui/start_bg.png) / 엔딩 화면(ui/end_bg.png)
 * - Stage7 클리어 → 엔딩 화면
 * - 대화 시스템(간단 내장): 대사마다 avatar 이미지 변경 가능
 */

console.log("game.js LOADED (Final UI + Stage7 + Start/End + Particles)");

/* =========================
   DOM
========================= */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const elStage = document.getElementById("stage");
const elHp = document.getElementById("hp");
const elMaxHp = document.getElementById("maxHp");
const elO2 = document.getElementById("o2");
const elMaxO2 = document.getElementById("maxO2");
const elSeedInv = document.getElementById("seedInv");
const elPlanted = document.getElementById("planted");
const elTotal = document.getElementById("total");
const elScore = document.getElementById("score");

const ownedCardsEl = document.getElementById("ownedCards");
const hintEl = document.getElementById("hint");
const stageRuleOverlay = document.getElementById("stageRuleOverlay");

const warnOverlay = document.getElementById("warnOverlay");

const loading = document.getElementById("loading");
const loadingText = document.getElementById("loadingText");

const cardOverlay = document.getElementById("cardOverlay");
const cardRow = document.getElementById("cardRow");
const cardTimerEl = document.getElementById("cardTimer");
const cardTitleEl = document.getElementById("cardTitle");

const startScreen = document.getElementById("startScreen");
const endScreen = document.getElementById("endScreen");
const btnStart = document.getElementById("btnStart");
const btnRestart = document.getElementById("btnRestart");
const endText = document.getElementById("endText");

const dialogue = document.getElementById("dialogue");
const dlgAvatar = document.getElementById("dlgAvatar");
const dlgAvatarFallback = document.getElementById("dlgAvatarFallback");
const dlgNameEl = document.getElementById("dlgName");
const dlgRoleEl = document.getElementById("dlgRole");
const dlgTextEl = document.getElementById("dlgText");
const dlgNextEl = document.getElementById("dlgNext");
const dlgAutoBtn = document.getElementById("dlgAutoBtn");
const dlgSkipBtn = document.getElementById("dlgSkipBtn");

/* =========================
   Assets
========================= */
function loadImage(src){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=> resolve({ ok:true, img, src });
    img.onerror = ()=> resolve({ ok:false, img:null, src });
    img.src = src;
  });
}

const ASSETS = {
  robot: "./robot.png",
  seed: "./items/seed.png",
  tornado: "./obstacles/tornado.png",
  stageBgs: [
    "./background/stage1.png",
    "./background/stage2.png",
    "./background/stage3.png",
    "./background/stage4.png",
    "./background/stage5.png",
    "./background/stage6.png",
    "./background/stage7.png",
  ],
  // avatars: 대사마다 바꿀 수 있게 기본만 둠 (추가 가능)
  avatars: {
    unknown: "./avatars/unknown_avatar.png",
    robot: "./avatars/robot_avatar.png",
    // 예: researcher1: "./avatars/researcher1.png"
  }
};

const IMG = {
  robot: null,
  seed: null,
  tornado: null,
  stageBgs: new Array(7).fill(null),
  avatars: {},
};

async function preloadAll(){
  loading.classList.add("is-open");
  loadingText.textContent = "Loading images…";

  const tasks = [];
  tasks.push(loadImage(ASSETS.robot));
  tasks.push(loadImage(ASSETS.seed));
  tasks.push(loadImage(ASSETS.tornado));
  for (let i=0;i<ASSETS.stageBgs.length;i++){
    tasks.push(loadImage(ASSETS.stageBgs[i]));
  }
  for (const [k, v] of Object.entries(ASSETS.avatars)){
    tasks.push(loadImage(v).then(r=>({ ...r, key:k })));
  }

  const results = await Promise.all(tasks);

  // assign
  for (const r of results){
    if (!r.ok) continue;
    if (r.src === ASSETS.robot) IMG.robot = r.img;
    else if (r.src === ASSETS.seed) IMG.seed = r.img;
    else if (r.src === ASSETS.tornado) IMG.tornado = r.img;
    else {
      const bgIdx = ASSETS.stageBgs.indexOf(r.src);
      if (bgIdx >= 0) IMG.stageBgs[bgIdx] = r.img;
      if (typeof r.key === "string") IMG.avatars[r.key] = r.img;
    }
  }

  loading.classList.remove("is-open");
}

/* =========================
   Canvas Fit (스크롤 없이 꽉 차게)
========================= */
function fitCanvas(){
  const rect = canvas.getBoundingClientRect();
  // devicePixelRatio 반영
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener("resize", fitCanvas);

/* =========================
   Game State
========================= */
const stages = baseStages7();

const GRAV = 1800; // px/s^2
const GROUND_Y = 440; // world 기준 바닥(대충)
const CAM_PAD_TOP = 0;

let gameStarted = false;
let gameEnded = false;

let stageIndex = 0;
let stage = stages[0];

let timeNow = 0;

const input = {
  left:false, right:false,
  jumpPressed:false,
  plantPressed:false,
  waterPressed:false,
  restartPressed:false,
  cardPressed:false,
  autoTogglePressed:false,
  nextPressed:false,
};

function resetInputOneShots(){
  input.jumpPressed = false;
  input.plantPressed = false;
  input.waterPressed = false;
  input.restartPressed = false;
  input.cardPressed = false;
  input.autoTogglePressed = false;
  input.nextPressed = false;
}

/* =========================
   Player / Systems
========================= */
const player = {
  x: 100,
  y: 200,
  w: 52,
  h: 64,
  vx: 0,
  vy: 0,
  onGround: false,
  face: 1,
  hp: 100,
  maxHp: 100,
  o2: 50,
  maxO2: 50,
  seedInv: 0,
  planted: 0,
  score: 0,
  // 카드 효과
  speedMul: 1,
  extraJump: 0,
  extraJumpUsed: 0,
  frozenUntil: 0,
  stunnedUntil: 0,
};

let camX = 0;

/* ===== seeds / plants =====
   - seedSpots: 씨앗을 "줍는" 위치 (seedXs)
   - plantSites: 심을 수 있는 위치 (seedXs 기반)
*/
let seedSpots = [];
let plantSites = []; // {x, y, state:'empty'|'planted'|'grown', t, watered}
let orbs = [];
let spikes = [];
let steps = [];
let toxicSet = new Set();
let tornadoes = []; // stage4 windZones

/* ===== particles ===== */
const particles = [];
const ripples = [];

function spawnGreenBurst(x,y, amount=26){
  for (let i=0;i<amount;i++){
    particles.push({
      x, y,
      vx: rand(-140,140),
      vy: rand(-260,-60),
      life: rand(0.6, 1.2),
      t: 0,
      size: rand(2,5),
      kind: "green"
    });
  }
}

function spawnRipple(x,y){
  ripples.push({ x,y, r: 10, life: 0.8, t:0 });
}

/* =========================
   Dialogue System (간단 내장)
   - 대사 객체: { name, role, avatarKey, avatarSrc, text }
========================= */
let dlgQueue = [];
let dlgOpen = false;
let dlgAuto = false;
let dlgAutoAt = 0;

function setDialogueAvatar(line){
  // 우선순위: avatarSrc > avatarKey(assets) > unknown
  let src = null;
  if (line.avatarSrc) src = line.avatarSrc;
  else if (line.avatarKey && ASSETS.avatars[line.avatarKey]) src = ASSETS.avatars[line.avatarKey];
  else src = ASSETS.avatars.unknown;

  dlgAvatar.onerror = () => {
    dlgAvatar.style.display = "none";
    dlgAvatarFallback.style.display = "block";
    dlgAvatarFallback.textContent = "?";
  };
  dlgAvatar.onload = () => {
    dlgAvatar.style.display = "block";
    dlgAvatarFallback.style.display = "none";
  };
  dlgAvatar.src = src;
}

function openDialogue(lines){
  dlgQueue = lines.slice();
  dlgOpen = true;
  dialogue.classList.add("is-open");
  showNextLine(true);
}

function closeDialogue(){
  dlgOpen = false;
  dialogue.classList.remove("is-open");
}

function showNextLine(force=false){
  if (!dlgOpen) return;
  if (dlgQueue.length === 0){
    closeDialogue();
    return;
  }
  const line = dlgQueue.shift();
  dlgNameEl.textContent = line.name ?? "???";
  dlgRoleEl.textContent = line.role ?? "SYSTEM";
  dlgTextEl.textContent = line.text ?? "";
  setDialogueAvatar(line);

  // next indicator flash
  dlgNextEl.style.opacity = "1";
  setTimeout(()=>{ dlgNextEl.style.opacity = "0.92"; }, 90);

  if (dlgAuto){
    dlgAutoAt = timeNow + 1.15; // 자동 다음까지 텀
  }
}

dlgAutoBtn.addEventListener("click", ()=>{
  dlgAuto = !dlgAuto;
  dlgAutoBtn.textContent = `AUTO: ${dlgAuto ? "ON" : "OFF"}`;
  if (dlgAuto) dlgAutoAt = timeNow + 0.8;
});
dlgSkipBtn.addEventListener("click", ()=>{
  dlgQueue = [];
  closeDialogue();
});

// 클릭으로 다음
dialogue.addEventListener("click", (e)=>{
  if (!dlgOpen) return;
  showNextLine(true);
});

// Shift로 AUTO 토글
window.addEventListener("keydown", (e)=>{
  if (e.key === "Shift") input.autoTogglePressed = true;
});

/* =========================
   Cards
========================= */
const CARD_POOL = [
  {
    id: "speed",
    rarity: "common",
    name: "빠른 속도",
    emoji: "🏃",
    desc: "이동 속도 +10%",
    apply(){
      player.speedMul *= 1.10;
    }
  },
  {
    id: "doublejump",
    rarity: "rare",
    name: "더블 점프!",
    emoji: "🦘",
    desc: "공중 점프 1회 추가",
    apply(){
      player.extraJump += 1;
    }
  },
  {
    id: "heal",
    rarity: "epic",
    name: "응급 회복",
    emoji: "🩹",
    desc: "HP 즉시 +25 (최대치까지)",
    apply(){
      player.hp = Math.min(player.maxHp, player.hp + 25);
    }
  },
  {
    id: "o2boost",
    rarity: "epic",
    name: "산소 캡슐",
    emoji: "🫧",
    desc: "O₂ 즉시 +15 (최대치까지)",
    apply(){
      player.o2 = Math.min(player.maxO2, player.o2 + 15);
    }
  },
  {
    id: "legend",
    rarity: "legendary",
    name: "생명의 파동",
    emoji: "✨",
    desc: "식물 성장 완료 시 파티클이 더 많이 발생",
    apply(){
      // 플래그 느낌으로 score에 보너스 처리
      player.__legendBloom = true;
    }
  }
];

const ownedCards = [];

function rarityClass(r){
  if (r === "common") return "r-common";
  if (r === "rare") return "r-rare";
  if (r === "epic") return "r-epic";
  return "r-legendary";
}
function rarityLabel(r){
  if (r === "common") return "일반 카드";
  if (r === "rare") return "매우 희귀 카드";
  if (r === "epic") return "에픽 카드";
  return "레전더리 카드";
}

function renderOwnedCards(){
  ownedCardsEl.innerHTML = "";
  for (const c of ownedCards){
    const div = document.createElement("div");
    div.className = "ownedCard";
    div.innerHTML = `
      <div class="emo">${c.emoji}</div>
      <div>
        <div class="name">${c.name}</div>
        <div class="desc">${c.desc}</div>
      </div>
    `;
    ownedCardsEl.appendChild(div);
  }
}

let cardPicking = false;
let cardPickEndsAt = 0;
let cardCandidates = [];

function openCardPick(title){
  cardPicking = true;
  cardPickEndsAt = timeNow + 5.0;
  cardTitleEl.textContent = title;
  cardOverlay.classList.add("is-open");

  // 3장 뽑기(단순)
  cardCandidates = [];
  const pool = [...CARD_POOL];
  while (cardCandidates.length < 3 && pool.length){
    const idx = Math.floor(Math.random() * pool.length);
    cardCandidates.push(pool.splice(idx,1)[0]);
  }

  cardRow.innerHTML = "";
  cardCandidates.forEach((c, idx)=>{
    const el = document.createElement("div");
    el.className = `card ${rarityClass(c.rarity)}`;
    el.innerHTML = `
      <div class="rarity">${rarityLabel(c.rarity)}</div>
      <div class="name">${c.name}</div>
      <div class="emoji">${c.emoji}</div>
      <div class="desc">${c.desc}</div>
    `;
    el.addEventListener("click", ()=> pickCard(idx));
    cardRow.appendChild(el);
  });
}

function closeCardPick(){
  cardPicking = false;
  cardOverlay.classList.remove("is-open");
  cardRow.innerHTML = "";
}

function pickCard(idx){
  const c = cardCandidates[idx] || cardCandidates[0];
  if (!c) return;

  // 적용
  c.apply();
  ownedCards.push(c);
  renderOwnedCards();

  closeCardPick();
}

/* =========================
   Stage Build
========================= */
function buildStage(i){
  stageIndex = i;
  stage = stages[stageIndex];

  // reset player
  player.x = 120;
  player.y = 220;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.extraJumpUsed = 0;
  player.frozenUntil = 0;
  player.stunnedUntil = 0;

  // stage systems
  steps = stage.steps.map(s=>({ ...s }));
  spikes = (stage.spikes || []).map(x=>({ x, w: 38, h: 26 }));
  orbs = (stage.orbs || []).map(o=>({ x:o.x, baseY:o.baseY, t:0, taken:false }));

  toxicSet = new Set((stage.toxicSteps || []).map(n => n)); // index list
  seedSpots = (stage.seedXs || []).map(x=>({ x, y: GROUND_Y-14, taken:false }));
  plantSites = (stage.seedXs || []).map(x=>({
    x,
    y: GROUND_Y-16,
    state: "empty",  // empty -> planted -> grown
    t: 0,
    watered: false,
    growth: 0,
  }));

  // tornadoes in stage4
  tornadoes = [];
  if (stage.windZones && stage.windZones.count){
    const count = stage.windZones.count;
    for (let k=0;k<count;k++){
      const x = 900 + k * 700;
      tornadoes.push({
        x,
        y: GROUND_Y - 110,
        w: 90,
        h: 120,
        active: true,
        phase: rand(0,10),
      });
    }
  }

  // UI
  elStage.textContent = String(stageIndex + 1);
  stageRuleOverlay.textContent = stage.ruleText || "추가 규칙 없음";

  elTotal.textContent = String(plantSites.length);
  elPlanted.textContent = "0";

  // 스테이지 시작 카드
  openCardPick(`스테이지 ${stageIndex+1} 시작 - 카드 선택`);

  // 스테이지 진입 대화(아바타 변경 예시 포함)
  openDialogue([
    { name:"연구원1", role:"LAB-01", avatarKey:"unknown", text:`접속 확인했어! 스테이지 ${stageIndex+1} 준비 완료.` },
    { name:"로봇", role:"DRONE", avatarKey:"robot", text:"씨앗을 심고(F로 물주기) 성장시키면 미션 성공이야." },
    { name:"연구원1", role:"LAB-01", avatarKey:"unknown", text:"토네이도 구간은 특히 조심해. 닿으면 움직임이 느려져!" },
  ]);
}

/* =========================
   Physics & Collision
========================= */
function aabb(ax,ay,aw,ah, bx,by,bw,bh){
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

function stepCollide(px,py,pw,ph, s){
  // 단순: 위에서 내려올 때만 착지 처리
  if (!aabb(px,py,pw,ph, s.x,s.y,s.w,s.h)) return false;
  return true;
}

/* =========================
   Controls
========================= */
window.addEventListener("keydown", (e)=>{
  if (e.key === "ArrowLeft") input.left = true;
  if (e.key === "ArrowRight") input.right = true;

  if (e.code === "Space") input.jumpPressed = true;
  if (e.key.toLowerCase() === "e") input.plantPressed = true;
  if (e.key.toLowerCase() === "f") input.waterPressed = true;
  if (e.key.toLowerCase() === "q") input.restartPressed = true;
  if (e.key.toLowerCase() === "r") input.cardPressed = true;

  if (dlgOpen && (e.code === "Space")) input.nextPressed = true;
});

window.addEventListener("keyup", (e)=>{
  if (e.key === "ArrowLeft") input.left = false;
  if (e.key === "ArrowRight") input.right = false;
});

/* =========================
   Gameplay helpers
========================= */
function canAct(){
  if (cardPicking) return false;
  if (!gameStarted) return false;
  if (gameEnded) return false;
  if (dlgOpen) return false; // 대화 중엔 멈춤(원하면 이 줄 제거)
  if (timeNow < player.frozenUntil) return false;
  if (timeNow < player.stunnedUntil) return false;
  return true;
}

function nearestPlantSite(){
  // 플레이어 중심 기준 가까운 plant site
  const cx = player.x + player.w/2;
  let best = null;
  let bestD = 1e9;
  for (const p of plantSites){
    const d = Math.abs(p.x - cx);
    if (d < bestD){
      bestD = d;
      best = p;
    }
  }
  return { site: best, dist: bestD };
}

function tryPlant(){
  const { site, dist } = nearestPlantSite();
  if (!site) return;
  if (dist > 60) return; // 너무 멀면 안됨
  if (player.seedInv <= 0) return;
  if (site.state !== "empty") return;

  site.state = "planted";
  site.t = 0;
  site.watered = false;
  site.growth = 0;
  player.seedInv -= 1;

  // 심기 점수
  player.score += 50;

  // 심는 순간 작은 파티클
  spawnGreenBurst(site.x, site.y-10, 10);
}

function tryWater(){
  const { site, dist } = nearestPlantSite();
  if (!site) return;
  if (dist > 70) return;
  if (site.state !== "planted") return;
  if (site.watered) return;

  site.watered = true;
  site.t = 0;
  player.score += 30;

  // 물주기 효과(작은 파동)
  spawnRipple(site.x, site.y-8);
}

function updatePlants(dt){
  for (const p of plantSites){
    if (p.state === "planted"){
      // 성장 애니메이션: watered가 true면 성장 시작
      if (p.watered){
        p.t += dt;
        // 2초 성장
        p.growth = Math.min(1, p.t / 2.0);
        if (p.growth >= 1){
          p.state = "grown";
          player.planted += 1;
          elPlanted.textContent = String(player.planted);

          // 완료 연출: 빛 파동 + 초록 파티클
          spawnRipple(p.x, p.y-10);
          spawnGreenBurst(p.x, p.y-18, player.__legendBloom ? 60 : 34);

          // 산소 조금 회복(컨셉)
          player.o2 = Math.min(player.maxO2, player.o2 + 4);

          // 점수
          player.score += 120;
        }
      } else {
        // planted만 된 상태: 미세 흔들림 느낌용
        p.t += dt;
      }
    }
  }
}

function updateParticles(dt){
  for (let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 520 * dt;
    if (p.t >= p.life) particles.splice(i,1);
  }
  for (let i=ripples.length-1;i>=0;i--){
    const r = ripples[i];
    r.t += dt;
    r.r += 220 * dt;
    if (r.t >= r.life) ripples.splice(i,1);
  }
}

/* =========================
   Stage Rule Effects
========================= */
let toxicTick = 0;
let toxicUntil = 0;

let acidOn = false;
let acidTimer = 0;

let snowFreezeAt = 0;

function updateStageRules(dt){
  // stageSpeedMul: 기본 이동속도 배율
  // stage5: 0.8, stage7: 0.7 등
  // (이건 이동 계산에 반영)

  // 산성비 (stage6)
  if (stage.acidRain){
    acidTimer += dt * 1000;
    const onMs = stage.acidRain.onMs;
    const offMs = stage.acidRain.offMs;
    const cycle = onMs + offMs;
    const m = acidTimer % cycle;
    acidOn = (m < onMs);
    if (acidOn){
      // dps 만큼 감소
      player.hp -= stage.acidRain.dps * dt;
    }
  } else {
    acidOn = false;
  }

  // 눈(빙결) stage7
  if (stage.snow){
    if (snowFreezeAt <= 0){
      snowFreezeAt = timeNow + rand(stage.snow.freezeMinMs, stage.snow.freezeMaxMs)/1000;
    }
    if (timeNow >= snowFreezeAt){
      player.frozenUntil = Math.max(player.frozenUntil, timeNow + stage.snow.freezeMs/1000);
      snowFreezeAt = timeNow + rand(stage.snow.freezeMinMs, stage.snow.freezeMaxMs)/1000;
    }
  } else {
    snowFreezeAt = 0;
  }
}

/* =========================
   Update / Draw
========================= */
function update(dt){
  timeNow += dt;

  // start/end
  if (!gameStarted || gameEnded) return;

  // 카드 선택 타이머
  if (cardPicking){
    const left = Math.max(0, cardPickEndsAt - timeNow);
    cardTimerEl.textContent = left.toFixed(1);
    if (left <= 0){
      pickCard(0);
    }
    return; // 카드 고를 땐 정지
  }

  // 대화 AUTO
  if (dlgOpen && dlgAuto && timeNow >= dlgAutoAt){
    showNextLine(true);
    dlgAutoAt = timeNow + 1.1;
  }
  if (dlgOpen){
    // 대화 중 next 처리
    if (input.nextPressed){
      showNextLine(true);
    }
    return;
  }

  // restart
  if (input.restartPressed){
    restartGame();
    return;
  }

  // stage rule ticks
  updateStageRules(dt);

  // O2 자연 감소(컨셉)
  player.o2 -= 2.2 * dt; // 초당
  if (player.o2 < 0) player.o2 = 0;

  // O2 0이면 HP 감소 + UI 경고
  if (player.o2 <= 0.001){
    warnOverlay.classList.add("is-on");
    player.hp -= 9 * dt;
  } else {
    warnOverlay.classList.remove("is-on");
  }

  // Clamp hp
  if (player.hp <= 0){
    player.hp = 0;
    // 죽으면 재시작(간단 처리)
    openDialogue([{ name:"SYSTEM", role:"FAIL", avatarKey:"unknown", text:"HP가 0이야… Q로 재시작해." }]);
  }

  // 카드 발동(원하면 여기서 더 복잡하게)
  if (input.cardPressed){
    openCardPick("카드 발동 - 1장 선택");
  }

  // 행동 가능 여부
  const act = canAct();

  // 이동
  const baseSpeed = 320;
  const stageMul = stage.stageSpeedMul ?? 1.0;
  let speed = baseSpeed * player.speedMul * stageMul;

  // 빙결/스턴이면 속도 0
  if (!act){
    speed = 0;
  }

  let move = 0;
  if (input.left) { move -= 1; player.face = -1; }
  if (input.right){ move += 1; player.face = 1; }

  // Stage4 토네이도: 닿으면 2초 행동불가 + 5초 이속 80% 감소
  // (여기서는 단순히 "스턴 2초 + 느려짐 5초" 구현)
  if (stage.windZones){
    for (const t of tornadoes){
      const hit = aabb(player.x, player.y, player.w, player.h, t.x, t.y, t.w, t.h);
      if (hit){
        player.stunnedUntil = Math.max(player.stunnedUntil, timeNow + 2.0);
        player.__slowUntil = Math.max(player.__slowUntil || 0, timeNow + 5.0);
      }
    }
  }
  if ((player.__slowUntil || 0) > timeNow){
    speed *= 0.2;
  }

  player.vx = move * speed;

  // 점프
  if (act && input.jumpPressed){
    if (player.onGround){
      player.vy = -720;
      player.onGround = false;
      player.extraJumpUsed = 0;
    } else {
      // 공중 점프(카드)
      if (player.extraJumpUsed < player.extraJump){
        player.vy = -680;
        player.extraJumpUsed += 1;
      }
    }
  }

  // 심기 / 물주기
  if (act && input.plantPressed) tryPlant();
  if (act && input.waterPressed) tryWater();

  // 중력
  player.vy += GRAV * dt;

  // 이동 적용
  const nextX = player.x + player.vx * dt;
  let nextY = player.y + player.vy * dt;

  // 충돌(플랫폼)
  player.onGround = false;

  // 수평 이동은 단순히 통과(벽 처리 없음)
  player.x = nextX;

  // 바닥 기준
  if (nextY + player.h >= GROUND_Y){
    nextY = GROUND_Y - player.h;
    player.vy = 0;
    player.onGround = true;
  }

  // 플랫폼 착지: 위에서 떨어질 때만
  if (player.vy >= 0){
    for (let i=0;i<steps.length;i++){
      const s = steps[i];
      const wasAbove = (player.y + player.h) <= s.y + 6;
      const hit = stepCollide(player.x, nextY, player.w, player.h, s);
      if (hit && wasAbove){
        nextY = s.y - player.h;
        player.vy = 0;
        player.onGround = true;

        // 독성 발판
        if (toxicSet.has(i)){
          toxicUntil = Math.max(toxicUntil, timeNow + 3.0);
        }
      }
    }
  }

  player.y = nextY;

  // 독성 발판 데미지(3초 동안 1초마다 -10)
  if (timeNow < toxicUntil){
    toxicTick += dt;
    if (toxicTick >= 1.0){
      toxicTick -= 1.0;
      player.hp -= 10;
      player.hp = Math.max(0, player.hp);
    }
  } else {
    toxicTick = 0;
  }

  // 가시 판정(바닥 가시)
  for (const sp of spikes){
    const sx = sp.x;
    const sy = GROUND_Y - sp.h;
    if (aabb(player.x, player.y, player.w, player.h, sx, sy, sp.w, sp.h)){
      player.hp -= 40 * dt;
      // 약간 밀림
      player.vx -= player.face * 120;
    }
  }

  // 오브(산소) 획득
  for (const o of orbs){
    if (o.taken) continue;
    const oy = o.baseY + Math.sin(timeNow*3 + o.x*0.01)*10;
    if (aabb(player.x, player.y, player.w, player.h, o.x-14, oy-14, 28, 28)){
      o.taken = true;
      player.o2 = Math.min(player.maxO2, player.o2 + 10);
      player.score += 25;
      spawnGreenBurst(o.x, oy, 14);
    }
  }

  // 씨앗 획득(Seed spot)
  for (const s of seedSpots){
    if (s.taken) continue;
    if (Math.abs((player.x+player.w/2) - s.x) < 30 && Math.abs((player.y+player.h) - s.y) < 60){
      s.taken = true;
      player.seedInv += 1;
      player.score += 10;
      spawnGreenBurst(s.x, s.y-10, 10);
    }
  }

  // 식물 성장 업데이트
  updatePlants(dt);

  // 파티클/파동
  updateParticles(dt);

  // 카메라
  const targetCam = Math.max(0, player.x - 220);
  camX += (targetCam - camX) * Math.min(1, dt * 6);

  // 스테이지 클리어 조건:
  // (1) planted == total  AND  (2) player.x가 끝까지 도달
  const allGrown = (player.planted >= plantSites.length);
  const reachEnd = (player.x >= stage.length - 140);

  if (allGrown && reachEnd){
    // 다음 스테이지 or 엔딩
    if (stageIndex >= 6){
      // stage7 clear
      triggerEnding();
    } else {
      buildStage(stageIndex + 1);
      // planted 초기화
      player.planted = 0;
      elPlanted.textContent = "0";
    }
  }

  // UI 업데이트
  syncUI();
}

function syncUI(){
  elHp.textContent = Math.max(0, Math.floor(player.hp)).toString();
  elMaxHp.textContent = player.maxHp.toString();
  elO2.textContent = Math.max(0, Math.floor(player.o2)).toString();
  elMaxO2.textContent = player.maxO2.toString();
  elSeedInv.textContent = player.seedInv.toString();
  elScore.textContent = Math.floor(player.score).toString();
}

function draw(){
  // clear
  const W = canvas.getBoundingClientRect().width;
  const H = canvas.getBoundingClientRect().height;
  ctx.clearRect(0,0,W,H);

  // 배경 (stage bg image)
  const bgImg = IMG.stageBgs[stageIndex];
  if (bgImg){
    // cover 느낌
    const iw = bgImg.width, ih = bgImg.height;
    const scale = Math.max(W/iw, H/ih);
    const dw = iw*scale, dh = ih*scale;
    const dx = (W - dw)/2;
    const dy = (H - dh)/2;
    // parallax 약간: camX에 따라 x 이동
    const par = -camX * 0.06;
    ctx.globalAlpha = 1;
    ctx.drawImage(bgImg, dx + par, dy, dw, dh);
  } else {
    // fallback sky gradient
    const g = ctx.createLinearGradient(0,0,0,H);
    const top = stage.bg?.skyTop || [30,40,60];
    const bot = stage.bg?.skyBot || [10,10,20];
    g.addColorStop(0, `rgb(${top[0]},${top[1]},${top[2]})`);
    g.addColorStop(1, `rgb(${bot[0]},${bot[1]},${bot[2]})`);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);
  }

  // world->screen transform
  ctx.save();
  ctx.translate(-camX, 0);

  // 바닥
  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.fillRect(camX, GROUND_Y, W + camX + 5000, 200);

  // platforms
  for (let i=0;i<steps.length;i++){
    const s = steps[i];
    const isToxic = toxicSet.has(i);
    ctx.fillStyle = isToxic ? "rgba(160,80,255,.55)" : "rgba(80,60,40,.55)";
    ctx.fillRect(s.x, s.y, s.w, s.h);

    if (isToxic){
      ctx.strokeStyle = "rgba(190,120,255,.85)";
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x+1, s.y+1, s.w-2, s.h-2);
    }
  }

  // spikes
  for (const sp of spikes){
    const x = sp.x;
    const y = GROUND_Y;
    ctx.fillStyle = "rgba(255,80,110,.85)";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + sp.w/2, y - sp.h);
    ctx.lineTo(x + sp.w, y);
    ctx.closePath();
    ctx.fill();
  }

  // orbs
  for (const o of orbs){
    if (o.taken) continue;
    const oy = o.baseY + Math.sin(timeNow*3 + o.x*0.01)*10;
    ctx.strokeStyle = "rgba(120,255,200,.65)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(o.x, oy, 18, 0, Math.PI*2);
    ctx.stroke();
    ctx.fillStyle = "rgba(120,255,200,.18)";
    ctx.beginPath();
    ctx.arc(o.x, oy, 14, 0, Math.PI*2);
    ctx.fill();
  }

  // seed spots (pickup)
  for (const s of seedSpots){
    if (s.taken) continue;
    if (IMG.seed){
      ctx.globalAlpha = 0.95;
      ctx.drawImage(IMG.seed, s.x-14, s.y-28, 28, 28);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = "rgba(255,230,120,.9)";
      ctx.beginPath();
      ctx.arc(s.x, s.y-14, 7, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // plant sites
  for (const p of plantSites){
    // 자리 표시 링
    const ring = (p.state === "empty") ? "rgba(140,220,180,.55)"
               : (p.state === "planted") ? "rgba(140,220,180,.85)"
               : "rgba(120,255,160,.95)";
    ctx.strokeStyle = ring;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, Math.PI*2);
    ctx.stroke();

    // planted / grown draw
    if (p.state === "planted"){
      // 씨앗 심기 모션: 작은 싹이 들썩
      const bob = Math.sin(timeNow*6 + p.x*0.01) * 2;
      const h = 8 + (p.watered ? 10 * p.growth : 0);
      ctx.fillStyle = "rgba(60,255,160,.85)";
      ctx.fillRect(p.x-2, p.y-2 - h + bob, 4, h);
      ctx.beginPath();
      ctx.arc(p.x, p.y-2 - h + bob, 5, 0, Math.PI*2);
      ctx.fill();
    }
    if (p.state === "grown"){
      // 성장 완료: 작은 나무
      ctx.fillStyle = "rgba(80,50,30,.9)";
      ctx.fillRect(p.x-3, p.y-28, 6, 26);
      ctx.fillStyle = "rgba(60,255,160,.85)";
      ctx.beginPath();
      ctx.arc(p.x, p.y-34, 14, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // tornado obstacles
  for (const t of tornadoes){
    if (!t.active) continue;
    const wob = Math.sin(timeNow*4 + t.phase) * 6;
    const dx = t.x + wob;
    if (IMG.tornado){
      ctx.globalAlpha = 0.95;
      ctx.drawImage(IMG.tornado, dx, t.y, t.w, t.h);
      ctx.globalAlpha = 1;
    } else {
      // fallback
      ctx.fillStyle = "rgba(180,220,255,.15)";
      ctx.strokeStyle = "rgba(180,220,255,.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(dx + t.w/2, t.y + t.h/2, t.w/2, t.h/2, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // player draw
  if (IMG.robot){
    ctx.save();
    ctx.translate(player.x + player.w/2, player.y + player.h/2);
    ctx.scale(player.face, 1);
    ctx.drawImage(IMG.robot, -player.w/2, -player.h/2, player.w, player.h);
    ctx.restore();
  } else {
    ctx.fillStyle = "rgba(190,220,255,.9)";
    ctx.fillRect(player.x, player.y, player.w, player.h);
  }

  // particles
  for (const p of particles){
    const a = 1 - (p.t / p.life);
    ctx.globalAlpha = Math.max(0,a);
    if (p.kind === "green"){
      ctx.fillStyle = "rgba(80,255,160,1)";
    } else {
      ctx.fillStyle = "rgba(255,255,255,1)";
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ripples (빛 파동)
  for (const r of ripples){
    const a = 1 - (r.t / r.life);
    ctx.globalAlpha = Math.max(0,a);
    ctx.strokeStyle = "rgba(120,255,180,1)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI*2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // acid rain overlay (stage6)
  if (acidOn){
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(120,255,200,1)";
    for (let i=0;i<120;i++){
      const x = camX + (i*80 + (timeNow*350)%80);
      const y = ((i*43 + timeNow*600) % (GROUND_Y));
      ctx.fillRect(x, y, 2, 18);
    }
    ctx.globalAlpha = 1;
  }

  // freeze overlay (stage7)
  if (timeNow < player.frozenUntil){
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(180,220,255,1)";
    ctx.fillRect(camX, 0, W + camX + 5000, GROUND_Y);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/* =========================
   Loop
========================= */
let last = 0;
function loop(ts){
  if (!last) last = ts;
  const dt = Math.min(0.033, (ts-last)/1000);
  last = ts;

  update(dt);
  draw();
  resetInputOneShots();

  requestAnimationFrame(loop);
}

/* =========================
   Start / End / Restart
========================= */
function startGame(){
  gameStarted = true;
  gameEnded = false;
  startScreen.classList.remove("is-open");
  endScreen.classList.remove("is-open");

  // build stage1
  player.hp = 100; player.maxHp = 100;
  player.o2 = 50; player.maxO2 = 50;
  player.seedInv = 0;
  player.planted = 0;
  player.score = 0;
  player.speedMul = 1;
  player.extraJump = 0;
  player.__legendBloom = false;
  ownedCards.length = 0;
  renderOwnedCards();

  buildStage(0);
  syncUI();
}

function triggerEnding(){
  gameEnded = true;
  endText.textContent = "Stage 7 클리어! 지구가 다시 숨 쉬기 시작했어.";
  endScreen.classList.add("is-open");
  openDialogue([
    { name:"연구원1", role:"LAB-01", avatarKey:"unknown", text:"…신호 정상. 산소 농도 회복 확인." },
    { name:"로봇", role:"DRONE", avatarKey:"robot", text:"미션 완료. 이제 남은 건… 이걸 지속시키는 것." },
  ]);
}

function restartGame(){
  // 완전 초기화
  gameStarted = false;
  gameEnded = false;
  startScreen.classList.add("is-open");
  endScreen.classList.remove("is-open");
  closeDialogue();
  closeCardPick();

  // stage reset
  stageIndex = 0;
  stage = stages[0];
  camX = 0;

  // ui
  elStage.textContent = "1";
  stageRuleOverlay.textContent = "추가 규칙 없음";
  warnOverlay.classList.remove("is-on");

  // 값 초기 표시
  player.hp = 100; player.maxHp = 100;
  player.o2 = 50; player.maxO2 = 50;
  player.seedInv = 0;
  player.planted = 0;
  player.score = 0;
  elTotal.textContent = "0";
  syncUI();

  // 시작화면 유지
}

btnStart.addEventListener("click", ()=> startGame());
btnRestart.addEventListener("click", ()=>{
  restartGame();
  // 바로 시작까지 원하면 아래 줄 켜기:
  // startGame();
});

/* =========================
   Init
========================= */
(async function init(){
  fitCanvas();
  await preloadAll();

  // 시작화면 기본 오픈
  startScreen.classList.add("is-open");
  loading.classList.remove("is-open");

  // 초기 UI
  syncUI();

  requestAnimationFrame(loop);
})();
