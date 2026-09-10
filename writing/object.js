const canvas = document.getElementById("field");
const context = canvas.getContext("2d", { alpha: false });
const params = new URLSearchParams(location.search);
const sharedMode = params.get("body") === "shared";
const workNumber = Number(params.get("work") || 52);
let points = [];
let edges = [];
let rotationX = -.12;
let rotationY = .18;
let targetX = rotationX;
let targetY = rotationY;
let dragging = false;
let pointer = { x: 0, y: 0 };
let audioContext;
let score;
let soundTimers = [];

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

const draw = (time) => {
  rotationX += (targetX - rotationX) * .08;
  rotationY += (targetY - rotationY) * .08;
  const width = innerWidth;
  const height = innerHeight;
  const scaleBase = Math.min(width, height) * (sharedMode ? .12 : .38);
  context.fillStyle = "#050505";
  context.fillRect(0, 0, width, height);
  const projected = new Map();
  points.forEach((point, index) => {
    const pulse = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 1 + Math.sin(time * .00018 + index * .73) * .012;
    const turned = rotate({ x: point.x * pulse, y: point.y * pulse, z: point.z * pulse });
    const depth = 4.2 - turned.z;
    const perspective = 3.2 / depth;
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
  requestAnimationFrame(draw);
};

const stopSound = () => {
  soundTimers.forEach(clearTimeout);
  soundTimers = [];
  document.getElementById("sound").setAttribute("aria-pressed", "false");
  document.getElementById("sound").textContent = "Hear current sound";
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
    const body = await getJson("objects/shared-body.json");
    points = body.points;
    edges = body.relations;
    document.title = "Shared Writing Body — Root Logos";
    document.getElementById("work-label").textContent = `${body.work_numbers.length} writings · ${body.point_count} points`;
    document.getElementById("work-number").textContent = "Root Logos / shared writing body";
    document.getElementById("work-title").textContent = "One field, many addressable writings.";
    document.getElementById("work-state").textContent = "The body may evolve without rewriting the receipts or histories of the works that inhabit it.";
    document.getElementById("shared").hidden = true;
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

canvas.addEventListener("pointerdown", (event) => { dragging = true; pointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener("pointermove", (event) => { if (!dragging) return; targetY += (event.clientX - pointer.x) * .006; targetX += (event.clientY - pointer.y) * .006; pointer = { x: event.clientX, y: event.clientY }; });
canvas.addEventListener("pointerup", () => { dragging = false; });
canvas.addEventListener("pointercancel", () => { dragging = false; });
addEventListener("resize", resize);
resize();
requestAnimationFrame(draw);
load().catch((error) => { console.error(error); document.getElementById("work-title").textContent = "The current object could not be resolved."; });
