(() => {
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp = (a,b,t)=>a+(b-a)*t;
  function dbToGain(db){ return Math.pow(10, db/20); }

  function makeNoiseBuffer(ctx) {
    const len = ctx.sampleRate * 1;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<len;i++) data[i] = (Math.random()*2-1);
    return buf;
  }

  window.SONIC_MODE = {
    name: "Perc",
    defaults: {
      density: 0.55,
      tone: 0.60,
      snap: 0.40,
      out: -10
    },
    controls: [
      { id:"density", label:"Density", min:0, max:1, step:0.01, format:v=>v.toFixed(2) },
      { id:"tone",    label:"Tone",    min:0, max:1, step:0.01, format:v=>v.toFixed(2) },
      { id:"snap",    label:"Snap",    min:0, max:1, step:0.01, format:v=>v.toFixed(2) },
      { id:"out",     label:"Output",  min:-30, max:0, step:1,  format:v=>`${Math.round(v)} dB` },
    ],

    async setup(ctx){
      // A single “click/noise” voice that we retrigger with envelopes.
      const noise = ctx.createBufferSource();
      noise.buffer = makeNoiseBuffer(ctx);
      noise.loop = true;

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 600;

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 12;

      const env = ctx.createGain();
      env.gain.value = 0;

      const out = ctx.createGain();

      noise.connect(hp);
      hp.connect(bp);
      bp.connect(env);
      env.connect(out);
      out.connect(ctx.destination);

      noise.start();

      return { noise, hp, bp, env, out, lastHit: 0 };
    },

    update(e, state){
      const x = clamp(state.x,0,1);
      const y = clamp(state.y,0,1);
      const sp = clamp(state.speed,0,1);

      const dens = state.ctrl.density;
      const tone = state.ctrl.tone;
      const snap = state.ctrl.snap;
      const outDb = state.ctrl.out;

      // pitch zone
      const f = lerp(120, 1600, x);
      const damp = lerp(0.15, 1.0, 1-y); // Y up = tighter
      e.bp.frequency.setTargetAtTime(f, e.bp.context.currentTime, 0.02);
      e.bp.Q.setTargetAtTime(lerp(6, 26, damp), e.bp.context.currentTime, 0.05);

      e.hp.frequency.setTargetAtTime(lerp(120, 2200, snap), e.hp.context.currentTime, 0.06);

      // hit triggering: speed controls probability + cooldown
      const now = e.bp.context.currentTime;
      const cooldown = lerp(0.18, 0.045, clamp(dens + sp*0.8, 0, 1));
      const want = (sp > lerp(0.18, 0.05, dens)); // threshold
      if (want && (now - e.lastHit) > cooldown) {
        e.lastHit = now;

        const a = lerp(0.08, 0.55, clamp(sp*1.15,0,1)) * lerp(0.4, 1.0, tone);
        const atk = 0.002 + (1 - snap)*0.01;
        const rel = lerp(0.05, 0.22, 1-damp);

        e.env.gain.cancelScheduledValues(now);
        e.env.gain.setValueAtTime(0, now);
        e.env.gain.linearRampToValueAtTime(a, now + atk);
        e.env.gain.exponentialRampToValueAtTime(0.0008, now + atk + rel);
      }

      e.out.gain.setTargetAtTime(dbToGain(outDb), e.out.context.currentTime, 0.02);
    }
  };
})();