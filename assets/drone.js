(() => {
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp = (a,b,t)=>a+(b-a)*t;
  function dbToGain(db){ return Math.pow(10, db/20); }

  window.SONIC_MODE = {
    name: "Drone",
    defaults: {
      width: 0.35,
      air: 0.55,
      delay: 0.25,
      out: -14
    },
    controls: [
      { id:"width", label:"Width", min:0, max:1, step:0.01, format:v=>v.toFixed(2) },
      { id:"air",   label:"Air",   min:0, max:1, step:0.01, format:v=>v.toFixed(2) },
      { id:"delay", label:"Delay", min:0, max:0.85, step:0.01, format:v=>v.toFixed(2) },
      { id:"out",   label:"Output",min:-30, max:0, step:1, format:v=>`${Math.round(v)} dB` },
    ],

    async setup(ctx){
      const o1 = ctx.createOscillator(); o1.type="sawtooth";
      const o2 = ctx.createOscillator(); o2.type="sawtooth";
      const o3 = ctx.createOscillator(); o3.type="triangle";

      const mix = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type="lowpass";
      filter.Q.value = 0.9;

      const delay = ctx.createDelay(0.6);
      const fb = ctx.createGain();
      const wet = ctx.createGain();
      const dry = ctx.createGain();
      const out = ctx.createGain();

      // routing
      o1.connect(mix); o2.connect(mix); o3.connect(mix);
      mix.connect(filter);

      filter.connect(dry);
      filter.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);

      dry.connect(out);
      wet.connect(out);
      out.connect(ctx.destination);

      o1.start(); o2.start(); o3.start();

      return { o1,o2,o3,mix,filter,delay,fb,wet,dry,out, smoothF:110, smoothCut:3000 };
    },

    update(e, state){
      const x = clamp(state.x,0,1);
      const y = clamp(state.y,0,1);
      const sp = clamp(state.speed,0,1);

      const base = lerp(40, 220, x);        // X = pitch zone
      const width = state.ctrl.width;       // detune width
      const air = state.ctrl.air;           // brightness
      const d = state.ctrl.delay;
      const outDb = state.ctrl.out;

      e.smoothF = lerp(e.smoothF, base, 0.06);

      const det = lerp(0, 14, width) + sp*8;
      e.o1.frequency.setTargetAtTime(e.smoothF*(1 - det/1200), e.o1.context.currentTime, 0.03);
      e.o2.frequency.setTargetAtTime(e.smoothF*(1 + det/1200), e.o2.context.currentTime, 0.03);
      e.o3.frequency.setTargetAtTime(e.smoothF*0.5,            e.o3.context.currentTime, 0.03);

      const cutTarget = lerp(400, 12000, clamp(air + (1-y)*0.35, 0, 1));
      e.smoothCut = lerp(e.smoothCut, cutTarget, 0.06);
      e.filter.frequency.setTargetAtTime(e.smoothCut, e.filter.context.currentTime, 0.06);
      e.filter.Q.setTargetAtTime(0.8 + sp*1.4, e.filter.context.currentTime, 0.08);

      // delay
      e.delay.delayTime.setTargetAtTime(lerp(0.08, 0.42, d), e.delay.context.currentTime, 0.08);
      e.fb.gain.setTargetAtTime(lerp(0.05, 0.62, d), e.fb.context.currentTime, 0.08);
      e.wet.gain.setTargetAtTime(lerp(0.0, 0.65, d), e.wet.context.currentTime, 0.08);
      e.dry.gain.setTargetAtTime(1.0, e.dry.context.currentTime, 0.08);

      e.out.gain.setTargetAtTime(dbToGain(outDb), e.out.context.currentTime, 0.02);
    }
  };
})();