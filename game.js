(() => {
  // ===== DOM =====
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const stageEl = document.getElementById("stage");
  const hpEl = document.getElementById("hp");
  const maxHpEl = document.getElementById("maxHp");
  const o2El = document.getElementById("o2");
  const maxO2El = document.getElementById("maxO2");
  const seedInvEl = document.getElementById("seedInv");
  const plantedEl = document.getElementById("planted");
  const totalEl = document.getElementById("total");
  const scoreEl = document.getElementById("score");

  const ownedCardsEl = document.getElementById("ownedCards");
  const hintEl = document.getElementById("hint");

  const warnOverlay = document.getElementById("warnOverlay");

  const cardOverlay = document.getElementById("cardOverlay");
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
  const dlgAvatarFallback = document.getElementById("dlgAvatarFallback");

  // ===== CANVAS RESIZE (스크롤 없이 꽉 차게) =====
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    // 내부 픽셀 크기
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw는 CSS 픽셀 기준
  }
  window.addEventListener("resize", fitCanvas);

  // ===== UI HELPERS =====
  function setWarn(on) {
    warnOverlay.classList.toggle("is-on", !!on);
  }
  function openOverlay(el, on) {
    el.classList.toggle("is-open", !!on);
  }
  function openDialogue(on) {
    dialogue.classList.toggle("is-open", !!on);
  }
  function setAvatar(src) {
    if (!src) {
      dlgAvatar.style.display = "none";
      dlgAvatarFallback.style.display = "grid";
      return;
    }
    dlgAvatar.src = src;
    dlgAvatar.onload = () => {
      dlgAvatar.style.display = "block";
      dlgAvatarFallback.style.display = "none";
    };
    dlgAvatar.onerror = () => {
      dlgAvatar.style.display = "none";
      dlgAvatarFallback.style.display = "grid";
    };
  }
  function addOwnedCard({ emoji, name, desc }) {
    const el = document.createElement("div");
    el.className = "ownedCard";
    el.innerHTML = `
      <div class="emo">${emoji}</div>
      <div>
        <div class="t">${name}</div>
        <div class="d">${desc}</div>
      </div>
    `;
    ownedCardsEl.appendChild(el);
  }

  // ===== CARD PICK (테스트용) =====
  const sampleCards = [
    { rarity: "일반 카드", name: "빠른 속도", emoji: "🏃", desc: "이동 속도 +10%", apply: () => (player.speedMul += 0.10) },
    { rarity: "매우 희귀 카드", name: "더블 점프!", emoji: "🦘", desc: "공중 점프 1회 추가", apply: () => (player.extraJumps += 1) },
    { rarity: "희귀 카드", name: "산소 절약", emoji: "🫁", desc: "산소 소모 -20%", apply: () => (state.o2DrainMul *= 0.8) },
  ];

  function showCardPick(title = "스테이지 시작 - 카드 선택", seconds = 5.0) {
    cardTitleEl.textContent = title;
    cardRow.innerHTML = "";
    let chosen = false;

    sampleCards.forEach((c) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="rarity">${c.rarity}</div>
        <div class="name">${c.name}</div>
        <div class="emoji">${c.emoji}</div>
        <div class="desc">${c.desc}</div>
      `;
      card.onclick = () => {
        if (chosen) return;
        chosen = true;
        c.apply?.();
        addOwnedCard({ emoji: c.emoji, name: c.name, desc: c.desc });
        openOverlay(cardOverlay, false);
      };
      cardRow.appendChild(card);
    });

    openOverlay(cardOverlay, true);

    let t = seconds;
    cardTimerEl.textContent = t.toFixed(1);
    const tick = setInterval(() => {
      if (!cardOverlay.classList.contains("is-open")) {
        clearInterval(tick);
        return;
      }
      t -= 0.1;
      if (t <= 0) {
        clearInterval(tick);
        if (!chosen) {
          chosen = true;
          // 자동 선택: 첫 카드
          sampleCards[0].apply?.();
          addOwnedCard({ emoji: sampleCards[0].emoji, name: sampleCards[0].name, desc: sampleCards[0].desc });
        }
        openOverlay(cardOverlay, false);
      } else {
        cardTimerEl.textContent = t.toFixed(1);
      }
    }, 100);
  }

  // ===== DIALOGUE (테스트용) =====
  const script = [
    { name: "연구원1", role: "LAB-01", avatar: "./avatars/unknown_avatar.png", text: "접속 확인했어! 프로젝트 'Plant Back Earth' 준비 완료~" },
    { name: "SYSTEM", role: "SIGNAL", avatar: "./avatars/robot_avatar.png", text: "←/→ 이동, Space 점프. E 심기, F 물주기." },
  ];
  let dlgIdx = 0;
  let auto = false;
  let autoTimer = null;

  function renderDialogueLine() {
    const line = script[dlgIdx];
    if (!line) return;
    dlgNameEl.textContent = line.name ?? "???";
    dlgRoleEl.textContent = line.role ?? "SIGNAL";
    dlgTextEl.textContent = line.text ?? "…";
    setAvatar(line.avatar);
    openDialogue(true);
  }

  function nextDialogue() {
    dlgIdx++;
    if (dlgIdx >= script.length) {
      openDialogue(false);
      return;
    }
    renderDialogueLine();
  }

  function setAuto(on) {
    auto = !!on;
    dlgAutoBtn.textContent = auto ? "AUTO: ON" : "AUTO: OFF";
    if (autoTimer) clearInterval(autoTimer);
    if (auto) {
      autoTimer = setInterval(() => {
        if (!dialogue.classList.contains("is-open")) return;
        nextDialogue();
      }, 2200);
    }
  }

  dlgAutoBtn.addEventListener("click", () => setAuto(!auto));
  dlgSkipBtn.addEventListener("click", () => {
    openDialogue(false);
    setAuto(false);
  });

  // 클릭/스페이스 다음
  function tryAdvanceDialogue() {
    if (!dialogue.classList.contains("is-open")) return;
    nextDialogue();
  }
  dialogue.addEventListener("click", tryAdvanceDialogue);

  // ===== GAME (간단 실행 확인용) =====
  const keys = new Set();

  const state = {
    stage: 1,
    hp: 100,
    maxHp: 100,
    o2: 50,
    maxO2: 50,
    seeds: 0,
    planted: 0,
    total: 7,
    score: 0,
    o2DrainMul: 1,
  };

  const player = {
    x: 120, y: 220,
    w: 32, h: 36,
    vx: 0, vy: 0,
    onGround: false,
    speed: 240,
    jump: 520,
    grav: 1500,
    extraJumps: 0,
    jumpLeft: 0,
    speedMul: 1,
  };

  const groundY = () => {
    // 바닥을 화면 아래쪽에 “적당히”
    const rect = canvas.getBoundingClientRect();
    return rect.height * 0.76;
  };

  function syncHud() {
    stageEl.textContent = String(state.stage);
    hpEl.textContent = String(Math.max(0, Math.floor(state.hp)));
    maxHpEl.textContent = String(state.maxHp);
    o2El.textContent = String(Math.max(0, Math.floor(state.o2)));
    maxO2El.textContent = String(state.maxO2);
    seedInvEl.textContent = String(state.seeds);
    plantedEl.textContent = String(state.planted);
    totalEl.textContent = String(state.total);
    scoreEl.textContent = String(state.score);
    setWarn(state.o2 <= 0);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    // 산소 소모(테스트)
    state.o2 = clamp(state.o2 - dt * 0.8 * state.o2DrainMul, 0, state.maxO2);
    if (state.o2 <= 0) state.hp = clamp(state.hp - dt * 4, 0, state.maxHp);

    // 입력
    const left = keys.has("ArrowLeft") || keys.has("a");
    const right = keys.has("ArrowRight") || keys.has("d");
    const speed = player.speed * player.speedMul;

    player.vx = (right - left) * speed;

    // 물리
    player.vy += player.grav * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // 바닥 충돌
    const gy = groundY();
    if (player.y + player.h >= gy) {
      player.y = gy - player.h;
      player.vy = 0;
      if (!player.onGround) {
        player.onGround = true;
        player.jumpLeft = player.extraJumps;
      }
    } else {
      player.onGround = false;
    }

    // 화면 밖 제한
    player.x = clamp(player.x, 16, W - player.w - 16);

    // DRAW
    ctx.clearRect(0, 0, W, H);

    // 배경(간단)
    ctx.fillStyle = "#7a5b3a";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#5a3f28";
    ctx.fillRect(0, gy, W, H - gy);

    // 플레이어(로봇 느낌 사각형)
    ctx.fillStyle = "#d9e2f2";
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = "#2a3344";
    ctx.fillRect(player.x + 6, player.y + 10, player.w - 12, 6);

    // UI 텍스트(디버그 최소)
    ctx.fillStyle = "rgba(255,255,255,.65)";
    ctx.font = "12px system-ui";
    ctx.fillText("UI만 판박이 적용된 상태(게임 로직은 네 기존 game.js로 교체하면 됨)", 16, 18);

    syncHud();
    requestAnimationFrame(loop);
  }

  function jump() {
    if (dialogue.classList.contains("is-open")) {
      tryAdvanceDialogue();
      return;
    }
    if (player.onGround) {
      player.vy = -player.jump;
      player.onGround = false;
    } else if (player.jumpLeft > 0) {
      player.jumpLeft--;
      player.vy = -player.jump * 0.92;
    }
  }

  window.addEventListener("keydown", (e) => {
    // 스크롤 방지
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();

    if (e.key === "Shift") setAuto(!auto);
    if (e.key === " ") jump();
    if (e.key === "Enter") showCardPick();

    keys.add(e.key);
  }, { passive:false });

  window.addEventListener("keyup", (e) => keys.delete(e.key));

  // ===== BOOT =====
  function boot() {
    openOverlay(loading, true);
    loadingText.textContent = "UI 구성 중…";
    // 살짝 로딩 연출
    setTimeout(() => {
      openOverlay(loading, false);

      fitCanvas();
      syncHud();

      // 카드 선택 + 대화 시작 (스샷처럼)
      showCardPick("스테이지 1 시작 - 카드 선택", 5.0);

      dlgIdx = 0;
      renderDialogueLine();
      openDialogue(true);

      requestAnimationFrame(loop);
    }, 250);
  }

  boot();
})();
