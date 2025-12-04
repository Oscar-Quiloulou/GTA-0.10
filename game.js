// game.js — MiniGTA prototype amélioré (minimap + PNJ + collisions stables)
(() => {
  // --- Canvas setup ---
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const minimapEl = document.getElementById('minimap');

  function fitCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const maxW = Math.min(window.innerWidth - 20, 1100);
    const w = Math.min(maxW, 1000);
    const h = Math.max(400, Math.min(window.innerHeight - 180, 800));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  // --- DOM elements ---
  const speedEl = document.getElementById('speed');
  const posEl = document.getElementById('pos');
  const cpEl = document.getElementById('checkpoint'); // réservé pour prochaine feature
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const overlay = document.getElementById('overlay');
  const ovClose = document.getElementById('ov-close');

  // --- Input ---
  const input = { left: false, right: false, accel: false, brake: false };
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') input.left = true;
    if (e.key === 'ArrowRight') input.right = true;
    if (e.key === 'ArrowUp') input.accel = true;
    if (e.key === 'ArrowDown') input.brake = true;
    if (e.key === 'Escape') togglePause();
  });
  window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft') input.left = false;
    if (e.key === 'ArrowRight') input.right = false;
    if (e.key === 'ArrowUp') input.accel = false;
    if (e.key === 'ArrowDown') input.brake = false;
  });
  function bindBtn(btn, key) {
    if (!btn) return;
    btn.addEventListener('pointerdown', e => { e.preventDefault(); input[key] = true; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
      btn.addEventListener(ev, e => { e.preventDefault(); input[key] = false; })
    );
  }
  bindBtn(document.getElementById('leftBtn'), 'left');
  bindBtn(document.getElementById('rightBtn'), 'right');
  bindBtn(document.getElementById('accelBtn'), 'accel');
  bindBtn(document.getElementById('brakeBtn'), 'brake');

  // --- World config ---
  const TILE = 64;
  const MAP_W = 80;
  const MAP_H = 60;
  const map = new Uint8Array(MAP_W * MAP_H); // 0=grass,1=road,2=wall

  function index(x, y) { return y * MAP_W + x; }
  function generateMap() {
    // grass
    for (let i = 0; i < map.length; i++) map[i] = 0;
    // horizontal roads
    for (let y = 10; y < MAP_H - 10; y += 6)
      for (let x = 0; x < MAP_W; x++) map[index(x, y)] = 1;
    // vertical roads
    for (let x = 8; x < MAP_W - 8; x += 10)
      for (let y = 0; y < MAP_H; y++) map[index(x, y)] = 1;
    // walls
    for (let i = 0; i < 50; i++) {
      const x = Math.floor(Math.random() * (MAP_W - 3));
      const y = Math.floor(Math.random() * (MAP_H - 3));
      for (let yy = 0; yy < 2; yy++)
        for (let xx = 0; xx < 2; xx++)
          map[index(x + xx, y + yy)] = 2;
    }
  }
  generateMap();

  // --- Camera & player ---
  const cam = { x: MAP_W * TILE / 2, y: MAP_H * TILE / 2 };
  const player = {
    x: cam.x + 50,
    y: cam.y + 50,
    angle: 0,
    w: 42, h: 22,
    vx: 0, vy: 0,
    maxSpeed: 300,
    accel: 400,
    brake: 700,
    steerSpeed: 3.5,
    grip: 6
  };

  // --- NPCs ---
  const npcs = Array.from({ length: 12 }, () => ({
    x: Math.random() * MAP_W * TILE,
    y: Math.random() * MAP_H * TILE,
    w: 20, h: 20,
    angle: Math.random() * Math.PI * 2,
    speed: 55
  }));
  function updateNPCs(dt) {
    for (const n of npcs) {
      // avance
      n.x += Math.cos(n.angle) * n.speed * dt;
      n.y += Math.sin(n.angle) * n.speed * dt;
      // si hors route, tourne
      if (tileAtWorld(n.x, n.y) !== 1) n.angle += Math.PI / 2;
      // petites limites monde
      n.x = Math.max(0, Math.min(MAP_W * TILE, n.x));
      n.y = Math.max(0, Math.min(MAP_H * TILE, n.y));
    }
  }
  function drawNPCs(left, top) {
    ctx.fillStyle = '#2aa1ff';
    for (const n of npcs) {
      ctx.fillRect(n.x - left - n.w / 2, n.y - top - n.h / 2, n.w, n.h);
    }
  }

  // --- Helpers ---
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function tileAtWorld(x, y) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 2;
    return map[index(tx, ty)];
  }

  // SAT simplifié: tentative séparée X/Y pour éviter l’intrusion dans les murs
  function rectTouchesWall(cx, cy, w, h) {
    const halfW = w / 2, halfH = h / 2;
    const points = [
      { x: cx - halfW, y: cy - halfH },
      { x: cx + halfW, y: cy - halfH },
      { x: cx - halfW, y: cy + halfH },
      { x: cx + halfW, y: cy + halfH },
    ];
    for (const p of points) {
      if (tileAtWorld(p.x, p.y) === 2) return true;
    }
    return false;
  }

  function tryMove(entity, dx, dy) {
    // X
    const nx = entity.x + dx;
    if (!rectTouchesWall(nx, entity.y, entity.w, entity.h)) {
      entity.x = nx;
    } else {
      // amorti en cas de choc sur X
      entity.vx *= -0.2;
    }
    // Y
    const ny = entity.y + dy;
    if (!rectTouchesWall(entity.x, ny, entity.w, entity.h)) {
      entity.y = ny;
    } else {
      entity.vy *= -0.2;
    }
    // bornes monde
    entity.x = clamp(entity.x, entity.w / 2, MAP_W * TILE - entity.w / 2);
    entity.y = clamp(entity.y, entity.h / 2, MAP_H * TILE - entity.h / 2);
  }

  // --- Pause / overlay ---
  let paused = false;
  function togglePause() {
    paused = !paused;
    overlay.classList.toggle('hidden', !paused);
  }
  ovClose.addEventListener('click', togglePause);

  // --- Save / load ---
  function saveGame() {
    const data = {
      player: { x: player.x, y: player.y, angle: player.angle, vx: player.vx, vy: player.vy }
    };
    localStorage.setItem('minigta_save', JSON.stringify(data));
    alert('Sauvegardé !');
  }
  function loadGame() {
    const raw = localStorage.getItem('minigta_save');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      Object.assign(player, data.player);
    } catch (e) {
      console.warn('Load failed', e);
    }
  }
  saveBtn.addEventListener('click', saveGame);
  resetBtn.addEventListener('click', () => {
    localStorage.removeItem('minigta_save');
    location.reload();
  });

  // --- Minimap ---
  const miniCanvas = document.createElement('canvas');
  miniCanvas.width = 220; // un peu plus large
  miniCanvas.height = 160;
  minimapEl.appendChild(miniCanvas);
  const miniCtx = miniCanvas.getContext('2d');

  function drawMinimap() {
    miniCtx.fillStyle = '#0b0b0b';
    miniCtx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);

    const worldW = MAP_W * TILE;
    const worldH = MAP_H * TILE;
    const scaleX = miniCanvas.width / worldW;
    const scaleY = miniCanvas.height / worldH;

    // routes et murs
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = map[index(x, y)];
        if (t === 1) miniCtx.fillStyle = '#8c8c8c';
        else if (t === 2) miniCtx.fillStyle = '#444';
        else continue;
        miniCtx.fillRect(x * TILE * scaleX, y * TILE * scaleY, TILE * scaleX, TILE * scaleY);
      }
    }

    // NPCs
    miniCtx.fillStyle = '#2aa1ff';
    for (const n of npcs) {
      miniCtx.fillRect(n.x * scaleX - 1, n.y * scaleY - 1, 3, 3);
    }

    // joueur
    miniCtx.fillStyle = '#ff3b3b';
    miniCtx.fillRect(player.x * scaleX - 2, player.y * scaleY - 2, 4, 4);
  }

  // --- Game loop ---
  let lastTs = performance.now();
  function update(dt) {
    // direction avant selon angle
    const fdx = Math.cos(player.angle);
    const fdy = Math.sin(player.angle);

    // accélération / frein
    if (input.accel) { player.vx += fdx * player.accel * dt; player.vy += fdy * player.accel * dt; }
    if (input.brake) { player.vx -= fdx * player.brake * dt * 0.7; player.vy -= fdy * player.brake * dt * 0.7; }

    // steering réduit avec la vitesse
    const speed = Math.hypot(player.vx, player.vy);
    const steerFactor = clamp(1 - speed / (player.maxSpeed * 1.2), 0.12, 1);
    if (input.left) player.angle -= player.steerSpeed * dt * steerFactor;
    if (input.right) player.angle += player.steerSpeed * dt * steerFactor;

    // frottements (grip)
    player.vx *= Math.exp(-player.grip * dt);
    player.vy *= Math.exp(-player.grip * dt);

    // cap vitesse max
    const sp = Math.hypot(player.vx, player.vy);
    if (sp > player.maxSpeed) {
      const s = player.maxSpeed / sp;
      player.vx *= s; player.vy *= s;
    }

    // déplacement avec collisions stables
    tryMove(player, player.vx * dt, player.vy * dt);

    // caméra fluide
    cam.x = lerp(cam.x, player.x, 0.12);
    cam.y = lerp(cam.y, player.y, 0.12);

    // HUD
    speedEl.textContent = 'Vitesse: ' + Math.round(sp);
    posEl.textContent = 'X:' + Math.round(player.x) + ' Y:' + Math.round(player.y);

    // NPCs
    updateNPCs(dt);
  }

  function draw() {
    const W = canvas.width / (window.devicePixelRatio || 1);
    const H = canvas.height / (window.devicePixelRatio || 1);

    // fond
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, H);

    const halfW = W / 2, halfH = H / 2;
    const left = cam.x - halfW;
    const top = cam.y - halfH;

    // tuiles visibles
    const sx = Math.floor(left / TILE);
    const sy = Math.floor(top / TILE);
    const ex = Math.ceil((left + W) / TILE);
    const ey = Math.ceil((top + H) / TILE);

    for (let y = sy; y <= ey; y++) {
      for (let x = sx; x <= ex; x++) {
        const t = (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) ? 2 : map[index(x, y)];
        if (t === 0) ctx.fillStyle = '#1f4d2f';     // grass
        else if (t === 1) ctx.fillStyle = '#3a3a3a'; // road
        else ctx.fillStyle = '#2b2d33';             // wall/outside
        ctx.fillRect(x * TILE - left, y * TILE - top, TILE, TILE);
      }
    }

    // NPCs
    drawNPCs(left, top);

    // joueur
    ctx.save();
    ctx.translate(player.x - left, player.y - top);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);
    ctx.restore();

    // minimap
    drawMinimap();
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (!paused) { update(dt); draw(); }
    requestAnimationFrame(loop);
  }

  // --- Init ---
  loadGame();
  requestAnimationFrame(loop);
})();
