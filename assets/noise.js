(() => {
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp = (a,b,t)=>a+(b-a)*t;

  function dbToGain(db){ return Math.pow(10, db/20); }

  function makeNoiseBuffer(ctx) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<len;i++) data[i] = (Math.random()*2-1);
    return buf;
  }

  function makeWaveshaper(amount) {
    const k = amount;
    const n = 2048;
    const curve = new Float32Array(n);
    for (let i=0;i<n;i++){
      const x = (i*2/n) - 1;
      curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
    }
    return curve;
  }

  window.SONIC_MODE = {
    name: "Noise Pad",
    defaults: {
      noise: 0.20,
      cutoff: 3200,
      drive: 0.18,
      out: -10
    },
    controls: [
      { id:"noise",  label:"Noise",  min:0, max:1, step:0.01, format:v=>v.toFixed(2) },
      { id:"cutoff", label:"Cutoff", min:200, max:12000, step:1,  format:v=>`${Math.round(v)} Hz` },
      { id:"drive",  label:"Drive",  min:0, max:1, step:0.01, format:v=>v.toFixed(2) },
      { id:"out",    label:"Output", min:-30, max:0, step:1, format:v=>`${Math.round(v)} dB` },
    ],

    async setup(ctx, state){
      // source
      const src = ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(ctx);
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = 0.8;

      const shaper = ctx.createWaveShaper();
      shaper.oversample = "4x";

      const pre = ctx.createGain();
      const post = ctx.createGain();
      const out = ctx.createGain();

      // connect
      src.connect(pre);
      pre.connect(filter);
      filter.connect(shaper);
      shaper.connect(post);
      post.connect(out);
      out.connect(ctx.destination);

      src.start();

      const engine = { src, pre, filter, shaper, post, out, smoothCut: state.ctrl.cutoff || 3000 };
      return engine;
    },

    update(engine, state){
      // map XY + speed to musical behavior
      const x = clamp(state.x, 0, 1);
      const y = clamp(state.y, 0, 1);
      const sp = clamp(state.speed, 0, 1);

      const noise = state.ctrl.noise;
      const drive = state.ctrl.drive;
      const userCut = state.ctrl.cutoff;
      const outDb = state.ctrl.out;

      // pitch illusion by moving cutoff + subtle Q
      const cutXY = lerp(600, 11000, x) * lerp(0.55, 1.0, (1 - y)); // up=brighter
      const targetCut = clamp(Math.min(userCut, cutXY), 200, 12000);

      engine.smoothCut = lerp(engine.smoothCut, targetCut, 0.18);
      engine.filter.frequency.setTargetAtTime(engine.smoothCut, engine.filter.context.currentTime, 0.03);
      engine.filter.Q.setTargetAtTime(0.7 + sp*6.0, engine.filter.context.currentTime, 0.03);

      engine.pre.gain.setTargetAtTime(noise, engine.pre.context.currentTime, 0.02);

      const k = 2 + drive * 26 + sp*10;
      engine.shaper.curve = (function(){
        const n=2048, curve=new Float32Array(n);
        for(let i=0;i<n;i++){
          const xx=(i*2/n)-1;
          curve[i]=(1+k)*xx/(1+k*Math.abs(xx));
        }
        return curve;
      })();

      engine.post.gain.setTargetAtTime(0.9, engine.post.context.currentTime, 0.02);
      engine.out.gain.setTargetAtTime(dbToGain(outDb), engine.out.context.currentTime, 0.02);
    },

    teardown(engine){
      try { engine.src.stop(); } catch {}
    }
  };
})();