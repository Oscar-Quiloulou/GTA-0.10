// game.js — MiniGTA prototype
// Features: top-down car physics, basic collisions, NPCs placeholder, minimap, touch & keyboard, localStorage save

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
  const cpEl = document.getElementById('checkpoint');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const overlay = document.getElementById('overlay');
  const ovClose = document.getElementById('ov-close');

  // --- Input ---
  const input = { left: false, right: false, accel: false, brake: false };

  // Keyboard controls
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

  // Touch buttons
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
    // fill grass
    for (let i = 0; i < map.length; i++) map[i] = 0;
    // horizontal road
    for (let y = 10; y < MAP_H - 10; y += 6)
      for (let x = 0; x < MAP_W; x++) map[index(x, y)] = 1;
    // vertical road
    for (let x = 8; x < MAP_W - 8; x += 10)
      for (let y = 0; y < MAP_H; y++) map[index(x, y)] = 1;
    // simple walls
    for (let i = 0; i < 50; i++) {
      const x = Math.floor(Math.random() * (MAP_W - 3));
      const y = Math.floor(Math.random() * (MAP_H - 3));
      for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) map[index(x + xx, y + yy)] = 2;
    }
  }

  generateMap();

  // --- Player ---
  const cam = { x: MAP_W * TILE / 2, y: MAP_H * TILE / 2 };
  const player = {
    x: cam.x + 50,
    y: cam.y + 50,
    angle: 0,
    w: 42,
    h: 22,
    vx: 0,
    vy: 0,
    maxSpeed: 300,
    accel: 400,
    brake: 700,
    steerSpeed: 3.5,
    grip: 6
  };

  // --- Helpers ---
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function tileAtWorld(x, y) {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 2;
    return map[index(tx, ty)];
  }

  function resolveCollisions(entity) {
    const halfW = entity.w / 2, halfH = entity.h / 2;
    const corners = [
      { x: entity.x - halfW, y: entity.y - halfH },
      { x: entity.x + halfW, y: entity.y - halfH },
      { x: entity.x - halfW, y: entity.y + halfH },
      { x: entity.x + halfW, y: entity.y + halfH },
    ];
    for (const c of corners) {
      if (tileAtWorld(c.x, c.y) === 2) {
        entity.vx *= 0.5;
        entity.vy *= 0.5;
        entity.x -= entity.vx * 0.1;
        entity.y -= entity.vy * 0.1;
      }
    }
  }

  // --- Pause / overlay ---
  let paused = false;
  function togglePause() { paused = !paused; overlay.classList.toggle('hidden', !paused); }

  ovClose.addEventListener('click', togglePause);

  // --- Save / load ---
  function saveGame() {
    const data = { player: { x: player.x, y: player.y, angle: player.angle, vx: player.vx, vy: player.vy } };
    localStorage.setItem('minigta_save', JSON.stringify(data));
    alert('Sauvegardé !');
  }

  function loadGame() {
    const raw = localStorage.getItem('minigta_save');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      Object.assign(player, data.player);
    } catch (e) { console.warn('Load failed', e); }
  }

  saveBtn.addEventListener('click', saveGame);
  resetBtn.addEventListener('click', () => { localStorage.removeItem('minigta_save'); location.reload(); });

  // --- Game loop ---
  let lastTs = performance.now();
  function update(dt) {
    const fdx = Math.cos(player.angle), fdy = Math.sin(player.angle);
    if (input.accel) { player.vx += fdx * player.accel * dt; player.vy += fdy * player.accel * dt; }
    if (input.brake) { player.vx -= fdx * player.brake * dt * 0.7; player.vy -= fdy * player.brake * dt * 0.7; }
    const speed = Math.hypot(player.vx, player.vy);
    const steerFactor = clamp(1 - speed / (player.maxSpeed * 1.2), 0.12, 1);
    if (input.left) player.angle -= player.steerSpeed * dt * steerFactor;
    if (input.right) player.angle += player.steerSpeed * dt * steerFactor;
    player.vx *= Math.exp(-player.grip * dt);
    player.vy *= Math.exp(-player.grip * dt);
    const sp = Math.hypot(player.vx, player.vy);
    if (sp > player.maxSpeed) { const s = player.maxSpeed / sp; player.vx *= s; player.vy *= s; }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    resolveCollisions(player);

    cam.x = lerp(cam.x, player.x, 0.12);
    cam.y = lerp(cam.y, player.y, 0.12);

    speedEl.textContent = 'Vitesse: ' + Math.round(sp);
    posEl.textContent = 'X:' + Math.round(player.x) + ' Y:' + Math.round(player.y);
  }

  function draw() {
    const W = canvas.width / (window.devicePixelRatio || 1);
    const H = canvas.height / (window.devicePixelRatio || 1);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, H);

    const halfW = W / 2, halfH = H / 2;
    const left = cam.x - halfW, top = cam.y - halfH;

    // draw tiles
    const sx = Math.floor(left / TILE), sy = Math.floor(top / TILE);
    const ex = Math.ceil((left + W) / TILE), ey = Math.ceil((top + H) / TILE);
    for (let y = sy; y <= ey; y++) {
      for (let x = sx; x <= ex; x++) {
        const t = (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) ? 2 : map[index(x, y)];
        if (t === 0) ctx.fillStyle = '#1f4d2f';
        else if (t === 1) ctx.fillStyle = '#3a3a3a';
        else ctx.fillStyle = '#2b2d33';
        ctx.fillRect(x * TILE - left, y * TILE - top, TILE, TILE);
      }
    }

    // draw player
    ctx.save();
    ctx.translate(player.x - left, player.y - top);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);
    ctx.restore();
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
