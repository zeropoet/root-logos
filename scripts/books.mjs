import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const force = process.argv.includes("--force");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const safeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

const parseReadings = (markdown) => Object.fromEntries(markdown
  .split(/\n## (?=\d{2} — )/).slice(1).map((block) => {
    const lines = block.trim().split("\n");
    const match = lines.shift()?.match(/^(\d{2}) — (.+)$/);
    if (!match) return [];
    return [Number(match[1]), { number: Number(match[1]), title: match[2], paragraphs: lines.join("\n").split(/\n\s*\n/).map((part) => part.trim()).filter((part) => part && part !== "---") }];
  }).filter((entry) => entry.length));

const catalogPath = join(root, "books", "catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const writingIndex = JSON.parse(await readFile(join(root, "writing", "objects", "index.json"), "utf8"));
const inquiryIndex = JSON.parse(await readFile(join(root, "inquiry", "index.json"), "utf8"));
const readings = parseReadings(await readFile(join(root, "reading", "sequence-52-55.md"), "utf8"));
const rootMark = await readFile(join(root, "assets", "root-logos-mark.svg"), "utf8");
const rootMarkData = `data:image/svg+xml,${encodeURIComponent(rootMark)}`;

const renderBook = (manifest, chapters) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#111110"><title>${escapeHtml(manifest.title)} — Root Logos</title><link rel="icon" href="${rootMarkData}" type="image/svg+xml"><style>
:root{--paper:#eeeae0;--ink:#111110;--red:#a52a24;--soft:#77736a}*{box-sizing:border-box}[hidden]{display:none!important}html{background:var(--ink);scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:Georgia,"Times New Roman",serif}.cover{display:grid;align-content:space-between;min-height:100svh;padding:clamp(28px,6vw,88px);background:var(--ink);color:var(--paper)}.mark{width:27px;height:27px}.mark svg{width:100%;height:100%}.kicker,.meta,.view-switch,.chapter-number,.colophon h2,.controls{font:500 .58rem/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}.cover h1{max-width:1050px;margin:0;font:400 clamp(4rem,11vw,10rem)/.82 Georgia,serif;letter-spacing:-.065em}.cover h1 em{display:block;color:var(--red);font-weight:400}.cover-bottom{display:flex;justify-content:space-between;gap:30px;border-top:1px solid #494740;padding-top:18px;color:#959188}.view-bar{position:sticky;z-index:5;top:0;display:flex;justify-content:space-between;align-items:center;padding:20px clamp(22px,5vw,72px);border-bottom:1px solid rgba(17,17,16,.18);background:rgba(238,234,224,.94);backdrop-filter:blur(14px)}.view-switch{display:flex;gap:22px}.view-switch button{border:0;border-bottom:1px solid transparent;padding:0 0 4px;background:none;color:var(--soft);font:inherit;letter-spacing:inherit;text-transform:inherit;cursor:pointer}.view-switch button.active{border-color:var(--ink);color:var(--ink)}.read{max-width:1320px;margin:auto}.chapter{display:grid;grid-template-columns:minmax(280px,.75fr) minmax(0,1.25fr);gap:clamp(45px,9vw,150px);min-height:100svh;padding:clamp(80px,11vw,170px) clamp(22px,6vw,88px);border-bottom:1px solid rgba(17,17,16,.18)}.plate{position:sticky;top:100px;align-self:start;aspect-ratio:1;background:#000}.plate svg{display:block;width:100%;height:100%}.chapter-number{margin:0 0 18px;color:var(--red)}.chapter h2{margin:0 0 55px;font:400 clamp(3rem,6vw,6.8rem)/.87 Georgia,serif;letter-spacing:-.055em}.prose{font-size:clamp(1.15rem,1.7vw,1.5rem);line-height:1.62}.prose p{margin:0 0 1.35em}.prose p:first-child{font-size:1.4em;line-height:1.3}.chapter-links{display:flex;gap:24px;margin-top:55px;padding-top:18px;border-top:1px solid rgba(17,17,16,.2)}.chapter-links a,.chapter-links button{border:0;border-bottom:1px solid rgba(17,17,16,.35);padding:0 0 5px;background:none;color:var(--ink);font:500 .56rem/1.3 Arial,sans-serif;letter-spacing:.1em;text-decoration:none;text-transform:uppercase;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:#333}.card{min-width:0;padding:0;background:var(--ink);color:var(--paper);text-align:left}.card button{width:100%;border:0;padding:0;background:none;color:inherit;text-align:left;cursor:pointer}.card .plate{position:static}.card-copy{display:grid;grid-template-columns:45px 1fr;gap:15px;padding:24px}.card-copy span{color:var(--red);font:500 .58rem/1 Arial,sans-serif}.card-copy b{font:400 clamp(1.4rem,2.4vw,2.5rem)/1 Georgia,serif}.colophon{display:grid;grid-template-columns:.45fr 1fr;gap:6vw;padding:clamp(90px,12vw,170px) clamp(22px,6vw,88px);background:#d9d5ca}.colophon h2{margin:0;color:var(--red)}.colophon blockquote{margin:0 0 50px;font-size:clamp(2rem,4vw,4.8rem);line-height:1;letter-spacing:-.04em}.inquiries{border-top:1px solid var(--ink)}.inquiries p{display:grid;grid-template-columns:1fr auto;gap:20px;margin:0;padding:15px 0;border-bottom:1px solid rgba(17,17,16,.18)}.inquiries span{color:var(--soft);font:500 .54rem/1 Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase}.controls{position:fixed;z-index:6;right:20px;bottom:20px;color:rgba(238,234,224,.55);mix-blend-mode:difference}@media(max-width:760px){.chapter{grid-template-columns:1fr}.plate{position:static}.grid{grid-template-columns:1fr}.colophon{grid-template-columns:1fr}.cover-bottom{flex-direction:column}.controls{display:none}}
</style></head><body><section class="cover"><div class="mark" aria-hidden="true"><svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#000"/><path d="M18 50h64M50 18v64" stroke="#fff" stroke-width="4"/><circle cx="50" cy="50" r="17" fill="none" stroke="#fff" stroke-width="4"/></svg></div><div><p class="kicker">${escapeHtml(manifest.volume_id)} / executable volume</p><h1>${escapeHtml(manifest.title)}<em>Root Logos</em></h1></div><div class="cover-bottom meta"><span>${manifest.work_numbers.length} writings · ${manifest.point_count} witnessed points</span><span>Not minted · compiled as a book</span></div></section><div class="view-bar"><span class="meta">The Personal Library of Root Logos</span><div class="view-switch" role="group" aria-label="Book view"><button class="active" data-view="read">Read</button><button data-view="grid">Contents</button></div></div><main><div class="read" id="read">${chapters.map((chapter) => `<article class="chapter" id="work-${chapter.number}"><div><div class="plate">${chapter.frame}</div></div><div><p class="chapter-number">Writing ${chapter.number}</p><h2>${escapeHtml(chapter.title)}</h2><div class="prose">${chapter.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div><div class="chapter-links"><button data-sound="${chapter.number}">Hear the witnessed tone</button><a href="https://rootlogos.com/writing/object.html?work=${chapter.number}">Enter living object ↗</a></div></div></article>`).join("")}</div><div class="grid" id="grid" hidden>${chapters.map((chapter) => `<article class="card"><button data-chapter="${chapter.number}"><div class="plate">${chapter.frame}</div><div class="card-copy"><span>${chapter.number}</span><b>${escapeHtml(chapter.title)}</b></div></button></article>`).join("")}</div><section class="colophon"><h2>State of inquiry</h2><div><blockquote>This volume preserves one arrangement. Root Logos remains unfinished.</blockquote><div class="inquiries">${manifest.inquiries.map((inquiry) => `<p>${escapeHtml(inquiry.title)}<span>${escapeHtml(inquiry.status)} · ${inquiry.direct_relation_count} relations</span></p>`).join("")}</div></div></section></main><p class="controls">← → move between writings</p><script id="volume-data" type="application/json">${safeJson({ scores: Object.fromEntries(chapters.map(({ number, sound }) => [number, sound.score])) })}</script><script>
const data=JSON.parse(document.getElementById("volume-data").textContent);let audio,timer;const stop=()=>{if(timer)clearTimeout(timer);timer=null;document.querySelectorAll("[data-sound]").forEach(b=>{b.textContent="Hear the witnessed tone";b.setAttribute("aria-pressed","false")})};const play=async(button)=>{if(timer)return stop();audio||=new AudioContext();await audio.resume();const score=data.scores[button.dataset.sound],start=audio.currentTime+.04;score.events.forEach(event=>{const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type="sine";oscillator.frequency.value=score.root_hz*event.ratio;gain.gain.setValueAtTime(.0001,start+event.at);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,event.amplitude*.55),start+event.at+.08);gain.gain.exponentialRampToValueAtTime(.0001,start+event.at+event.duration);oscillator.connect(gain).connect(audio.destination);oscillator.start(start+event.at);oscillator.stop(start+event.at+event.duration+.05)});button.textContent="Silence witnessed tone";button.setAttribute("aria-pressed","true");timer=setTimeout(stop,score.duration_seconds*1000+100)};document.querySelectorAll("[data-sound]").forEach(button=>button.addEventListener("click",()=>play(button)));document.querySelectorAll("[data-view]").forEach(button=>button.addEventListener("click",()=>{const grid=button.dataset.view==="grid";document.getElementById("grid").hidden=!grid;document.getElementById("read").hidden=grid;document.querySelectorAll("[data-view]").forEach(item=>item.classList.toggle("active",item===button))}));document.querySelectorAll("[data-chapter]").forEach(button=>button.addEventListener("click",()=>{document.querySelector('[data-view="read"]').click();document.getElementById("work-"+button.dataset.chapter).scrollIntoView()}));const chapters=[...document.querySelectorAll(".chapter")];addEventListener("keydown",event=>{if(!["ArrowLeft","ArrowRight"].includes(event.key))return;const y=scrollY+innerHeight*.3;let index=chapters.findIndex(chapter=>chapter.offsetTop>=y);if(index<0)index=chapters.length-1;if(event.key==="ArrowLeft")index=Math.max(0,index-1);chapters[Math.min(chapters.length-1,index)].scrollIntoView({behavior:"smooth"})});
</script></body></html>`;

const renderShelf = (volumes) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#111110"><title>The Personal Library of Root Logos</title><style>*{box-sizing:border-box}html{background:#111110;color:#eeeae0}body{margin:0;padding:clamp(28px,6vw,88px);font-family:Georgia,"Times New Roman",serif}header{display:grid;align-content:space-between;min-height:45vh;padding-bottom:70px;border-bottom:1px solid #48463f}header p,.number,.state,footer{font:500 .58rem/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase}header p,.number{color:#a52a24}h1{max-width:900px;margin:0;font:400 clamp(4rem,10vw,9rem)/.82 Georgia,serif;letter-spacing:-.065em}.shelf{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;margin-top:70px;background:#34332f}.book{display:flex;min-height:52vh;flex-direction:column;justify-content:space-between;padding:clamp(24px,4vw,52px);background:#111110;color:#eeeae0;text-decoration:none}.book h2{max-width:440px;margin:35px 0;font:400 clamp(2.4rem,4vw,4.8rem)/.9 Georgia,serif;letter-spacing:-.05em}.book:hover{background:#eeeae0;color:#111110}.state{color:#77736a}footer{margin-top:90px;color:#77736a}@media(max-width:760px){.shelf{grid-template-columns:1fr}.book{min-height:58vh}}</style></head><body><header><p>Root Logos / compiled volumes</p><h1>A library of bounded refractions.</h1></header><main class="shelf">${volumes.map((volume) => `<a class="book" href="${escapeHtml(volume.slug)}/book.html"><span class="number">Volume ${String(volume.ordinal).padStart(2, "0")}</span><h2>${escapeHtml(volume.title)}</h2><span class="state">${volume.work_numbers.length} writings · ${volume.point_count} points · ${escapeHtml(volume.status)}</span></a>`).join("")}</main><footer>Books are not minted. They preserve executable arrangements of writings that remain alive elsewhere.</footer></body></html>`;

for (const volume of catalog.volumes) {
  const directory = join(root, "books", volume.slug);
  const manifestPath = join(directory, "manifest.json");
  const bookPath = join(directory, "book.html");
  if (check) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const book = await readFile(bookPath, "utf8");
    if (`sha256:${sha256(book)}` !== manifest.executable.sha256) throw new Error(`${volume.volume_id} executable witness does not match`);
    if (manifest.volume_id !== volume.volume_id || canonical(manifest) !== await readFile(manifestPath, "utf8")) throw new Error(`${volume.volume_id} manifest is not canonical`);
    continue;
  }
  const existing = await readFile(manifestPath, "utf8").catch(() => null);
  if (existing && volume.status === "sealed" && !force) {
    console.log(`Preserved sealed ${volume.volume_id}; compile a new catalog volume for later growth.`);
    continue;
  }
  const chapters = await Promise.all(volume.work_numbers.map(async (number) => {
    const record = writingIndex.works.find(({ work_number }) => work_number === number);
    if (!record || !readings[number]) throw new Error(`${volume.volume_id} cannot resolve writing ${number}`);
    const current = JSON.parse(await readFile(join(root, record.current), "utf8"));
    const receipt = JSON.parse(await readFile(join(root, current.receipt), "utf8"));
    const sound = JSON.parse(await readFile(join(root, current.sound), "utf8"));
    const frame = await readFile(join(root, receipt.first_frame.path), "utf8");
    return { ...readings[number], point_count: record.point_count, current, receipt, sound, frame: frame.replace(/^<\?xml[^>]*>\s*/i, "") };
  }));
  const inquiries = volume.inquiry_ids.map((id) => {
    const entry = inquiryIndex.inquiries.find(({ inquiry_id }) => inquiry_id === id);
    if (!entry) throw new Error(`${volume.volume_id} cannot resolve inquiry ${id}`);
    return entry;
  });
  const manifestBase = {
    schema: "root-logos-executable-book/v1",
    volume_id: volume.volume_id,
    ordinal: volume.ordinal,
    title: volume.title,
    subtitle: volume.subtitle,
    status: volume.status,
    form: "self-contained HTML executable",
    ownership: "No token or ownership gate. The volume compiles witnessed public states; individual writing receipts remain independent.",
    work_numbers: volume.work_numbers,
    point_count: chapters.reduce((sum, chapter) => sum + chapter.point_count, 0),
    chapters: chapters.map((chapter) => ({ work_number: chapter.number, title: chapter.title, writing_witness: chapter.receipt.witnesses.writing, first_frame_witness: chapter.receipt.first_frame.sha256, geometry_witness: chapter.receipt.witnesses.geometry_v1, sound_witness: chapter.receipt.witnesses.sound_v1, living_object: `https://rootlogos.com/writing/object.html?work=${chapter.number}` })),
    inquiries: inquiries.map(({ inquiry_id, title, status, answer_state, direct_relation_count, cultivation_finding_count, witness }) => ({ inquiry_id, title, status, answer_state, direct_relation_count, cultivation_finding_count, witness })),
    boundary: "This volume is sealed. Later growth belongs to later volumes and does not rewrite this executable."
  };
  const provisional = { ...manifestBase, executable: { path: `books/${volume.slug}/book.html`, sha256: "pending" } };
  const book = renderBook(provisional, chapters);
  const manifest = { ...manifestBase, executable: { path: `books/${volume.slug}/book.html`, sha256: `sha256:${sha256(book)}` } };
  await mkdir(directory, { recursive: true });
  await writeFile(bookPath, book);
  await writeFile(manifestPath, canonical(manifest));
  console.log(`Compiled ${volume.volume_id}: ${volume.title}`);
}

const shelfVolumes = await Promise.all(catalog.volumes.map(async (volume) => ({ ...volume, ...JSON.parse(await readFile(join(root, "books", volume.slug, "manifest.json"), "utf8")) })));
const shelf = renderShelf(shelfVolumes);
const shelfPath = join(root, "books", "index.html");
if (check) {
  if (await readFile(shelfPath, "utf8").catch(() => "") !== shelf) throw new Error("The Root Logos personal-library shelf is not synchronized");
} else {
  await writeFile(shelfPath, shelf);
}

console.log(`${check ? "Verified" : "Compiled"} ${catalog.volumes.length} Root Logos book${catalog.volumes.length === 1 ? "" : "s"}.`);
