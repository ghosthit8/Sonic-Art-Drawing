(() => {
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp = (a,b,t)=>a+(b-a)*t;
  function dbToGain(db){ return Math.pow(10, db/20); }

  function makeDriveCurve(k){
    const n=2048, curve=new Float32Array(n);
    for(let i=0;i<n;i++){
      const x=(i*2/n)-1;
      curve[i]=(1+k)*x/(1+k*Math.abs(x));
    }
    return curve;
  }

  window.SONIC_MODE = {
    name: "FM Metal",
    defaults: {
      ratio: 2.0,
      index: 140,
      cutoff: 9000,
      drive: 0.20,
      out: -12
    },
    controls: [
      { id:"ratio",  label:"Ratio",  min:0.5, max:12, step:0.1, format:v=>v.toFixed(1) },
      { id:"index",  label:"Index",  min:0, max:800, step:1, format:v=>`${Math.round(v)}` },
      { id:"cutoff", label:"Cutoff", min:400, max:12000, step:1, format:v=>`${Math.round(v)} Hz` },
      { id:"drive",  label:"Drive",  min:0, max:1, step:0.01, format:v=>v.toFixed(2) },
      { id:"out",    label:"Output", min:-30, max:0, step:1, format:v=>`${Math.round(v)} dB` },
    ],

    async setup(ctx){
      const carrier = ctx.createOscillator();
      carrier.type = "sine";

      const mod = ctx.createOscillator();
      mod.type = "sine";

      const modGain = ctx.createGain(); // FM depth
      mod.connect(modGain);
      modGain.connect(carrier.frequency);

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = 0.9;

      const shaper = ctx.createWaveShaper();
      shaper.oversample = "4x";

      const out = ctx.createGain();

      carrier.connect(filter);
      filter.connect(shaper);
      shaper.connect(out);
      out.connect(ctx.destination);

      carrier.start();
      mod.start();

      return { carrier, mod, modGain, filter, shaper, out, smoothCut: 8000, smoothF: 220 };
    },

    update(e, state){
      const x = clamp(state.x,0,1);
      const y = clamp(state.y,0,1);
      const sp = clamp(state.speed,0,1);

      const baseFreq = lerp(80, 1200, x);            // X = pitch
      const bite = lerp(0.4, 1.0, 1-y);              // Y up = brighter/bite
      const ratio = state.ctrl.ratio;
      const index = state.ctrl.index * (0.35 + sp*1.4); // speed increases “metal”
      const userCut = state.ctrl.cutoff;
      const drive = state.ctrl.drive;
      const outDb = state.ctrl.out;

      e.smoothF = lerp(e.smoothF, baseFreq, 0.12);
      e.carrier.frequency.setTargetAtTime(e.smoothF, e.carrier.context.currentTime, 0.02);

      e.mod.frequency.setTargetAtTime(e.smoothF * ratio, e.mod.context.currentTime, 0.02);
      e.modGain.gain.setTargetAtTime(index, e.modGain.context.currentTime, 0.02);

      const cutTarget = clamp(Math.min(userCut, lerp(1200, 12000, bite)), 400, 12000);
      e.smoothCut = lerp(e.smoothCut, cutTarget, 0.14);
      e.filter.frequency.setTargetAtTime(e.smoothCut, e.filter.context.currentTime, 0.03);
      e.filter.Q.setTargetAtTime(0.8 + sp*5.0, e.filter.context.currentTime, 0.03);

      const k = 2 + drive*26 + sp*10;
      e.shaper.curve = makeDriveCurve(k);

      e.out.gain.setTargetAtTime(dbToGain(outDb), e.out.context.currentTime, 0.02);
    }
  };
})();