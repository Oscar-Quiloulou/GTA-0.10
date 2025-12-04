// game3d.js — MiniGTA 3D starter (car + follow cam + grid + NPCs)
(() => {
  const speedEl = document.getElementById('speed');
  const posEl = document.getElementById('pos');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');
  const overlay = document.getElementById('overlay');
  const ovClose = document.getElementById('ov-close');
  const gameWrap = document.getElementById('game-wrap');

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(gameWrap.clientWidth, Math.max(360, gameWrap.clientHeight));
  renderer.setClearColor(0x0b1220);
  gameWrap.insertBefore(renderer.domElement, gameWrap.firstChild);

  // Scene & camera
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1220);

  const camera = new THREE.PerspectiveCamera(70, renderer.domElement.clientWidth / renderer.domElement.clientHeight, 0.1, 1000);
  camera.position.set(0, 10, 18);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.8);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(20, 30, 10);
  scene.add(dir);

  // Ground grid
  const groundSize = 800;
  const grid = new THREE.GridHelper(groundSize, 40, 0x666666, 0x333333);
  grid.position.y = 0;
  scene.add(grid);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({ color: 0x1f4d2f, metalness: 0.0, roughness: 1.0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Car (player)
  const car = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.6, 3.2),
    new THREE.MeshStandardMaterial({ color: 0xff6b6b })
  );
  car.position.set(0, 0.3, 0);
  car.castShadow = true;
  scene.add(car);

  // Simple NPC cubes
  const npcs = [];
  const npcMat = new THREE.MeshStandardMaterial({ color: 0x2aa1ff });
  for (let i = 0; i < 12; i++) {
    const npc = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), npcMat);
    npc.position.set((Math.random() - 0.5) * groundSize * 0.8, 0.6, (Math.random() - 0.5) * groundSize * 0.8);
    scene.add(npc);
    npcs.push({ mesh: npc, angle: Math.random() * Math.PI * 2, speed: 3 + Math.random() * 2 });
  }

  // Input
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
    const down = e => { e.preventDefault(); input[key] = true; };
    const up = e => { e.preventDefault(); input[key] = false; };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend', up, { passive: false });
    btn.addEventListener('touchcancel', up, { passive: false });
  }
  bindBtn(document.getElementById('leftBtn'), 'left');
  bindBtn(document.getElementById('rightBtn'), 'right');
  bindBtn(document.getElementById('accelBtn'), 'accel');
  bindBtn(document.getElementById('brakeBtn'), 'brake');

  // Pause
  let paused = false;
  function togglePause() { paused = !paused; overlay.classList.toggle('hidden', !paused); }
  ovClose.addEventListener('click', togglePause);

  // Save / load (position + rotation)
  function saveGame() {
    const data = { car: { x: car.position.x, z: car.position.z, ry: car.rotation.y } };
    localStorage.setItem('minigta3d_save', JSON.stringify(data));
    alert('Sauvegardé !');
  }
  function loadGame() {
    const raw = localStorage.getItem('minigta3d_save');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      car.position.x = data.car.x;
      car.position.z = data.car.z;
      car.rotation.y = data.car.ry;
    } catch (e) { console.warn('Load failed', e); }
  }
  saveBtn.addEventListener('click', saveGame);
  resetBtn.addEventListener('click', () => { localStorage.removeItem('minigta3d_save'); location.reload(); });

  // Car physics (arcade)
  const state = {
    vx: 0, vz: 0,
    accel: 18, brake: 25, maxSpeed: 22,
    steerSpeed: 1.8, grip: 3.2
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Camera follow parameters
  const camOffset = new THREE.Vector3(0, 6.5, -10);
  const camLook = new THREE.Vector3();

  // Resize
  function fitRenderer() {
    const w = gameWrap.clientWidth;
    const h = Math.max(360, gameWrap.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', fitRenderer);
  window.addEventListener('load', fitRenderer);
  fitRenderer();

  // Loop
  let last = performance.now();
  function update(dt) {
    // steering
    const speed = Math.hypot(state.vx, state.vz);
    const steerFactor = clamp(1 - speed / (state.maxSpeed * 1.1), 0.18, 1);
    if (input.left) car.rotation.y += state.steerSpeed * dt * steerFactor;
    if (input.right) car.rotation.y -= state.steerSpeed * dt * steerFactor;

    // forward dir in XZ
    const fdx = Math.sin(car.rotation.y);
    const fdz = Math.cos(car.rotation.y);

    if (input.accel) { state.vx += fdx * state.accel * dt; state.vz += fdz * state.accel * dt; }
    if (input.brake) { state.vx -= fdx * state.brake * dt * 0.7; state.vz -= fdz * state.brake * dt * 0.7; }

    // grip
    state.vx *= Math.exp(-state.grip * dt);
    state.vz *= Math.exp(-state.grip * dt);

    // cap speed
    const sp = Math.hypot(state.vx, state.vz);
    if (sp > state.maxSpeed) {
      const s = state.maxSpeed / sp;
      state.vx *= s; state.vz *= s;
    }

    // move car
    car.position.x += state.vx * dt;
    car.position.z += state.vz * dt;

    // camera follow (offset in car space)
    const offsetWorld = camOffset.clone().applyAxisAngle(new THREE.Vector3(0,1,0), car.rotation.y);
    camera.position.copy(car.position).add(offsetWorld);
    camLook.copy(car.position);
    camera.lookAt(camLook);

    // HUD
    speedEl.textContent = 'Vitesse: ' + Math.round(sp * 3.6); // approx km/h
    posEl.textContent = `X:${car.position.x.toFixed(1)} Y:${car.position.y.toFixed(1)} Z:${car.position.z.toFixed(1)}`;

    // NPCs simple wandering on ground
    for (const n of npcs) {
      n.mesh.position.x += Math.cos(n.angle) * n.speed * dt;
      n.mesh.position.z += Math.sin(n.angle) * n.speed * dt;
      // bounce on bounds
      const B = groundSize * 0.4;
      if (Math.abs(n.mesh.position.x) > B || Math.abs(n.mesh.position.z) > B) n.angle += Math.PI / 2;
    }
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (!paused) update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  loadGame();
  requestAnimationFrame(loop);
})();
