const canvas = document.getElementById("field");
const context = canvas.getContext("2d", { alpha: false });
const params = new URLSearchParams(location.search);
const sharedMode = params.get("body") === "shared";
const workNumber = Number(params.get("work") || 52);
let points = [];
let edges = [];
let rotationX = sharedMode ? 0 : -.12;
let rotationY = sharedMode ? 0 : .18;
let targetX = rotationX;
let targetY = rotationY;
let dragging = false;
let pointer = { x: 0, y: 0 };
let dragDistance = 0;
const camera = { x: 0, y: 0, z: 4.6 };
const keys = new Set();
let previousTime = 0;
let audioContext;
let score;
let soundTimers = [];
let soundField = [];
let fieldScheduler;
let mixActive = false;

const rootPath = (path) => new URL(`/${path.replace(/^\//, "")}`, location.origin).href;
const getJson = async (path) => {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not resolve ${path}`);
  return response.json();
};

const resize = () => {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * ratio);
  canvas.height = Math.round(innerHeight * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
};

const rotate = (point) => {
  const cy = Math.cos(rotationY), sy = Math.sin(rotationY);
  const cx = Math.cos(rotationX), sx = Math.sin(rotationX);
  const x = point.x * cy - point.z * sy;
  const z1 = point.x * sy + point.z * cy;
  return { x, y: point.y * cx - z1 * sx, z: point.y * sx + z1 * cx };
};

const cameraProjection = (point) => {
  const dx = point.x - camera.x, dy = point.y - camera.y, dz = point.z - camera.z;
  const cy = Math.cos(rotationY), sy = Math.sin(rotationY);
  const cx = Math.cos(rotationX), sx = Math.sin(rotationX);
  const x1 = dx * cy - dz * sy;
  const z1 = dx * sy + dz * cy;
  return { x: x1, y: dy * cx - z1 * sx, z: dy * sx + z1 * cx };
};

const moveCamera = (elapsed) => {
  if (!sharedMode) return;
  const speed = Math.min(.045, elapsed * .00115);
  const forwardX = -Math.sin(rotationY), forwardZ = -Math.cos(rotationY);
  const rightX = Math.cos(rotationY), rightZ = -Math.sin(rotationY);
  if (keys.has("ArrowUp") || keys.has("KeyW")) { camera.x += forwardX * speed; camera.z += forwardZ * speed; }
  if (keys.has("ArrowDown") || keys.has("KeyS")) { camera.x -= forwardX * speed; camera.z -= forwardZ * speed; }
  if (keys.has("ArrowLeft") || keys.has("KeyA")) { camera.x -= rightX * speed; camera.z -= rightZ * speed; }
  if (keys.has("ArrowRight") || keys.has("KeyD")) { camera.x += rightX * speed; camera.z += rightZ * speed; }
  if (keys.has("KeyQ")) camera.y -= speed;
  if (keys.has("KeyE")) camera.y += speed;
  const radius = Math.hypot(camera.x, camera.y, camera.z);
  if (radius > 7) { camera.x *= 7 / radius; camera.y *= 7 / radius; camera.z *= 7 / radius; }
};

const updateSpatialMix = () => {
  if (!sharedMode || !soundField.length) return;
  const proximity = soundField.map(({ center }) => 1 / Math.pow(.42 + Math.hypot(camera.x - center.x, camera.y - center.y, camera.z - center.z), 2));
  const total = proximity.reduce((sum, value) => sum + value, 0) || 1;
  soundField.forEach((voice, index) => {
    const direct = proximity[index] / total;
    const related = soundField.reduce((sum, candidate, candidateIndex) => {
      if (candidateIndex === index) return sum;
      const relation = voice.correlations.find(({ from, to }) => (from === voice.workNumber && to === candidate.workNumber) || (to === voice.workNumber && from === candidate.workNumber));
      return sum + (proximity[candidateIndex] / total) * (relation?.weight || 0) * .28;
    }, 0);
    voice.mix = Math.min(.62, direct * .78 + related);
    if (voice.gain && audioContext) voice.gain.gain.setTargetAtTime(mixActive ? voice.mix : 0, audioContext.currentTime, .08);
  });
  const nearest = [...soundField].sort((a, b) => b.mix - a.mix).slice(0, 2);
  document.getElementById("work-label").textContent = nearest.length > 1
    ? `Blend: ${nearest[0].workNumber} ${Math.round(nearest[0].mix * 100)}% / ${nearest[1].workNumber} ${Math.round(nearest[1].mix * 100)}% · ${points.length} points`
    : `${points.length} points`;
};

const draw = (time) => {
  const elapsed = previousTime ? time - previousTime : 16;
  previousTime = time;
  rotationX += (targetX - rotationX) * .08;
  rotationY += (targetY - rotationY) * .08;
  moveCamera(elapsed);
  const width = innerWidth;
  const height = innerHeight;
  const scaleBase = Math.min(width, height) * .38;
  context.fillStyle = "#050505";
  context.fillRect(0, 0, width, height);
  const projected = new Map();
  points.forEach((point, index) => {
    const pulse = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 1 + Math.sin(time * .00018 + index * .73) * .012;
    const sourcePoint = { x: point.x * pulse, y: point.y * pulse, z: point.z * pulse };
    const turned = sharedMode ? cameraProjection(sourcePoint) : rotate(sourcePoint);
    const depth = sharedMode ? -turned.z : 4.2 - turned.z;
    if (depth <= .08) return;
    const perspective = (sharedMode ? 3.8 : 3.2) / depth;
    projected.set(point.id, { x: width / 2 + turned.x * scaleBase * perspective, y: height / 2 - turned.y * scaleBase * perspective, depth, perspective, point });
  });
  context.lineWidth = .65;
  edges.forEach((edge) => {
    const from = projected.get(edge.from);
    const to = projected.get(edge.to);
    if (!from || !to) return;
    context.strokeStyle = `rgba(242,240,233,${.055 + (edge.weight || .3) * .12})`;
    context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
  });
  [...projected.values()].sort((a, b) => b.depth - a.depth).forEach(({ x, y, perspective, point }) => {
    const radius = Math.max(.65, (point.source === "sound" ? 2.2 : .8 + (point.mass || .2) * 1.8) * perspective);
    context.fillStyle = point.source === "sound" ? "rgba(255,255,255,.98)" : `rgba(242,240,233,${.34 + (point.mass || .2) * .55})`;
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  });
  updateSpatialMix();
  requestAnimationFrame(draw);
};

const stopSound = () => {
  soundTimers.forEach(clearTimeout);
  soundTimers = [];
  if (fieldScheduler) clearInterval(fieldScheduler);
  fieldScheduler = null;
  mixActive = false;
  soundField.forEach(({ gain }) => { if (gain && audioContext) gain.gain.setTargetAtTime(0, audioContext.currentTime, .03); });
  document.getElementById("sound").setAttribute("aria-pressed", "false");
  document.getElementById("sound").textContent = "Hear current sound";
};

const scheduleFieldCycle = (voice, start) => {
  voice.score.events.forEach((event) => {
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    oscillator.type = voice.workNumber % 2 ? "sine" : "triangle";
    oscillator.frequency.value = voice.score.root_hz * event.ratio;
    envelope.gain.setValueAtTime(.0001, start + event.at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002, event.amplitude * .7), start + event.at + .08);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + event.at + event.duration);
    oscillator.connect(envelope).connect(voice.gain);
    oscillator.start(start + event.at);
    oscillator.stop(start + event.at + event.duration + .05);
  });
};

const playSoundField = async () => {
  if (mixActive) return stopSound();
  audioContext ||= new AudioContext();
  await audioContext.resume();
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -18; compressor.knee.value = 12; compressor.ratio.value = 5;
  compressor.connect(audioContext.destination);
  const start = audioContext.currentTime + .08;
  soundField.forEach((voice) => {
    voice.gain = audioContext.createGain();
    voice.gain.gain.value = 0;
    voice.gain.connect(compressor);
    voice.nextStart = start;
  });
  const schedule = () => soundField.forEach((voice) => {
    while (voice.nextStart < audioContext.currentTime + 1.2) {
      scheduleFieldCycle(voice, voice.nextStart);
      voice.nextStart += voice.score.duration_seconds;
    }
  });
  mixActive = true;
  schedule();
  fieldScheduler = setInterval(schedule, 400);
  const button = document.getElementById("sound");
  button.setAttribute("aria-pressed", "true");
  button.textContent = "Silence spatial record";
};

const playSound = async () => {
  if (soundTimers.length) return stopSound();
  audioContext ||= new AudioContext();
  await audioContext.resume();
  const start = audioContext.currentTime + .04;
  score.events.forEach((event) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = score.root_hz * event.ratio;
    gain.gain.setValueAtTime(0, start + event.at);
    gain.gain.linearRampToValueAtTime(event.amplitude * .55, start + event.at + .08);
    gain.gain.exponentialRampToValueAtTime(.0001, start + event.at + event.duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start + event.at);
    oscillator.stop(start + event.at + event.duration + .05);
  });
  const button = document.getElementById("sound");
  button.setAttribute("aria-pressed", "true");
  button.textContent = "Silence current sound";
  soundTimers.push(setTimeout(stopSound, score.duration_seconds * 1000 + 150));
};

const load = async () => {
  if (sharedMode) {
    const [body, registry] = await Promise.all([getJson("objects/shared-body.json"), getJson("objects/index.json")]);
    points = body.points;
    edges = body.relations;
    soundField = await Promise.all(registry.works.map(async (work) => {
      const current = await getJson(rootPath(work.current));
      const sound = await getJson(rootPath(current.sound));
      return { workNumber: work.work_number, title: work.title, score: sound.score, center: body.centers.find(({ work_number }) => work_number === work.work_number), correlations: body.correlations, mix: 0 };
    }));
    document.title = "Shared Writing Body — Root Logos";
    document.getElementById("work-label").textContent = `${body.work_numbers.length} writings · ${body.point_count} points`;
    document.getElementById("work-number").textContent = "Root Logos / shared writing body";
    document.getElementById("work-title").textContent = "One field, many addressable writings.";
    document.getElementById("work-state").textContent = "The body may evolve without rewriting the receipts or histories of the works that inhabit it.";
    const soundButton = document.getElementById("sound");
    soundButton.hidden = false;
    soundButton.textContent = "Enter spatial record";
    soundButton.addEventListener("click", playSoundField);
    document.getElementById("field-controls").hidden = false;
    document.getElementById("shared").hidden = true;
    document.querySelector(".gesture").textContent = matchMedia("(pointer: coarse)").matches
      ? "Drag to turn · tap or use arrows to move"
      : "Drag to turn · wheel or arrows to move · center resets";
    return;
  }
  const current = await getJson(`objects/${workNumber}/current.json`);
  const [geometry, sound] = await Promise.all([getJson(rootPath(current.geometry)), getJson(rootPath(current.sound))]);
  points = geometry.points;
  edges = geometry.edges;
  score = sound.score;
  document.title = `${current.work_number} — ${current.title} — Root Logos`;
  document.getElementById("work-label").textContent = `${points.length} points · geometry v1 · sound v1`;
  document.getElementById("work-number").textContent = `Root Logos / work ${current.work_number}`;
  document.getElementById("work-title").textContent = current.title;
  document.getElementById("receipt").href = rootPath(current.receipt);
  document.getElementById("receipt").hidden = false;
  document.getElementById("sound").hidden = false;
  document.getElementById("sound").addEventListener("click", playSound);
};

canvas.addEventListener("pointerdown", (event) => { dragging = true; dragDistance = 0; pointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener("pointermove", (event) => { if (!dragging) return; const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y; dragDistance += Math.hypot(dx, dy); targetY += dx * .0024; targetX = Math.max(-1.15, Math.min(1.15, targetX + dy * .0024)); pointer = { x: event.clientX, y: event.clientY }; });
canvas.addEventListener("pointerup", () => {
  dragging = false;
  if (sharedMode && dragDistance < 7) {
    camera.x += -Math.sin(rotationY) * .28;
    camera.z += -Math.cos(rotationY) * .28;
  }
});
canvas.addEventListener("pointercancel", () => { dragging = false; });
canvas.addEventListener("wheel", (event) => {
  if (!sharedMode) return;
  event.preventDefault();
  const amount = Math.max(-.18, Math.min(.18, event.deltaY * .0015));
  camera.x += -Math.sin(rotationY) * amount;
  camera.z += -Math.cos(rotationY) * amount;
}, { passive: false });
addEventListener("keydown", (event) => {
  if (!sharedMode || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"].includes(event.code)) return;
  event.preventDefault(); keys.add(event.code);
});
addEventListener("keyup", (event) => keys.delete(event.code));
document.querySelectorAll("[data-move]").forEach((button) => {
  const begin = (event) => { event.preventDefault(); keys.add(button.dataset.move); button.classList.add("is-held"); };
  const end = () => { keys.delete(button.dataset.move); button.classList.remove("is-held"); };
  button.addEventListener("pointerdown", begin);
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("pointerleave", end);
});
document.querySelector("[data-reset-view]").addEventListener("click", () => {
  camera.x = 0; camera.y = 0; camera.z = 4.6;
  targetX = 0; targetY = 0;
});
addEventListener("resize", resize);
resize();
requestAnimationFrame(draw);
load().catch((error) => { console.error(error); document.getElementById("work-title").textContent = "The current object could not be resolved."; });
