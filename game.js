// game.js (type="module")
import { baseStages7, rand } from "./stages.js";
import { SPEAKERS, INTRO_DIALOGUE, END_DIALOGUE, stageEnterDialogue } from "./dialogue.js";

const BASE_URL = new URL("./", import.meta.url); // ✅ 모든 경로를 여기 기준으로 안전하게
// ====== plant & seed images ======
const IMG = {
  seed: new Image(),
  plantSeed: new Image(),
  plantGrow: new Image(),
  plantDone: new Image(),
};

function loadPlantImages(){
  IMG.seed.src      = resolveAsset("images/seed.png");
  IMG.plantSeed.src = resolveAsset("images/plant_seed.png");
  IMG.plantGrow.src = resolveAsset("images/plant_grow.png");
  IMG.plantDone.src = resolveAsset("images/plant_done.png");
}


const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

const overlay = document.getElementById("cardOverlay");
const cardRow = document.getElementById("cardRow");
const cardTimerEl = document.getElementById("cardTimer");
const cardTitleEl = document.getElementById("cardTitle");

const loading = document.getElementById("loading");
const loadingText = document.getElementById("loadingText");

const dialogue = document.getElementById("dialogue");
const dlgNameEl = document.getElementById("dlgName");
const dlgRoleEl = document.getElementById("dlgRole");
const dlgTextEl = document.getElementById("dlgText");
const dlgNextEl = document.getElementById("dlgNext");
const dlgAutoBtn = document.getElementById("dlgAutoBtn");
const dlgSkipBtn = document.getElementById("dlgSkipBtn");
const dlgAvatar = document.getElementById("dlgAvatar");

const warnOverlay = document.getElementById("warnOverlay");
const stageRuleOverlay = document.getElementById("stageRuleOverlay");

const ownedCardsEl = document.getElementById("ownedCards");
const uiStage = document.getElementById("stage");
const uiHp = document.getElementById("hp");
const uiMaxHp = document.getElementById("maxHp");
const uiO2 = document.getElementById("o2");
const uiMaxO2 = document.getElementById("maxO2");
const uiSeedInv = document.getElementById("seedInv");
const uiPlanted = document.getElementById("planted");
const uiTotal = document.getElementById("total");
const uiScore = document.getElementById("score");
const uiHint = document.getElementById("hint");

// ====== utils ======
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function open(el){ el.classList.add("is-open"); }
function close(el){ el.classList.remove("is-open"); }
function setHint(msg){ uiHint.textContent = msg || ""; }

function setStageRuleBox(text) {
  const el = document.getElementById("stageRuleOverlay");
  if (el) {
    el.innerHTML = text || "추가 규칙 없음";
  }
}
// ====== loop control ======
let running = false;
let lastT = 0;
let rafId = null;

function stopLoop() {
  running = false;
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
}
function startLoop() {
  running = true;
  lastT = performance.now();
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

// ====== input ======
const held = new Set();
const pressed = new Set();
addEventListener("keydown", (e) => {
  const block = ["ArrowLeft","ArrowRight","ArrowUp"," ","KeyA","KeyD","KeyW","KeyE","KeyF","KeyQ","KeyR","ShiftLeft","ShiftRight"];
  if (block.includes(e.code)) e.preventDefault();
  if (!held.has(e.code)) pressed.add(e.code);
  held.add(e.code);
});
addEventListener("keyup", (e) => held.delete(e.code));
function wasPressed(code) { if (pressed.has(code)) { pressed.delete(code); return true; } return false; }
function isHeld(code){ return held.has(code); }

// ====== world / physics ======
const GRAV = 0.85;
const GROUND_Y = 440;

const platforms = [];
const hazards = [];
const seeds = [];
const plots = [];
const tornados = [];

const world = {
  camX: 0,
  length: 3600,
  maxSpeedBase: 5.0,
  frictionNearGround: 0.84,
};

const player = {
  x: 120, y: 250, w: 40, h: 60,
  vx: 0, vy: -12,
  onGround: false,

  hp: 100,
  maxHpBase: 100,
  maxHpBonus: 0,

  o2: 50,
  maxO2Base: 50,
  maxO2Bonus: 0,

  seedInv: 0,
  planted: 0,
  score: 0,

  invulnMs: 0,
  jumpsMax: 1,
  extraJumpUsed: false,

  toxicMs: 0,
  toxicTickAcc: 0,

  stunMs: 0,
  slowMs: 0,

  freezeMs: 0,
  nextFreezeMs: 0,

  acidCycleMs: 0,
  acidOn: false,
  acidDmgAcc: 0,

  suffocatingMs: 0,
  plantCooldownMs: 0,
  waterCooldownMs: 0,

  image: new Image(),
  imgWidth: 30,
  imgHeight: 42,
  direction: 1,
};

function getMaxHp(){ return player.maxHpBase + player.maxHpBonus; }
function getMaxO2(){ return player.maxO2Base + player.maxO2Bonus; }

// ====== dialogue system ======
let dlgActive = false;
let dlgLines = [];
let dlgIdx = 0;
let dlgTyping = false;
let dlgAuto = false;
let dlgOnDone = () => {};
let typingTimer = null;
let autoTimer = null;

function resolveAsset(rel){
  return new URL(rel, BASE_URL).href;
}

function setSpeakerUI(name){
  const s = SPEAKERS[name] || { role:"SYSTEM", color:"#cfe1ff", avatar:"avatars/unknown_avatar.png" };

  dlgNameEl.textContent = name || "???";
  dlgRoleEl.textContent = s.role;
  dlgNameEl.style.color = s.color;

  dlgAvatar.style.boxShadow = `0 12px 26px rgba(0,0,0,.35), 0 0 30px ${s.color}33`;
  dlgAvatar.style.borderColor = `${s.color}55`;

  // ✅ avatar도 GitHub Pages 안전 경로
  dlgAvatar.src = resolveAsset(s.avatar || "avatars/unknown_avatar.png");
}

function setAutoBtn(){ dlgAutoBtn.textContent = `AUTO: ${dlgAuto ? "ON" : "OFF"}`; }

function openDialogue(lines, onDone){
  dlgActive = true;
  dlgLines = lines || [];
  dlgIdx = 0;
  dlgOnDone = onDone || (()=>{});
  dlgAuto = false;
  setAutoBtn();
  open(dialogue);
  showDialogueLine();
}
function closeDialogue(){
  dlgActive = false;
  dlgTyping = false;
  clearTimeout(typingTimer);
  clearTimeout(autoTimer);
  close(dialogue);
}
function typeText(full){
  dlgTyping = true;
  dlgTextEl.textContent = "";
  dlgNextEl.style.opacity = "0";
  const speed = 18;
  let i = 0;

  const step = () => {
    if (!dlgTyping) return;
    i++;
    dlgTextEl.textContent = full.slice(0, i);
    if (i >= full.length){
      dlgTyping = false;
      dlgNextEl.style.opacity = "1";
      if (dlgAuto){
        clearTimeout(autoTimer);
        autoTimer = setTimeout(()=>nextDialogue(), 520);
      }
      return;
    }
    typingTimer = setTimeout(step, speed);
  };
  step();
}
function showDialogueLine(){
  const line = dlgLines[dlgIdx];
  if (!line){
    closeDialogue();
    dlgOnDone();
    return;
  }

  // ✅ name 대신 speaker를 먼저 찾도록 수정 (ROBOT 표시를 위해)
  const speakerKey = line.speaker || line.name || "SYSTEM";
  setSpeakerUI(speakerKey); 
  
  typeText(line.text || "");
}
function skipTyping(){
  if (!dlgTyping) return;
  dlgTyping = false;
  clearTimeout(typingTimer);
  const line = dlgLines[dlgIdx];
  dlgTextEl.textContent = line?.text || "";
  dlgNextEl.style.opacity = "1";
  if (dlgAuto){
    clearTimeout(autoTimer);
    autoTimer = setTimeout(()=>nextDialogue(), 420);
  }
}
function nextDialogue(){
  if (!dlgActive) return;
  if (dlgTyping){ skipTyping(); return; }
  dlgIdx++;
  showDialogueLine();
}
dlgAutoBtn.addEventListener("click", ()=>{
  dlgAuto = !dlgAuto; setAutoBtn();
  if (dlgAuto && !dlgTyping){
    clearTimeout(autoTimer);
    autoTimer = setTimeout(()=>nextDialogue(), 520);
  }
});
dlgSkipBtn.addEventListener("click", ()=>{
  if (!dlgActive) return;
  dlgTyping = false;
  clearTimeout(typingTimer);
  dlgIdx = dlgLines.length;
  showDialogueLine();
});
dialogue.addEventListener("click", ()=> nextDialogue());
addEventListener("keydown", (e)=>{
  if (!dlgActive) return;
  if (e.code === "Space") nextDialogue();
  if (e.code === "ShiftLeft" || e.code === "ShiftRight"){
    dlgAuto = !dlgAuto; setAutoBtn();
    if (dlgAuto && !dlgTyping){
      clearTimeout(autoTimer);
      autoTimer = setTimeout(()=>nextDialogue(), 520);
    }
  }
});

// ====== loading quotes ======
const LOADING_QUOTES = [
  "당신의 선택이 지구의 내일을 바꿉니다.",
  "오염은 빠르고, 회복은 느립니다. 그래서 지금이 중요합니다.",
  "작은 녹색이 모여 숲이 됩니다.",
  "쓰레기는 사라지지 않습니다. 장소만 바뀔 뿐입니다.",
  "멈추지 마. 여기엔 아직 가능성이 있어.",
];
async function showLoadingLine(){
  open(loading);
  loadingText.textContent = LOADING_QUOTES[Math.floor(Math.random()*LOADING_QUOTES.length)];
  await new Promise(r=>setTimeout(r, 900));
  close(loading);
}

// ====== cards ======
const RARITY = {
  common:    { name:"일반",      w:0.60, cls:"r-common" },
  rare:      { name:"레어",      w:0.27, cls:"r-rare" },
  epic:      { name:"희귀",      w:0.08, cls:"r-epic" },
  legendary: { name:"매우 희귀", w:0.05, cls:"r-legendary" },
};
const owned = new Map();
const pickedOnce = new Set();
const oneTimeUsed = new Set();
const upgrade = {
  hpTier: 0, speedTier: 0,
  oxygenBonus: 0,
  healHoldMs: 900,
  instantOxygen: false,
  periodicO2: false,
  periodicTimer: 0,
  shields: { poison:0, spike:0 },
  hasActivatable: false,
  activatableId: null,
};

const CARD_DEFS = [
  { id:"hp_15", rarity:"common", name:"체력 증가", emoji:"❤️", desc:"최대체력 +15", type:"hp", tier:1 },
  { id:"shield_poison", rarity:"common", name:"독성 보호막", emoji:"🟣", desc:"독성 1회 방어 (1회용)", type:"shield", kind:"poison", oneTime:true },
  { id:"shield_spike", rarity:"common", name:"가시 방패", emoji:"🛡️", desc:"가시 1회 방어 (1회용)", type:"shield", kind:"spike", oneTime:true },
  { id:"o2_plus3", rarity:"common", name:"산소 공급", emoji:"🌿", desc:"식물 O₂ 획득량 +3", type:"o2bonus", value:3 },
  { id:"speed_10", rarity:"common", name:"빠른 속도", emoji:"🏃", desc:"이동 속도 +10%", type:"speed", tier:1 },
  { id:"heal_fast", rarity:"common", name:"가속화", emoji:"⏱️", desc:"식물 옆 대기 시간이 0.5초로 감소", type:"healhold", ms:500 },

  { id:"hp_30", rarity:"rare", name:"체력 증가+", emoji:"💗", desc:"최대체력 +30 (업그레이드)", type:"hp", tier:2, requires:["hp_15"] },
  { id:"speed_20", rarity:"rare", name:"더 빠른 속도", emoji:"⚡", desc:"이동 속도 +20% (업그레이드)", type:"speed", tier:2, requires:["speed_10"] },
  { id:"o2_plus6", rarity:"rare", name:"더 많은 산소 공급", emoji:"🍃", desc:"식물 O₂ 획득량 +6 (업그레이드)", type:"o2bonus", value:6, requires:["o2_plus3"] },

  { id:"instant_o2", rarity:"epic", name:"슈퍼 가속화", emoji:"✨", desc:"식물에 물을 주면 즉시 O₂ 획득", type:"instant_o2" },
  { id:"spike_remove", rarity:"epic", name:"가시 제거기", emoji:"🧹", desc:"R키: 모든 가시 제거 (1회용)", type:"activate", act:"spike_remove", oneTime:true },
  { id:"poison_remove", rarity:"epic", name:"독성 제거기", emoji:"🧪", desc:"R키: 모든 독성 제거 (1회용)", type:"activate", act:"poison_remove", oneTime:true },
  { id:"o2_generator", rarity:"epic", name:"산소 공급기", emoji:"🔋", desc:"3초마다 O₂ +5", type:"periodic_o2" },
  { id:"speed_30", rarity:"epic", name:"매우 빠른 속도", emoji:"💨", desc:"이동 속도 +30% (업그레이드)", type:"speed", tier:3, requires:["speed_20"] },

  { id:"double_jump", rarity:"legendary", name:"더블 점프!", emoji:"🦘", desc:"공중 점프 1회 추가", type:"double_jump" },
];

function defById(id){ return CARD_DEFS.find(c=>c.id===id); }

function renderOwnedCards(){
  ownedCardsEl.innerHTML = "";
  const list = Array.from(owned.keys()).map(defById).filter(Boolean);
  for(const def of list){
    const st = owned.get(def.id);
    const suffix = def.oneTime ? (st?.usesLeft ? " (1회)" : " (소모)") : "";
    const item = document.createElement("div");
    item.className = "ownedCard";
    item.innerHTML = `<span class="emo">${def.emoji}</span>
      <span><b>${def.name}</b>${suffix}<br/>
      <span style="color:#9bb0d0;font-size:12px">${def.desc}</span></span>`;
    ownedCardsEl.appendChild(item);
  }
}
function isEligible(def){
  if (pickedOnce.has(def.id)) return false;
  if (owned.has(def.id)) return false;
  if (def.oneTime && oneTimeUsed.has(def.id)) return false;
  if (def.requires) for(const req of def.requires) if(!owned.has(req)) return false;
  if (def.type==="hp" && upgrade.hpTier >= def.tier) return false;
  if (def.type==="speed" && upgrade.speedTier >= def.tier) return false;
  if (def.type==="o2bonus" && upgrade.oxygenBonus >= def.value) return false;
  if (def.type==="activate" && upgrade.hasActivatable) return false;
  return true;
}
function rollRarity(){
  const r = Math.random();
  let acc = 0;
  for (const k of ["common","rare","epic","legendary"]){
    acc += RARITY[k].w;
    if (r < acc) return k;
  }
  return "common";
}
function pickRandomCard(rarity){
  const pool = CARD_DEFS.filter(c=>c.rarity===rarity && isEligible(c));
  if (pool.length) return pool[Math.floor(Math.random()*pool.length)];
  for (const rr of ["legendary","epic","rare","common"]){
    const p2 = CARD_DEFS.filter(c=>c.rarity===rr && isEligible(c));
    if (p2.length) return p2[Math.floor(Math.random()*p2.length)];
  }
  return null;
}
function applyCardImmediate(def){
  if (def.type==="hp"){
    upgrade.hpTier = Math.max(upgrade.hpTier, def.tier);
    player.maxHpBonus = (upgrade.hpTier===2)? 30 : (upgrade.hpTier===1? 15 : 0);
    player.hp = clamp(player.hp, 0, getMaxHp());
  }
  if (def.type==="speed") upgrade.speedTier = Math.max(upgrade.speedTier, def.tier);
  if (def.type==="o2bonus") upgrade.oxygenBonus = Math.max(upgrade.oxygenBonus, def.value);
  if (def.type==="healhold") upgrade.healHoldMs = Math.min(upgrade.healHoldMs, def.ms);
  if (def.type==="instant_o2") upgrade.instantOxygen = true;
  if (def.type==="periodic_o2") upgrade.periodicO2 = true;
  if (def.type==="double_jump") player.jumpsMax = 2;
  if (def.type==="shield") upgrade.shields[def.kind] += 1;
  if (def.type==="activate"){
    upgrade.hasActivatable = true;
    upgrade.activatableId = def.id;
    setHint("사용형 카드 보유: R키로 발동");
  }
}
function addOwnedCard(id){
  const def = defById(id);
  if (!def) return;
  pickedOnce.add(id);
  owned.set(id, { usesLeft: def.oneTime ? 1 : 0 });
  applyCardImmediate(def);
  renderOwnedCards();
}
function useActivatableCard(){
  if (!upgrade.hasActivatable || !upgrade.activatableId) return;
  const id = upgrade.activatableId;
  const st = owned.get(id);
  if (!st || st.usesLeft <= 0 || oneTimeUsed.has(id)) return;
  const def = defById(id);
  if (!def) return;

  if (def.act === "spike_remove"){
    for (let i=hazards.length-1;i>=0;i--) if (hazards[i].kind==="spike") hazards.splice(i,1);
    setHint("✅ 가시 제거기 사용!");
  }
  if (def.act === "poison_remove"){
    for (let i=hazards.length-1;i>=0;i--) if (hazards[i].kind==="orb") hazards.splice(i,1);
    setHint("✅ 독성 제거기 사용!");
  }

  st.usesLeft = 0;
  oneTimeUsed.add(id);
  renderOwnedCards();
}

let cardPickActive = false;
let cardPickTimer = 0;
let cardOptions = [];
let stageReady = false;

function showCardPick(stageIndex){
  cardPickActive = true;
  cardPickTimer = 5.0;
  open(overlay);
  cardTitleEl.textContent = `스테이지 ${stageIndex+1} 시작 - 카드 선택`;

  const opts = [];
  let guard = 0;
  while (opts.length < 3 && guard++ < 80){
    const rar = rollRarity();
    const c = pickRandomCard(rar);
    if (!c) break;
    if (opts.some(x=>x.id===c.id)) continue;
    opts.push(c);
  }
  while (opts.length < 3){
    const c = pickRandomCard("common") || pickRandomCard("rare") || pickRandomCard("epic") || pickRandomCard("legendary");
    if (!c) break;
    if (opts.some(x=>x.id===c.id)) continue;
    opts.push(c);
  }
  cardOptions = opts;
  renderCardOptions();
}
function renderCardOptions(){
  cardRow.innerHTML = "";
  cardOptions.forEach((c, idx)=>{
    const div = document.createElement("div");
    div.className = `card ${RARITY[c.rarity].cls}`;
    div.innerHTML = `
      <div class="rarity">${RARITY[c.rarity].name} 카드</div>
      <div class="name">${c.name}</div>
      <div class="emoji">${c.emoji}</div>
      <div class="desc">${c.desc}</div>`;
    div.addEventListener("click", ()=>chooseCard(idx));
    cardRow.appendChild(div);
  });
}
function hideCardPick(){ cardPickActive = false; close(overlay); }
function chooseCard(idx){
  const chosen = cardOptions[idx];
  if (!chosen) return;
  addOwnedCard(chosen.id);
  hideCardPick();
  stageReady = true;
}
function autoChooseCard(){
  const idx = Math.floor(Math.random()*cardOptions.length);
  chooseCard(idx);
}

// ====== stages ======
const STAGES = baseStages7();
let currentStageIndex = 0;

// HUD
function syncHud(){
  uiStage.textContent = String(currentStageIndex+1);
  uiHp.textContent = String(Math.max(0, Math.floor(player.hp)));
  uiMaxHp.textContent = String(getMaxHp());
  uiO2.textContent = String(Math.max(0, Math.floor(player.o2)));
  uiMaxO2.textContent = String(getMaxO2());
  uiSeedInv.textContent = String(player.seedInv);
  uiPlanted.textContent = String(player.planted);
  uiTotal.textContent = String(plots.length);
  uiScore.textContent = String(player.score);
}

// 발판 높이
function getSurfaceY(targetX) {
  let bestY = GROUND_Y;
  for (const p of platforms) {
    if (targetX >= p.x && targetX <= p.x + p.w) {
      if (p.y < bestY) bestY = p.y;
    }
  }
  return bestY;
}

function buildStage(stageIndex){
  const S = STAGES[stageIndex];
  world.length = S.length;
  world.camX = 0;

  platforms.length = 0;
  hazards.length = 0;
  seeds.length = 0;
  plots.length = 0;
  tornados.length = 0;

  platforms.push({ x:0, y:GROUND_Y, w:world.length, h:120, type:"ground", toxic:false });

  (S.steps||[]).forEach((s, i) => {
    const isToxic = (S.toxicSteps||[]).includes(i);
    platforms.push({ ...s, type:"rock", toxic:isToxic });
  });

  (S.spikes||[]).forEach(x => hazards.push({ x, y:GROUND_Y-18, w:46, h:18, kind:"spike" }));
  (S.orbs||[]).forEach(o => hazards.push({ x:o.x, y:o.baseY, baseY:o.baseY, w:34, h:34, kind:"orb", t:0 }));

  (S.seedXs||[]).forEach((sx) => {
    const seedSurfaceY = getSurfaceY(sx + 9);
    seeds.push({ x:sx, y: seedSurfaceY - 35, w:24, h:24, taken:false });

    const plotX = sx + 90;
    const plotSurfaceY = getSurfaceY(plotX + 14);
    plots.push({
      x: plotX,
      y: plotSurfaceY - 18,
      w: 28, h: 18,
      planted:false, watered:false, o2Given:false, holdMs:0, plantMs:0,
    });
  });

  if (S.windZones?.count){
    for (let i=0;i<S.windZones.count;i++){
      const x = rand(600, world.length-400);
      const y = rand(220, 360);
      tornados.push({ x, y, w: 54, h: 170, t: rand(0,10) });
    }
  }

  setStageRuleBox(S);
  syncHud();
}

function resetPlayerForStage(keepScore=true){
  player.x = 120; player.y = 250;
  player.vx = 0; player.vy = 0;
  player.onGround = false;

  player.hp = getMaxHp();
  player.o2 = getMaxO2();
  player.seedInv = 0;
  player.planted = 0;
  if (!keepScore) player.score = 0;

  player.invulnMs = 0;
  player.extraJumpUsed = false;

  player.toxicMs = 0; player.toxicTickAcc = 0;
  player.stunMs = 0; player.slowMs = 0;
  player.freezeMs = 0;

  const S = STAGES[currentStageIndex];
  player.nextFreezeMs = S?.snow ? rand(S.snow.freezeMinMs, S.snow.freezeMaxMs) : 0;

  player.acidCycleMs = 0;
  player.acidOn = false;
  player.acidDmgAcc = 0;

  player.suffocatingMs = 0;
  warnOverlay.classList.remove("is-on");
  syncHud();
}

async function beginStage(stageIndex, withCardPick=true){
  currentStageIndex = stageIndex;
  buildStage(currentStageIndex);
  resetPlayerForStage(true);

  stageReady = false;

  openDialogue(stageEnterDialogue(STAGES[stageIndex].name, STAGES[stageIndex].ruleText), ()=>{
    if (withCardPick) showCardPick(currentStageIndex);
    else stageReady = true;
  });
}

async function restartStageNoCard(){
  hideCardPick();
  stageReady = false;
  await showLoadingLine();
  buildStage(currentStageIndex);
  resetPlayerForStage(true);
  stageReady = true;
  if (!running) startLoop();
}

async function goNextStage(){
  const next = currentStageIndex + 1;
  stageReady = false;
  await showLoadingLine();
  await beginStage(next, true);
  if (!running) startLoop();
}

function resetAllGameState(){
  owned.clear();
  pickedOnce.clear();
  oneTimeUsed.clear();

  upgrade.hpTier = 0;
  upgrade.speedTier = 0;
  upgrade.oxygenBonus = 0;
  upgrade.healHoldMs = 900;
  upgrade.instantOxygen = false;
  upgrade.periodicO2 = false;
  upgrade.periodicTimer = 0;
  upgrade.shields.poison = 0;
  upgrade.shields.spike = 0;
  upgrade.hasActivatable = false;
  upgrade.activatableId = null;

  player.maxHpBonus = 0;
  player.jumpsMax = 1;
  player.score = 0;

  renderOwnedCards();
}

function getCardSpeedMultiplier(){
  if (upgrade.speedTier === 3) return 1.30;
  if (upgrade.speedTier === 2) return 1.20;
  if (upgrade.speedTier === 1) return 1.10;
  return 1.00;
}
function getStageSpeedMultiplier(){
  const S = STAGES[currentStageIndex];
  return S?.stageSpeedMul ?? 1.0;
}
function getDebuffSpeedMultiplier(){
  if (player.slowMs > 0) return 0.20;
  if (player.freezeMs > 0) return 0.00;
  if (player.stunMs > 0) return 0.00;
  return 1.00;
}
function getTotalSpeedMultiplier(){
  return getCardSpeedMultiplier() * getStageSpeedMultiplier() * getDebuffSpeedMultiplier();
}

// ====== background preload/draw (핵심!) ======
const BG_CACHE = new Map();

async function preloadStageBackgrounds(){
  const list = STAGES.map(s => s.bgImage).filter(Boolean);
  const uniq = [...new Set(list)];

  await Promise.all(
    uniq.map(rel => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { BG_CACHE.set(rel, img); resolve(); };
      img.onerror = () => { console.warn("BG load fail:", rel); resolve(); };

      // ✅ 무조건 seed-earth/ 기준으로 안전하게 로드됨
      img.src = resolveAsset(rel);
    }))
  );
}

function drawBackground(stage){
  const rel = stage?.bgImage;
  const img = rel ? BG_CACHE.get(rel) : null;

  if (img && img.complete && img.naturalWidth > 0){
    ctx.drawImage(img, 0, 0, W, H);
    return;
  }

  // fallback gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const tone = stage?.bg?.theme || "default";
  switch(tone){
    case "desert":
    case "dryriver":
    case "sandstorm":
      g.addColorStop(0, "rgb(255,185,95)");
      g.addColorStop(1, "rgb(205,125,55)");
      break;
    case "toxiccity":
      g.addColorStop(0, "rgb(120,90,160)");
      g.addColorStop(1, "rgb(40,35,70)");
      break;
    case "snow":
      g.addColorStop(0, "rgb(200,225,255)");
      g.addColorStop(1, "rgb(60,90,130)");
      break;
    default:
      g.addColorStop(0, "rgb(60,60,90)");
      g.addColorStop(1, "rgb(20,20,40)");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);

  if (rel && !img){
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "14px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("배경 로딩 중…", W/2, H/2);
    ctx.restore();
  }
}

// ====== main loop ======
function loop(t){
  if (!running) return;
  const dt = Math.min(32, t - lastT);
  lastT = t;

  if (cardPickActive){
    cardPickTimer -= dt/1000;
    cardTimerEl.textContent = Math.max(0, cardPickTimer).toFixed(1);
    if (cardPickTimer <= 0) autoChooseCard();
    render();
    rafId = requestAnimationFrame(loop);
    pressed.clear();
    return;
  }
  if (!stageReady || dlgActive){
    render();
    rafId = requestAnimationFrame(loop);
    pressed.clear();
    return;
  }

  update(dt);
  render();
  rafId = requestAnimationFrame(loop);
  pressed.clear();
}

function update(dt){
  if (wasPressed("KeyQ")) { restartStageNoCard(); return; }
  if (wasPressed("KeyR")) useActivatableCard();

  const S = STAGES[currentStageIndex];

  if (upgrade.periodicO2){
    upgrade.periodicTimer += dt;
    if (upgrade.periodicTimer >= 3000){
      upgrade.periodicTimer -= 3000;
      player.o2 = clamp(player.o2 + 5, 0, getMaxO2());
      player.score += 10;
    }
  }

  player.o2 -= (2.0 * dt / 1000);
  if (player.o2 < 0) player.o2 = 0;

  const isSuffocating = (player.o2 <= 0.01);
  if (isSuffocating){
    player.suffocatingMs += dt;
    warnOverlay.classList.add("is-on");
    if (player.suffocatingMs > 1000){
      player.hp = clamp(player.hp - 1, 0, getMaxHp());
      player.suffocatingMs = 0;
    }
  } else {
    player.suffocatingMs = 0;
    warnOverlay.classList.remove("is-on");
  }

  if (S?.acidRain){
    player.acidCycleMs += dt;
    const cycle = S.acidRain.onMs + S.acidRain.offMs;
    const m = player.acidCycleMs % cycle;
    player.acidOn = (m >= S.acidRain.offMs);

    if (player.acidOn){
      player.acidDmgAcc += dt;
      while (player.acidDmgAcc >= 1000){
        player.acidDmgAcc -= 1000;
        player.hp = clamp(player.hp - S.acidRain.dps, 0, getMaxHp());
      }
    } else {
      player.acidDmgAcc = 0;
    }
  } else {
    player.acidOn = false;
  }

  if (S?.snow){
    if (player.nextFreezeMs > 0){
      player.nextFreezeMs -= dt;
      if (player.nextFreezeMs <= 0){
        player.freezeMs = S.snow.freezeMs;
        player.nextFreezeMs = rand(S.snow.freezeMinMs, S.snow.freezeMaxMs);
        setHint("🥶 빙결! 2초간 움직일 수 없습니다.");
      }
    }
  }

  if (player.stunMs > 0) player.stunMs -= dt;
  if (player.slowMs > 0) player.slowMs -= dt;
  if (player.freezeMs > 0) player.freezeMs -= dt;
  if (player.stunMs < 0) player.stunMs = 0;
  if (player.slowMs < 0) player.slowMs = 0;
  if (player.freezeMs < 0) player.freezeMs = 0;

  const left  = isHeld("ArrowLeft") || isHeld("KeyA");
  const right = isHeld("ArrowRight") || isHeld("KeyD");
  const jumpPressed  = wasPressed("Space") || wasPressed("ArrowUp") || wasPressed("KeyW");
  const plantPressed = wasPressed("KeyE");
  const waterPressed = wasPressed("KeyF");

  const canAct = (player.stunMs <= 0 && player.freezeMs <= 0);

  if (left) player.direction = -1;
  if (right) player.direction = 1;

  const accelBase = 1.65;
  const maxSpd = world.maxSpeedBase * getTotalSpeedMultiplier();
  const suffMul = isSuffocating ? 0.72 : 1.00;

  if (canAct){
    if (left) player.vx -= accelBase * suffMul;
    if (right) player.vx += accelBase * suffMul;
  }

  const nearGround = player.y + player.h > 390;
  player.vx *= nearGround ? world.frictionNearGround : 0.90;
  player.vx = clamp(player.vx, -maxSpd*suffMul, maxSpd*suffMul);

  if (jumpPressed && canAct){
    if (player.onGround){
      player.vy = -15.8;
      player.onGround = false;
      player.extraJumpUsed = false;
    } else if (player.jumpsMax >= 2 && !player.extraJumpUsed){
      player.vy = -15.0;
      player.extraJumpUsed = true;
    }
  }

  player.vy += GRAV;
  player.vy = clamp(player.vy, -30, 20);

  player.x += player.vx;
  player.y += player.vy;
  player.x = clamp(player.x, 0, world.length - player.w);

  // collisions
  player.onGround = false;
  let stoodPlatform = null;

  for (const p of platforms){
    const rP = { x:p.x, y:p.y, w:p.w, h:p.h };
    const r  = { x:player.x, y:player.y, w:player.w, h:player.h };
    if (overlap(r, rP)){
      const prevY = player.y - player.vy;
      if (prevY + player.h <= p.y + 8 && player.vy >= 0){
        player.y = p.y - player.h;
        player.vy = 0;
        player.onGround = true;
        player.extraJumpUsed = false;
        stoodPlatform = p;
      } else if (prevY >= p.y + p.h - 8 && player.vy < 0){
        player.y = p.y + p.h;
        player.vy = 0;
      } else {
        if (player.vx > 0) player.x = p.x - player.w;
        if (player.vx < 0) player.x = p.x + p.w;
        player.vx *= 0.2;
      }
    }
  }

  // stage3 toxic platform DOT
  if (stoodPlatform?.toxic){
    player.toxicMs = Math.max(player.toxicMs, 3000);
  }
  if (player.toxicMs > 0){
    player.toxicMs -= dt;
    player.toxicTickAcc += dt;
    while (player.toxicTickAcc >= 1000){
      player.toxicTickAcc -= 1000;
      player.hp = clamp(player.hp - 10, 0, getMaxHp());
      setHint("☣️ 독성 노출! (HP -10)");
    }
    if (player.toxicMs <= 0){
      player.toxicMs = 0;
      player.toxicTickAcc = 0;
    }
  }

  // seed pickup
  for (const s of seeds){
    if (s.taken) continue;
    if (overlap({x:player.x,y:player.y,w:player.w,h:player.h}, {x:s.x,y:s.y,w:s.w,h:s.h})){
      s.taken = true;
      player.seedInv += 1;
      player.score += 120 + currentStageIndex * 25;
      setHint("씨앗 획득! 심는 자리에서 E로 심기");
    }
  }

  // plant / water
  if (plantPressed && player.plantCooldownMs <= 0 && canAct){
    for (const pl of plots){
      if (pl.planted) continue;
      const near = overlap({x:player.x,y:player.y,w:player.w,h:player.h},{x:pl.x-14,y:pl.y-28,w:pl.w+28,h:pl.h+56});
      if (!near) continue;
      if (player.seedInv > 0){
        pl.planted = true;
        pl.watered = false;
        pl.o2Given = false;
        pl.holdMs = 0;
        pl.plantMs = 0;
        player.seedInv -= 1;
        player.planted += 1;
        player.score += 260 + currentStageIndex * 35;
        setHint("🌱 심기 완료! 이제 F로 물을 주세요.");
        player.plantCooldownMs = 1000;
      } else setHint("씨앗이 부족합니다.");
      break;
    }
  }

  if (waterPressed && player.waterCooldownMs <= 0 && canAct){
    for (const pl of plots){
      if (!pl.planted || pl.watered || pl.plantMs <= 800) continue;
      const near = overlap({x:player.x,y:player.y,w:player.w,h:player.h},{x:pl.x-18,y:pl.y-36,w:pl.w+36,h:pl.h+72});
      if (!near) continue;

      pl.watered = true;
      pl.holdMs = 0;

      if (upgrade.instantOxygen && !pl.o2Given){
        const gain = 10 + upgrade.oxygenBonus;
        player.o2 = clamp(player.o2 + gain, 0, getMaxO2());
        pl.o2Given = true;
        player.score += 80;
        setHint(`✨ 즉시 O₂ +${gain}!`);
      } else setHint("💧 물 주기 완료! 식물 옆에 잠깐 머물면 O₂를 얻습니다.");
      player.waterCooldownMs = 1000;
      break;
    }
  }

  if (player.invulnMs > 0) player.invulnMs -= dt;
  player.plantCooldownMs = Math.max(0, player.plantCooldownMs - dt);
  player.waterCooldownMs = Math.max(0, player.waterCooldownMs - dt);

  for (const pl of plots){
    if (pl.planted && !pl.watered) pl.plantMs += dt;
  }

  // hazards
  for (const h of hazards){
    if (h.kind === "orb"){
      const speedMul = 1 + currentStageIndex*0.18;
      const amp = 16 + currentStageIndex*5;
      h.t += dt * 0.0042 * speedMul;
      h.y = h.baseY + Math.sin(h.t) * amp;
    }
    if (player.invulnMs <= 0){
      if (overlap({x:player.x,y:player.y,w:player.w,h:player.h}, {x:h.x,y:h.y,w:h.w,h:h.h})){
        if (h.kind==="orb" && upgrade.shields.poison > 0){
          upgrade.shields.poison -= 1;
          const st = owned.get("shield_poison");
          if (st && st.usesLeft > 0){ st.usesLeft = 0; oneTimeUsed.add("shield_poison"); renderOwnedCards(); }
          setHint("🟣 독성 보호막 발동!");
          player.invulnMs = 450;
          continue;
        }
        if (h.kind==="spike" && upgrade.shields.spike > 0){
          upgrade.shields.spike -= 1;
          const st = owned.get("shield_spike");
          if (st && st.usesLeft > 0){ st.usesLeft = 0; oneTimeUsed.add("shield_spike"); renderOwnedCards(); }
          setHint("🛡️ 가시 방패 발동!");
          player.invulnMs = 450;
          continue;
        }
        const dmg = (h.kind==="spike") ? (18 + currentStageIndex*3) : (12 + currentStageIndex*3);
        player.hp -= dmg;
        player.invulnMs = 650;
        player.vx += (player.x < h.x) ? -5 : 5;
        player.vy = -6;
      }
    }
  }

  // stage4 tornado
  for (const tw of tornados){
    tw.t += dt * 0.002;
    const wobble = Math.sin(tw.t) * 10;
    const hit = overlap(
      {x:player.x,y:player.y,w:player.w,h:player.h},
      {x:tw.x+wobble, y:tw.y, w:tw.w, h:tw.h}
    );
    if (hit){
      player.stunMs = Math.max(player.stunMs, 2000);
      player.slowMs = Math.max(player.slowMs, 5000);
      setHint("🌪️ 회오리! 2초 행동불가 + 5초 이속 감소");
    }
  }

  // death
  if (player.hp <= 0){
    player.hp = 0;
    stopLoop();
    openDialogue(
      [
        { name:"SYSTEM", text:"괜찮아! 다시 해볼까?" },
        { name:"ROBOT", text:"…재시도." },
      ],
      () => restartStageNoCard()
    );
    syncHud();
    return;
  }

  world.camX = clamp(player.x - W*0.35, 0, world.length - W);

  // plant O2 gain
  for (const pl of plots){
    if (!pl.planted) continue;
    if (!pl.watered) { pl.holdMs = 0; continue; }
    if (pl.o2Given) continue;

    const nearPlant = overlap({x:player.x,y:player.y,w:player.w,h:player.h},{x:pl.x-22,y:pl.y-48,w:pl.w+44,h:pl.h+96});
    if (nearPlant){
      pl.holdMs += dt;
      if (pl.holdMs >= upgrade.healHoldMs){
        const gain = 10 + upgrade.oxygenBonus;
        player.o2 = clamp(player.o2 + gain, 0, getMaxO2());
        player.score += 60;
        pl.o2Given = true;
        pl.holdMs = 0;
        setHint(`O₂ +${gain} (식물)`);
      }
    } else pl.holdMs = 0;
  }

  // clear
  if (player.planted >= plots.length){
    stopLoop();
    if (currentStageIndex < STAGES.length - 1){
      openDialogue(
        [
          { name:"SYSTEM", text:`${STAGES[currentStageIndex].name} 정화 완료.` },
          { name:"ROBOT", text:"다음 구역으로 이동한다." },
        ],
        async () => { await goNextStage(); }
      );
    } else {
      openDialogue(END_DIALOGUE, async () => {
        openDialogue(
          [{ name:"ROBOT", text:`...임무 완료. Score: ${player.score}  (재시작하려면 Space)` }],
          async () => { resetAllGameState(); await runIntroAndStart(); }
        );
      });
    }
    syncHud();
    return;
  }

  syncHud();
}

// ====== rendering helpers ======
function drawPulseRing(cx, cy, baseR, t, strokeA, strokeB){
  const p = (Math.sin(t) + 1)/2;
  const r = baseR + p*6;
  ctx.save();
  ctx.globalAlpha = 0.78 - p*0.25;
  ctx.strokeStyle = strokeA;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = strokeB;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r-6, 0, Math.PI*2); ctx.stroke();
  ctx.restore();
}
function drawTextTag(x, y, text){
  ctx.save();
  ctx.font = "12px system-ui";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const w = ctx.measureText(text).width + 10;
  ctx.fillRect(x-5, y-14, w, 16);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(text, x, y-2);
  ctx.restore();
}

function render(){
  ctx.clearRect(0,0,W,H);
  const S = STAGES[currentStageIndex] || STAGES[0];

  drawBackground(S);

  if (player.o2 <= 0.01){
    ctx.fillStyle = "rgba(10,0,0,0.12)";
    ctx.fillRect(0,0,W,H);
  }

  // acid overlay
  if (player.acidOn){
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(120,255,160,1)";
    for (let i=0;i<90;i++){
      const x = (i*22 + (performance.now()*0.25)%W) % W;
      const y = (i*11 + (performance.now()*0.65)%H) % H;
      ctx.fillRect(x, y, 2, 10);
    }
    ctx.restore();
  }

  // freeze overlay
  if (player.freezeMs > 0){
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(160,220,255,1)";
    ctx.fillRect(0,0,W,H);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(-world.camX, 0);

  // platforms
  for (const p of platforms){
    if (p.type==="ground"){
      ctx.fillStyle = "rgba(120,78,35,0.65)";
      ctx.fillRect(p.x,p.y,p.w,p.h);
    } else {
      if (p.toxic){
        ctx.fillStyle = "rgba(120,60,180,0.35)";
        ctx.fillRect(p.x,p.y,p.w,p.h);
        ctx.strokeStyle="rgba(210,120,255,0.65)";
        ctx.lineWidth=2;
        ctx.strokeRect(p.x,p.y,p.w,p.h);
      } else {
        ctx.fillStyle = currentStageIndex < 2 ? "rgba(140,95,48,0.72)" : "rgba(95,100,120,0.55)";
        ctx.fillRect(p.x,p.y,p.w,p.h);
        ctx.strokeStyle="rgba(0,0,0,0.22)";
        ctx.strokeRect(p.x,p.y,p.w,p.h);
      }
    }
  }

  // seeds
  // seeds (image)
for (const s of seeds){
  if (s.taken) continue;

  if (IMG.seed.complete){
    ctx.drawImage(
      IMG.seed,
      s.x,
      s.y,
      s.w,
      s.h
    );
  }
}


  // plots
// ====== plots (심는 자리 + 식물 이미지) ======
const time = performance.now() * 0.004;

for (const pl of plots){
  // 흙 바닥
  ctx.fillStyle = "rgba(20,16,10,0.65)";
  ctx.fillRect(pl.x, pl.y, pl.w, pl.h);

  const cx = pl.x + pl.w / 2;
  const cy = pl.y + pl.h / 2;

  // 🌱 식물 이미지 위치 (흙 위)
  const imgX = cx - 16;
  const imgY = pl.y - 32;

  if (!pl.planted){
    // 아직 안 심은 상태
    drawPulseRing(
      cx,
      cy,
      16,
      time,
      "rgba(120,255,180,0.95)",
      "rgba(255,255,255,0.35)"
    );

  } else {
    // 심은 상태 → 이미지 표시
    let img = IMG.plantSeed;

    if (pl.watered && !pl.o2Given) {
      img = IMG.plantGrow;
    }
    if (pl.o2Given) {
      img = IMG.plantDone;
    }

    if (img && img.complete){
      ctx.drawImage(img, imgX, imgY, 32, 32);
    }

    // 기존 가이드 UI 유지
    if (!pl.watered){
      drawPulseRing(
        cx,
        cy,
        18,
        time + 0.6,
        "rgba(255,230,140,0.95)",
        "rgba(255,255,255,0.20)"
      );
      drawTextTag(pl.x - 10, pl.y - 12, "WATER (F)");

    } else if (!pl.o2Given){
      drawPulseRing(
        cx,
        cy,
        18,
        time + 1.0,
        "rgba(255,170,90,0.95)",
        "rgba(120,255,180,0.22)"
      );
      drawTextTag(pl.x - 10, pl.y - 12, "HOLD…");
    }
  }
}


  // hazards
  for (const h of hazards){
    if (h.kind==="spike"){
      ctx.fillStyle="rgba(255,90,90,0.85)";
      ctx.beginPath();
      ctx.moveTo(h.x, h.y+h.h);
      ctx.lineTo(h.x+h.w/2, h.y);
      ctx.lineTo(h.x+h.w, h.y+h.h);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle="rgba(170,90,255,0.78)";
      ctx.beginPath();
      ctx.arc(h.x+h.w/2, h.y+h.h/2, h.w/2, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle="rgba(255,255,255,0.22)";
      ctx.stroke();
    }
  }

  // tornados
  for (const tw of tornados){
    const wobble = Math.sin(tw.t) * 10;
    const x = tw.x + wobble;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "rgba(255,230,180,0.75)";
    ctx.beginPath();
    ctx.ellipse(x+tw.w/2, tw.y+tw.h/2, tw.w/2, tw.h/2, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.strokeRect(x, tw.y, tw.w, tw.h);
    ctx.restore();
  }

  // player sprite
  const blink = player.invulnMs > 0 && Math.floor(performance.now()/80)%2===0;
  ctx.globalAlpha = blink ? 0.35 : 1;

  const aspect = player.imgWidth / player.imgHeight;
  let dWidth, dHeight;
  if (aspect > player.w / player.h) { dWidth = player.w; dHeight = player.w / aspect; }
  else { dHeight = player.h; dWidth = player.h * aspect; }
  const dx = player.x + (player.w - dWidth) / 2;
  const dy = player.y + (player.h - dHeight) / 2;

  ctx.save();
  ctx.translate(dx + dWidth / 2, dy + dHeight / 2);
  ctx.scale(player.direction, 1);

  if (player.image.complete && player.image.naturalWidth > 0){
    ctx.drawImage(player.image, -dWidth / 2, -dHeight / 2, dWidth, dHeight);
  } else {
    ctx.fillStyle = "rgba(120,255,180,0.9)";
    ctx.fillRect(-dWidth/2, -dHeight/2, dWidth, dHeight);
  }
  ctx.restore();

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ✅ 여기서부터 끝까지 붙여넣기

// ====== 최종 실행부 (INTRO_DIALOGUE 연동 버전) ======

async function startGame() {
  console.log("게임 시작: INTRO_DIALOGUE 로드");
  
  const mainMenu = document.getElementById('main-menu');
  const gameContainer = document.getElementById('game-container');

  // 1. 화면 전환
  if (mainMenu) mainMenu.style.display = 'none';
  if (gameContainer) gameContainer.style.display = 'block';

  // 2. UI 및 상태 초기화
  close(overlay);
  close(loading);
  close(dialogue);
  resetAllGameState();

  // 3. 리소스 로드
  await preloadStageBackgrounds();
  player.image.src = resolveAsset("robot.png");
  loadPlantImages();


  // 4. ✅ 핵심: dialogue.js에서 가져온 INTRO_DIALOGUE를 바로 실행
  openDialogue(INTRO_DIALOGUE, async () => {
    // 대화가 모두 끝나면 실행될 콜백
    await showLoadingLine();
    await beginStage(0, true);
    setHint("←/→ 이동, Space 점프, E 심기, F 물주기, Q 재시작, R 카드발동, Shift AUTO");
    renderOwnedCards();
    if (!running) startLoop();
  });

  if (typeof render === 'function') render();
}

// 시작 버튼 연결
document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.onclick = startGame;
  }
});
