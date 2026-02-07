(() => {
  // Expect a mode module to set window.SONIC_MODE = { name, defaults, controls, setup(ctx), update(state), teardown() }

  const $ = (s) => document.querySelector(s);

  // ---------- AudioContext helper ----------
  function makeAudioContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    return new AC({ latencyHint: "interactive" });
  }

  // ---------- Math helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- State ----------
  const state = {
    x: 0.5, y: 0.5,
    speed: 0,
    pressure: 0,
    drawing: false,
    hasAudio: false,
    paused: false,
    // mode controls will be merged in
    ctrl: {}
  };

  // ---------- UI ----------
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function fmt(n, d=2) {
    if (!isFinite(n)) return "0";
    return Number(n).toFixed(d);
  }

  // ---------- Canvas drawing ----------
  function setupCanvas(canvas) {
    const ctx2d = canvas.getContext("2d", { alpha: true });

    function resize() {
      // match CSS width, keep high DPI
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2.25, window.devicePixelRatio || 1));
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.width * dpr * 0.78); // pleasing ratio
      canvas.style.height = "auto";
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

      // clear
      ctx2d.clearRect(0, 0, rect.width, rect.width * 0.78);
    }

    window.addEventListener("resize", resize, { passive: true });
    resize();

    // glow brush
    function drawSegment(ax, ay, bx, by, p, v) {
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;

      const A = { x: ax*w, y: ay*h };
      const B = { x: bx*w, y: by*h };

      const base = 10 + p * 24;            // thickness
      const grit = clamp(v * 1.2, 0, 1);   // speed -> extra glow

      ctx2d.save();
      ctx2d.globalCompositeOperation = "lighter";
      ctx2d.lineCap = "round";
      ctx2d.lineJoin = "round";

      // core
      ctx2d.strokeStyle = "rgba(225,255,245,0.95)";
      ctx2d.shadowColor = "rgba(57,255,136,0.90)";
      ctx2d.shadowBlur = 18 + grit*26;
      ctx2d.lineWidth = base;
      ctx2d.beginPath();
      ctx2d.moveTo(A.x, A.y);
      ctx2d.lineTo(B.x, B.y);
      ctx2d.stroke();

      // outer bloom
      ctx2d.strokeStyle = "rgba(57,255,136,0.20)";
      ctx2d.shadowColor = "rgba(57,255,136,0.55)";
      ctx2d.shadowBlur = 34 + grit*48;
      ctx2d.lineWidth = base * 1.9;
      ctx2d.beginPath();
      ctx2d.moveTo(A.x, A.y);
      ctx2d.lineTo(B.x, B.y);
      ctx2d.stroke();

      ctx2d.restore();
    }

    function clear() {
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;
      ctx2d.clearRect(0, 0, w, h);
    }

    return { ctx2d, drawSegment, clear };
  }

  // ---------- Pointer tracking ----------
  function setupPointer(canvas, onMove) {
    let lastT = 0;
    let lastX = 0.5, lastY = 0.5;

    function normPos(e) {
      const rect = canvas.getBoundingClientRect();
      const px = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const py = clamp((e.clientY - rect.top) / rect.height, 0, 1);
      return { x: px, y: py };
    }

    function handleMove(e) {
      const now = performance.now();
      const dt = Math.max(0.001, (now - (lastT || now)) / 1000);
      lastT = now;

      const pos = normPos(e);
      const dx = pos.x - lastX;
      const dy = pos.y - lastY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const spd = clamp(dist / dt, 0, 6); // normalized-ish
      lastX = pos.x; lastY = pos.y;

      // pressure: pointer events may provide it
      const pres = clamp((e.pressure ?? (state.drawing ? 0.85 : 0)) || 0, 0, 1);

      onMove(pos.x, pos.y, spd, pres, now);
    }

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      state.drawing = true;
      handleMove(e);
    }, { passive: false });

    canvas.addEventListener("pointermove", (e) => {
      if (!state.drawing) return;
      handleMove(e);
    }, { passive: false });

    const end = () => { state.drawing = false; state.speed = 0; };
    canvas.addEventListener("pointerup", end, { passive: true });
    canvas.addEventListener("pointercancel", end, { passive: true });
    canvas.addEventListener("pointerleave", end, { passive: true });
  }

  // ---------- Controls builder ----------
  function buildControls(container, controls, defaults) {
    container.innerHTML = "";
    const ctrlState = {};
    for (const c of controls) ctrlState[c.id] = (defaults[c.id] ?? c.value ?? 0);

    for (const c of controls) {
      const wrap = document.createElement("div");
      wrap.className = "control";
      wrap.innerHTML = `
        <div class="labelRow">
          <b>${c.label}</b>
          <span id="val_${c.id}"></span>
        </div>
        <input id="rng_${c.id}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${ctrlState[c.id]}">
      `;
      container.appendChild(wrap);

      const rng = wrap.querySelector(`#rng_${c.id}`);
      const val = wrap.querySelector(`#val_${c.id}`);

      const renderVal = () => {
        const v = Number(rng.value);
        ctrlState[c.id] = v;
        val.textContent = c.format ? c.format(v) : String(v);
      };
      rng.addEventListener("input", renderVal, { passive: true });
      renderVal();
    }

    return ctrlState;
  }

  // ---------- Save PNG ----------
  function savePNG(canvas) {
    const a = document.createElement("a");
    a.download = `sonic-art-${Date.now()}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  // ---------- Main init ----------
  document.addEventListener("DOMContentLoaded", async () => {
    const mode = window.SONIC_MODE;
    if (!mode) {
      console.error("No SONIC_MODE found. Did you include a mode script before base.js?");
      return;
    }

    // Set header label
    const modeTitle = $("#modeTitle");
    if (modeTitle) modeTitle.textContent = mode.name || "Mode";

    const canvas = $("#pad");
    const { drawSegment, clear } = setupCanvas(canvas);

    // Build controls
    const controlsEl = $("#controls");
    state.ctrl = buildControls(controlsEl, mode.controls || [], mode.defaults || {});

    // UI buttons
    const startBtn = $("#startBtn");
    const pauseBtn = $("#pauseBtn");
    const clearBtn = $("#clearBtn");
    const saveBtn = $("#saveBtn");

    clearBtn?.addEventListener("click", () => clear(), { passive: true });
    saveBtn?.addEventListener("click", () => savePNG(canvas), { passive: true });

    // Audio
    const audioCtx = makeAudioContext();
    let engine = null;

    async function startAudio() {
      if (engine) return;
      await audioCtx.resume();
      engine = await mode.setup(audioCtx, state);
      state.hasAudio = true;
      state.paused = false;
      startBtn.textContent = "Audio On";
      pauseBtn.textContent = "Pause";
      pauseBtn.style.opacity = "1";
      // one initial update
      mode.update(engine, state);
    }

    async function togglePause() {
      if (!state.hasAudio) return;
      if (!state.paused) {
        await audioCtx.suspend();
        state.paused = true;
        pauseBtn.textContent = "Resume";
      } else {
        await audioCtx.resume();
        state.paused = false;
        pauseBtn.textContent = "Pause";
      }
    }

    startBtn?.addEventListener("click", startAudio, { passive: true });
    pauseBtn?.addEventListener("click", togglePause, { passive: true });
    pauseBtn.style.opacity = "0.55";

    // Drawing + mapping loop
    let lastDrawX = 0.5, lastDrawY = 0.5;
    setupPointer(canvas, (x, y, spd, pres) => {
      // Smooth the position a bit
      const sx = lerp(state.x, x, 0.35);
      const sy = lerp(state.y, y, 0.35);

      // Speed normalized for UI + brush
      const s = clamp(spd / 6, 0, 1);

      state.x = sx;
      state.y = sy;
      state.speed = s;
      state.pressure = (pres > 0 ? pres : (state.drawing ? 0.85 : 0));

      // draw
      drawSegment(lastDrawX, lastDrawY, sx, sy, state.pressure, s);
      lastDrawX = sx;
      lastDrawY = sy;

      // UI pills
      setText("pill_x", fmt(state.x, 3));
      setText("pill_y", fmt(state.y, 3));
      setText("pill_speed", fmt(state.speed, 2));
      setText("pill_pressure", fmt(state.pressure, 2));

      // audio update
      if (engine && state.hasAudio && !state.paused) {
        mode.update(engine, state);
      }
    });

    // Animation tick (keeps audio reactive even when not moving)
    function tick() {
      if (engine && state.hasAudio && !state.paused) mode.update(engine, state);
      requestAnimationFrame(tick);
    }
    tick();
  });
})();