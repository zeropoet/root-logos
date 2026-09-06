(() => {
  "use strict";

  const canvas = document.querySelector("#living-object");
  const soundButton = document.querySelector("#sound-state");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: true, depth: true, powerPreference: "high-performance" });
  if (!gl) {
    canvas.setAttribute("aria-label", "The Living System requires WebGL 2 to render its evolving sculpture.");
    return;
  }

  const TAU = Math.PI * 2;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const OBJECT_SCALE = .5;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (a, b, amount) => a + (b - a) * amount;
  const state = {
    width: 1, height: 1, dpr: 1, points: [], faces: [], faceAwareness: [], seed: 1,
    pointer: { x: 0, y: 0, smoothX: 0, smoothY: 0, active: false, down: false, moved: false, startX: 0, startY: 0, lastX: 0, lastY: 0, pressure: 0 },
    rotation: { yaw: -.24, pitch: -.1, targetYaw: -.24, targetPitch: -.1, velocityYaw: 0, velocityPitch: 0 },
    zoom: 1, targetZoom: 1, orientation: false,
    start: performance.now(), last: performance.now(), visible: !document.hidden
  };

  function hash(value) {
    let result = 2166136261;
    for (const character of String(value)) { result ^= character.charCodeAt(0); result = Math.imul(result, 16777619); }
    return result >>> 0;
  }
  function seeded(seed) {
    let value = seed || 1;
    return () => { value = Math.imul(value ^ value >>> 15, 1 | value); value ^= value + Math.imul(value ^ value >>> 7, 61 | value); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
  }
  const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function normalize(vector) { const magnitude = Math.hypot(...vector) || 1; return vector.map((value) => value / magnitude); }
  function normalizeTerm(value) { return ` ${value.toLowerCase().replaceAll("ø", "o").replace(/[^a-z0-9]+/g, " ").trim()} `; }
  function entityAliases(entity) { return [...new Set([normalizeTerm(entity.id), normalizeTerm(entity.id.replaceAll("-", " "))])]; }

  function convexFaces(points) {
    const faces = [];
    for (let a = 0; a < points.length - 2; a += 1) for (let b = a + 1; b < points.length - 1; b += 1) for (let c = b + 1; c < points.length; c += 1) {
      const normal = cross(subtract(points[b].base, points[a].base), subtract(points[c].base, points[a].base));
      if (Math.hypot(...normal) < 1e-5) continue;
      let positive = false, negative = false;
      for (let i = 0; i < points.length; i += 1) {
        if (i === a || i === b || i === c) continue;
        const side = dot(normal, subtract(points[i].base, points[a].base));
        if (side > 1e-5) positive = true;
        if (side < -1e-5) negative = true;
        if (positive && negative) break;
      }
      if (positive && negative) continue;
      const centroid = [0, 1, 2].map((axis) => (points[a].base[axis] + points[b].base[axis] + points[c].base[axis]) / 3);
      faces.push(dot(normal, centroid) < 0 ? [a, c, b] : [a, b, c]);
    }
    return faces;
  }

  function buildField(data) {
    state.seed = hash(JSON.stringify({ repositories: data.repositories, components: data.operating_components, relations: data.relations, receipts: data.propagation?.receipts }));
    const random = seeded(state.seed);
    const relations = data.relations.map(normalizeTerm);
    const entities = [...data.repositories, ...data.operating_components].filter(entity => entity.id !== "telos").map(entity => {
      const aliases = entityAliases(entity), witnessed = relations.filter(relation => aliases.some(alias => relation.includes(alias)));
      return { ...entity, relationCount: witnessed.length, connectedToCore: witnessed.some(relation => relation.includes(" telos ")) };
    });
    const count = entities.length;
    state.points = entities.map((entity, index) => {
      const vertical = 1 - 2 * (index + .5) / count;
      const radial = Math.sqrt(1 - vertical * vertical);
      const angle = index * GOLDEN_ANGLE + (random() - .5) * .13;
      const relationWeight = clamp(entity.relationCount / Math.max(1, relations.length), 0, 1), shell = .73 + random() * .16;
      return { id: entity.id, connectedToCore: entity.connectedToCore, relationCount: entity.relationCount, base: [Math.cos(angle) * radial * shell, vertical * .92, Math.sin(angle) * radial * shell], phase: random() * TAU, tempo: .032 + random() * .028, breath: .022 + random() * .032 + relationWeight * .01 };
    });
    state.faces = convexFaces(state.points);
    state.faceAwareness = state.faces.map(() => .025);
  }

  function compile(type, source) {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  function makeProgram(vertex, fragment) {
    const value = gl.createProgram(); gl.attachShader(value, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(value, compile(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(value);
    if (!gl.getProgramParameter(value, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(value));
    return value;
  }
  const projection = `vec4 project(vec3 p){float d=2.55/(2.8+p.z);vec2 s=uCenter+p.xy*uScale*d;vec2 c=vec2(s.x/uViewport.x*2.-1.,1.-s.y/uViewport.y*2.);return vec4(c,clamp((p.z+1.4)/2.8,0.,1.)*2.-1.,1.);}`;

  const meshProgram = makeProgram(`#version 300 es
    precision highp float;in vec3 aPosition;in vec3 aNormal;in vec3 aBarycentric;in float aPhase;in float aAwareness;uniform vec2 uViewport;uniform vec2 uCenter;uniform float uScale;out vec3 vPosition;out vec3 vNormal;out vec3 vBarycentric;out float vPhase;out float vAwareness;${projection}
    void main(){vPosition=aPosition;vNormal=aNormal;vBarycentric=aBarycentric;vPhase=aPhase;vAwareness=aAwareness;gl_Position=project(aPosition);}`,
    `#version 300 es
    precision highp float;in vec3 vPosition;in vec3 vNormal;in vec3 vBarycentric;in float vPhase;in float vAwareness;uniform float uTime;out vec4 color;
    float sat(float v){return clamp(v,0.,1.);}
    float ovelHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
    float ovelNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(ovelHash(i),ovelHash(i+vec3(1,0,0)),f.x),mix(ovelHash(i+vec3(0,1,0)),ovelHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(ovelHash(i+vec3(0,0,1)),ovelHash(i+vec3(1,0,1)),f.x),mix(ovelHash(i+vec3(0,1,1)),ovelHash(i+vec3(1)),f.x),f.y),f.z);}
    vec3 ovelSubstrate(vec3 p,float time){
      float memory=ovelNoise(p*3.1+vec3(time*.032,-time*.024,time*.017));
      float viscosity=ovelNoise(p*6.3+vec3(memory*.72,-memory*.48,time*.013));
      vec3 warped=p+normalize(p+vec3(.001))*((memory-.5)*.19+(viscosity-.5)*.075);
      float course=warped.x*1.65+warped.y*1.08+warped.z*.74+memory*.44;
      float red=pow(sat(1.-abs(sin(course*8.6+vPhase*.08))),5.2);
      float green=pow(sat(1.-abs(sin((course+.026+viscosity*.018)*8.6+vPhase*.08))),5.2);
      float blue=pow(sat(1.-abs(sin((course+.057+memory*.022)*8.6+vPhase*.08))),5.2);
      float membrane=smoothstep(.44,.04,abs(length(warped.xy)-(.34+(memory-.5)*.085)));
      vec3 spectral=vec3(1.,.055,.02)*red+vec3(.025,1.,.24)*green*.72+vec3(.06,.22,1.)*blue*.58;
      return spectral*(.13+.87*membrane)*(.42+.58*viscosity);
    }
    void main(){
      vec3 n=normalize(vNormal);vec3 view=normalize(vec3(0.,0.,-3.2)-vPosition);if(!gl_FrontFacing)n*=-1.;
      vec3 core=normalize(-vPosition);float facing=abs(dot(n,view));float fresnel=pow(1.-facing,2.7);float coreDistance=1./(.08+dot(vPosition,vPosition));
      float density=smoothstep(.1,.82,vAwareness);float pathLength=1./max(facing,.085);float opticalDepth=pathLength*(.13+density*.58);
      vec3 beerLambert=exp(-vec3(.12,.82,1.48)*opticalDepth);
      vec3 bendR=normalize(refract(-view,n,1./2.36));vec3 bendG=normalize(refract(-view,n,1./2.42));vec3 bendB=normalize(refract(-view,n,1./2.48));
      float causticR=pow(sat(dot(bendR,core)),5.);float causticG=pow(sat(dot(bendG,core)),6.);float causticB=pow(sat(dot(bendB,core)),7.);
      float innerPulse=.93+.07*sin(vPhase+uTime*.11);vec3 bentCore=vec3(causticR,causticG*.12,causticB*.025)*coreDistance*(.12+density*.5)*innerPulse;
      float internalReflection=pow(sat(dot(reflect(-core,n),view)),10.);float innerVolume=pow(sat(dot(core,n)*.5+.5),1.8)*coreDistance;
      vec3 transmission=vec3(1.,.025,.008)*beerLambert*(innerVolume*.03+density*.009);
      vec3 reflection=vec3(1.,.018,.006)*(internalReflection*(.08+density*.24)+fresnel*coreDistance*(.014+density*.032));
      vec3 ovel=ovelSubstrate(vPosition,uTime);
      vec3 glass=vec3(.36,.31,.3)*(.002+density*.006)+transmission*.28+bentCore*.34+reflection*.48;
      glass+=ovel*(.055+density*.26+fresnel*.14);
      vec3 w=fwidth(vBarycentric);vec3 edgeDistance=smoothstep(w*.6,w*1.75,vBarycentric);float edge=1.-min(min(edgeDistance.x,edgeDistance.y),edgeDistance.z);glass+=mix(vec3(.18,.17,.17),vec3(1.,.028,.01),density)*edge*(.018+density*.065+fresnel*.036);
      float ovelLight=max(max(ovel.r,ovel.g),ovel.b);float alpha=.018+density*.105+(1.-beerLambert.r)*.02+fresnel*(.02+density*.05)+edge*(.028+density*.05)+ovelLight*(.055+density*.11)+internalReflection*.018;color=vec4(glass,clamp(alpha,.016,.5));
    }`);
  const lineProgram = makeProgram(`#version 300 es
    precision highp float;in vec3 aPosition;in vec4 aColor;uniform vec2 uViewport;uniform vec2 uCenter;uniform float uScale;out vec4 vColor;${projection}void main(){vColor=aColor;gl_Position=project(aPosition);}`,
    `#version 300 es
    precision highp float;in vec4 vColor;out vec4 color;void main(){color=vColor;}`);
  const coreProgram = makeProgram(`#version 300 es
    precision highp float;in vec3 aPosition;uniform vec2 uViewport;uniform vec2 uCenter;uniform float uScale;uniform float uCoreSize;${projection}void main(){gl_Position=project(aPosition);gl_PointSize=uCoreSize;}`,
    `#version 300 es
    precision highp float;out vec4 color;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float aura=pow(max(0.,1.-d),2.15);float glow=pow(max(0.,1.-d),4.2);float spark=1.-smoothstep(.025,.105,d);color=vec4(vec3(1.,.012,.003)*(aura*.55+glow*1.35+spark*1.25),aura*.58+glow*.48+spark);}`);
  const mesh = { buffer: gl.createBuffer(), program: meshProgram, stride: 44 };
  const lines = { buffer: gl.createBuffer(), program: lineProgram, stride: 28 };
  const core = { buffer: gl.createBuffer(), program: coreProgram };

  function attributes(value, definitions) {
    gl.bindBuffer(gl.ARRAY_BUFFER, value.buffer);
    for (const [name, size, offset] of definitions) { const location = gl.getAttribLocation(value.program, name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, value.stride, offset * 4); }
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(); state.dpr = Math.min(devicePixelRatio || 1, 2); state.width = Math.max(1, rect.width); state.height = Math.max(1, rect.height);
    const width = Math.round(state.width * state.dpr), height = Math.round(state.height * state.dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height); }
  }
  function center() { return { x: state.width * .5, y: state.height * .5 }; }
  function rotate(p) {
    const cy = Math.cos(state.rotation.yaw), sy = Math.sin(state.rotation.yaw), x = p[0] * cy - p[2] * sy, z = p[0] * sy + p[2] * cy, cp = Math.cos(state.rotation.pitch), sp = Math.sin(state.rotation.pitch);
    return [x, p[1] * cp - z * sp, p[1] * sp + z * cp];
  }
  function evolve(point, index, time) {
    const motion = reducedMotion ? 0 : time * (state.orientation ? .17 : 1), breath = 1 + Math.sin(motion * .19 + point.phase) * point.breath, twist = motion * point.tempo + Math.sin(motion * .07 + point.phase) * .06 + point.base[1] * .19;
    const x = point.base[0] * breath, z = point.base[2] * breath, ct = Math.cos(twist), st = Math.sin(twist);
    return rotate([x * ct - z * st, point.base[1] * (1 + Math.sin(motion * .11 + point.phase) * .025) + .035 * Math.sin(motion * .13 + index * GOLDEN_ANGLE), x * st + z * ct]);
  }
  function updateInteraction(delta) {
    const motion = reducedMotion ? 1 : clamp(delta * 60, .3, 2);
    if (state.pointer.active) { state.pointer.smoothX = state.pointer.x; state.pointer.smoothY = state.pointer.y; } state.pointer.pressure = ease(state.pointer.pressure, state.pointer.down ? 1 : 0, .045 * motion);
    if (!reducedMotion && !state.pointer.down) state.rotation.targetYaw += .00135 * motion;
    state.rotation.yaw = ease(state.rotation.yaw, state.rotation.targetYaw, .05 * motion); state.rotation.pitch = ease(state.rotation.pitch, state.rotation.targetPitch, .05 * motion); state.rotation.targetYaw += state.rotation.velocityYaw; state.rotation.targetPitch = clamp(state.rotation.targetPitch + state.rotation.velocityPitch, -.72, .72); state.rotation.velocityYaw *= Math.pow(.9, motion); state.rotation.velocityPitch *= Math.pow(.88, motion); state.zoom = ease(state.zoom, state.targetZoom, .055 * motion);
  }
  function projectionUniforms(program, scale, origin) { gl.uniform2f(gl.getUniformLocation(program, "uViewport"), state.width, state.height); gl.uniform2f(gl.getUniformLocation(program, "uCenter"), origin.x, origin.y); gl.uniform1f(gl.getUniformLocation(program, "uScale"), scale); }

  function drawMesh(points, time, delta, scale, origin) {
    const vertices = [];
    state.faces.forEach((face, faceIndex) => {
      const a = points[face[0]], b = points[face[1]], c = points[face[2]], normal = normalize(cross(subtract(b, a), subtract(c, a))), phase = hash(`${state.seed}:${faceIndex}`) % 1000 / 1000 * TAU;
      const centroid = [0, 1, 2].map((axis) => (a[axis] + b[axis] + c[axis]) / 3), towardCore = normalize(centroid.map((value) => -value)), towardView = normalize(subtract([0, 0, -3.2], centroid));
      const incidence = Math.abs(dot(normal, towardCore)), reflected = normalize(subtract(normal.map((value) => value * 2 * dot(normal, towardCore)), towardCore)), specular = Math.pow(Math.max(0, Math.abs(dot(reflected, towardView))), 8), distance = Math.hypot(...centroid);
      const target = clamp((incidence - .08) / .78, 0, 1) * clamp(1.36 - distance * .4, .3, 1) * .5 + specular * .48;
      const current = state.faceAwareness[faceIndex] || 0, rate = target > current ? 1 - Math.pow(.002, delta) : 1 - Math.pow(.16, delta);
      state.faceAwareness[faceIndex] = ease(current, clamp(target, .012, 1), rate);
      [a, b, c].forEach((position, i) => vertices.push(...position, ...normal, i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0, phase, state.faceAwareness[faceIndex]));
    });
    gl.useProgram(mesh.program); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW); attributes(mesh, [["aPosition", 3, 0], ["aNormal", 3, 3], ["aBarycentric", 3, 6], ["aPhase", 1, 9], ["aAwareness", 1, 10]]); projectionUniforms(mesh.program, scale, origin);
    gl.uniform1f(gl.getUniformLocation(mesh.program, "uTime"), time);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 11);
  }
  function drawLines(points, scale, origin) {
    const vertices = [];
    points.forEach((point, index) => { if (state.points[index].connectedToCore) vertices.push(0, 0, 0, 1, .008, .002, .62, ...point, .72, .012, .004, .065); });
    gl.useProgram(lines.program); gl.bindBuffer(gl.ARRAY_BUFFER, lines.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW); attributes(lines, [["aPosition", 3, 0], ["aColor", 4, 3]]); projectionUniforms(lines.program, scale, origin); gl.disable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.drawArrays(gl.LINES, 0, vertices.length / 7);
  }
  function drawCore(time, scale, origin) {
    gl.useProgram(core.program); gl.bindBuffer(gl.ARRAY_BUFFER, core.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0]), gl.STATIC_DRAW); const position = gl.getAttribLocation(core.program, "aPosition"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0); projectionUniforms(core.program, scale, origin);
    const pulse = reducedMotion ? 1 : 1 + Math.sin(time * (state.orientation ? .18 : .38)) * .08; gl.uniform1f(gl.getUniformLocation(core.program, "uCoreSize"), (state.orientation ? 154 : 126) * OBJECT_SCALE * state.dpr * pulse); gl.disable(gl.DEPTH_TEST); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.drawArrays(gl.POINTS, 0, 1);
  }
  const sound = {
    context: null, output: null, field: null, awake: false, voices: [], ovelVoices: [], ovelDelay: null, ovelFeedback: null, stopTimer: null,
    start() {
      if (this.awake || !state.points.length) return;
      if (this.context) { clearTimeout(this.stopTimer); this.context.resume(); this.output.gain.setTargetAtTime(.2, this.context.currentTime, .35); this.awake = true; soundButton.setAttribute("aria-pressed", "true"); soundButton.querySelector("b").textContent = "Silence"; return; }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext; if (!AudioContextClass) return; this.context = new AudioContextClass(); const compressor = this.context.createDynamicsCompressor(); compressor.threshold.value = -30; compressor.knee.value = 20; compressor.ratio.value = 4; compressor.attack.value = .12; compressor.release.value = .9; compressor.channelCount = 1;
      this.output = this.context.createGain(); this.output.gain.value = .0001; this.output.connect(compressor); compressor.connect(this.context.destination); this.field = this.context.createBiquadFilter(); this.field.type = "lowpass"; this.field.frequency.value = 1100; this.field.Q.value = .55; this.field.connect(this.output);
      const root = 52 + state.seed % 17; [1, 1.5, 2.01, 3.02, 4.49].forEach((ratio, index) => { const oscillator = this.context.createOscillator(), filter = this.context.createBiquadFilter(), gain = this.context.createGain(); oscillator.type = index < 2 ? "sine" : "triangle"; oscillator.frequency.value = root * ratio; oscillator.detune.value = ((state.seed >>> index * 3) % 11 - 5) * .45; filter.type = "bandpass"; filter.frequency.value = 190 + index * 260; filter.Q.value = 4.2 + index * 2.1; gain.gain.value = [.48, .24, .1, .045, .022][index]; oscillator.connect(filter); filter.connect(gain); gain.connect(this.field); oscillator.start(); this.voices.push(oscillator); });
      const ovelSeed = 3165167791, ovelRoot = 38 + ovelSeed % 12, colors = [[255,42,22],[30,190,82],[35,92,255]], intervals = [0,7,14], waveforms = ["sine","triangle","sawtooth"];
      this.ovelDelay = this.context.createDelay(.8); this.ovelDelay.delayTime.value = .24; this.ovelFeedback = this.context.createGain(); this.ovelFeedback.gain.value = .32; this.ovelDelay.connect(this.ovelFeedback); this.ovelFeedback.connect(this.ovelDelay); this.ovelDelay.connect(this.output);
      colors.forEach((color, index) => { const oscillator = this.context.createOscillator(), filter = this.context.createBiquadFilter(), gain = this.context.createGain(), dominant = color.indexOf(Math.max(...color)), colorLift = Math.round(color[dominant] / 255 * 5); oscillator.type = waveforms[(ovelSeed >>> (index * 5)) % waveforms.length]; oscillator.frequency.value = 440 * Math.pow(2, (ovelRoot + intervals[index] + colorLift - 69) / 12); filter.type = "bandpass"; filter.frequency.value = 620 + index * 180; filter.Q.value = 9; gain.gain.value = [.044,.039,.036][index]; oscillator.connect(filter); filter.connect(gain); gain.connect(this.output); gain.connect(this.ovelDelay); oscillator.start(); this.ovelVoices.push({ oscillator, filter, gain, index }); });
      this.output.gain.exponentialRampToValueAtTime(.2, this.context.currentTime + 3.4); this.awake = true; soundButton.setAttribute("aria-pressed", "true"); soundButton.querySelector("b").textContent = "Silence";
    },
    stop() { if (!this.awake || !this.context) return; this.output.gain.exponentialRampToValueAtTime(.0001, this.context.currentTime + .7); const audioContext = this.context; this.awake = false; this.stopTimer = setTimeout(() => { if (!this.awake) audioContext.suspend(); }, 850); soundButton.setAttribute("aria-pressed", "false"); soundButton.querySelector("b").textContent = "Listen"; },
    shape(pressure, orientation, zoom) { if (!this.awake || !this.context || !this.field || !this.output) return; const now = this.context.currentTime, distance = Math.hypot(state.pointer.smoothX / state.width - .5, state.pointer.smoothY / state.height - .5); this.field.frequency.setTargetAtTime(780 + (1 - clamp(distance, 0, .7)) * 820 + pressure * 420 + (zoom - .7) * 180, now, .22); this.output.gain.setTargetAtTime((orientation ? .17 : .2) + pressure * .025, now, .3); this.ovelVoices.forEach((voice) => { voice.filter.frequency.setTargetAtTime(520 + (1 - clamp(distance, 0, .8)) * 760 + voice.index * 180 + pressure * 240, now, .2); voice.oscillator.detune.setTargetAtTime(Math.sin(now * .11 + voice.index) * (4 + pressure * 7), now, .25); }); }
  };

  function draw(now) {
    resize(); const delta = Math.min(.05, Math.max(.001, (now - state.last) / 1000)), time = (now - state.start) / 1000; state.last = now; updateInteraction(delta); gl.clearColor(.0196, .0196, .0196, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (state.points.length) { const origin = center(), scale = Math.min(state.width, state.height) * (state.width < 680 ? .58 : .62) * OBJECT_SCALE * state.zoom, points = state.points.map((point, index) => evolve(point, index, time)); drawLines(points, scale, origin); drawMesh(points, time, delta, scale, origin); drawCore(time, scale, origin); sound.shape(state.pointer.pressure, state.orientation, state.zoom); }
    if (state.visible) requestAnimationFrame(draw);
  }
  function pointerPosition(event) { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  canvas.addEventListener("pointermove", (event) => { const p = pointerPosition(event); state.pointer.x = p.x; state.pointer.y = p.y; state.pointer.active = true; if (state.pointer.down) { const dx = p.x - state.pointer.lastX, dy = p.y - state.pointer.lastY; if (Math.hypot(p.x - state.pointer.startX, p.y - state.pointer.startY) > 6) state.pointer.moved = true; state.rotation.targetYaw += dx * .0042; state.rotation.targetPitch = clamp(state.rotation.targetPitch + dy * .0034, -.72, .72); state.rotation.velocityYaw = dx * .00055; state.rotation.velocityPitch = dy * .00042; } state.pointer.lastX = p.x; state.pointer.lastY = p.y; }, { passive: true });
  canvas.addEventListener("pointerdown", (event) => { const p = pointerPosition(event); canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true }); Object.assign(state.pointer, { x: p.x, y: p.y, smoothX: p.x, smoothY: p.y, active: true, down: true, moved: false, startX: p.x, startY: p.y, lastX: p.x, lastY: p.y }); if (!sound.awake) sound.start(); });
  canvas.addEventListener("pointerup", (event) => { if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); const origin = center(); if (!state.pointer.moved && Math.hypot(state.pointer.x - origin.x, state.pointer.y - origin.y) < 46) state.orientation = !state.orientation; state.pointer.down = false; });
  canvas.addEventListener("pointercancel", () => { state.pointer.down = false; }); canvas.addEventListener("pointerleave", () => { if (!state.pointer.down) state.pointer.active = false; });
  canvas.addEventListener("wheel", (event) => { event.preventDefault(); state.targetZoom = clamp(state.targetZoom * Math.exp(-event.deltaY * .0007), .72, 1.34); }, { passive: false });
  canvas.addEventListener("keydown", (event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); if (event.key === " ") sound.awake ? sound.stop() : sound.start(); else state.orientation = !state.orientation; } if (event.key === "ArrowLeft") state.rotation.targetYaw -= .16; if (event.key === "ArrowRight") state.rotation.targetYaw += .16; if (event.key === "ArrowUp") state.rotation.targetPitch = clamp(state.rotation.targetPitch - .12, -.72, .72); if (event.key === "ArrowDown") state.rotation.targetPitch = clamp(state.rotation.targetPitch + .12, -.72, .72); if (event.key === "Escape") { state.rotation.targetYaw = -.24; state.rotation.targetPitch = -.1; state.targetZoom = 1; state.orientation = false; } });
  soundButton.addEventListener("click", () => sound.awake ? sound.stop() : sound.start());
  document.addEventListener("visibilitychange", () => { state.visible = !document.hidden; if (state.visible) requestAnimationFrame(draw); if (document.hidden && sound.awake) sound.context?.suspend(); else if (sound.awake) sound.context?.resume(); });
  fetch("system-map.json", { cache: "no-store" }).then((response) => { if (!response.ok) throw new Error(`system-map.json: ${response.status}`); return response.json(); }).then(buildField).catch((error) => console.error("The Living System could not resolve.", error));
  requestAnimationFrame(draw);
})();
