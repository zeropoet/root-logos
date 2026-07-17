(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const hash = (value) => [...String(value)].reduce((sum, character) => Math.imul(sum ^ character.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const sentence = (value = "") => String(value).replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

  class ResonantChamber {
    constructor(state, grammar) {
      this.state = state;
      this.grammar = grammar;
      this.audio = null;
      this.master = null;
      this.scheduler = null;
      this.started = false;
      this.paused = false;
      this.muted = false;
      this.cursor = 0;
      this.nextAt = 0;
      this.eventsHeard = [];
      this.refreshing = false;
      this.lastSynchronized = new Date();
      this.presence = .58;
      this.complexity = 3;
      this.score = this.compose();
      this.canvas = $("#resonance-canvas");
      this.context = this.canvas.getContext("2d");
      this.phase = 0;
      this.bind();
      this.renderScore();
      this.renderProvenance();
      this.renderAudit();
      this.resize();
      requestAnimationFrame(() => this.draw());
      this.beginSynchronization();
    }

    compose() {
      const { graph, runtime, cycles, memory, attractors } = this.state;
      const nodes = graph.nodes || [];
      const edges = graph.edges || [];
      const hypotheses = Object.values(memory?.hypotheses || {});
      const questions = nodes.filter(({ type }) => type === "open-question");
      const proposals = cycles.filter(({ status }) => ["awaiting-human-review", "proposed"].includes(status));
      const emitted = (attractors?.packets || []).filter(({ status, publication }) => status === "emitted" || publication?.status === "published");
      const seedText = JSON.stringify({
        revision: graph.meta.revision,
        nodes: nodes.map(({ id, status, type }) => [id, status, type]),
        edges: edges.map(({ from, to, relation, type }) => [from, to, relation || type]),
        cycles: cycles.map(({ cultivation_id, status, decision, updated_at }) => [cultivation_id, status, decision, updated_at]),
        memory: hypotheses.map(({ fingerprint, status, considerations, last_cycle }) => [fingerprint, status, considerations, last_cycle]),
        attractors: (attractors?.packets || []).map(({ attractor_id, status, publication }) => [attractor_id, status, publication?.status, publication?.published_at]),
        runtime: [runtime.service?.status, runtime.service?.last_wake_at, runtime.intake_count, runtime.intake_pending, runtime.hypothesis_count]
      });
      const seed = hash(seedText);
      const tempo = clamp(this.grammar.tempo.base + (edges.length % 9) - (runtime.dormancy?.active ? 8 : 0), this.grammar.tempo.minimum, this.grammar.tempo.maximum);
      const sources = [
        { voice: "constitution", count: nodes.filter(({ status }) => /constitutional/i.test(status || "")).length || 1, source: graph.meta.revision, label: "Constitutional continuity" },
        { voice: "relation", count: edges.length, source: `${edges.length} explicit relations`, label: "Relational field" },
        { voice: "inquiry", count: questions.length + (runtime.service?.status === "running" ? 3 : 0), source: `${questions.length} open questions`, label: "Inquiry pressure" },
        { voice: "memory", count: hypotheses.length, source: `${hypotheses.length} preserved hypotheses`, label: "Semantic memory" },
        { voice: "threshold", count: Math.max(1, proposals.length), source: `${proposals.length} unresolved proposals`, label: "Authority threshold" },
        { voice: "breath", count: Math.max(1, emitted.length + (runtime.intake_count || 0)), source: `${emitted.length} emitted fragments / ${runtime.intake_count || 0} arrivals`, label: "World exchange" }
      ];
      const events = Array.from({ length: 48 }, (_, index) => {
        const source = sources[(seed + index * 5 + Math.floor(index / 7)) % sources.length];
        const voice = this.grammar.voices[source.voice];
        const degree = (seed + index * 3 + source.count) % this.grammar.scale.ratios.length;
        const octave = voice.register + ((seed >>> (index % 16)) & 1);
        const rest = index % 11 === 0 || (runtime.dormancy?.active && index % 4 === 0);
        return {
          index,
          voice: source.voice,
          label: source.label,
          provenance: source.source,
          frequency: this.grammar.scale.rootHz * this.grammar.scale.ratios[degree] * (2 ** octave),
          beats: index % 7 === 0 ? 2 : index % 3 === 0 ? 1 : .5,
          rest,
          wave: voice.wave
        };
      });
      return { schema: "resonant-score/v1", seed, signature: seed.toString(16).padStart(8, "0"), tempo, sources, events };
    }

    bind() {
      window.addEventListener("resize", () => this.resize());
      $("#listen-control").addEventListener("click", () => this.started ? this.stop() : this.start());
      $("#resonance-pause").addEventListener("click", () => this.togglePause());
      $("#resonance-mute").addEventListener("click", () => this.toggleMute());
      [["#resonance-presence", "presence"], ["#resonance-complexity", "complexity"]].forEach(([selector, key]) => {
        $(selector).addEventListener("input", (event) => {
          const value = Number(event.target.value);
          event.target.nextElementSibling.value = value;
          this[key] = key === "presence" ? value / 100 : value;
          if (this.master && key === "presence" && !this.muted) this.master.gain.setTargetAtTime(this.gain(), this.audio.currentTime, .08);
        });
      });
    }

    beginSynchronization() {
      this.refreshTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") this.refresh().catch(() => {});
      }, 45000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && Date.now() - this.lastSynchronized.getTime() > 15000) this.refresh().catch(() => {});
      });
      window.addEventListener("focus", () => {
        if (Date.now() - this.lastSynchronized.getTime() > 15000) this.refresh().catch(() => {});
      });
      window.addEventListener("rootlogos:topology", ({ detail }) => this.synchronize(detail, "system signal"));
      this.renderSynchrony("current");
    }

    async refresh() {
      if (this.refreshing) return;
      this.refreshing = true;
      this.renderSynchrony("listening");
      const bust = `?topology=${Date.now()}`;
      try {
        const request = async (url) => {
          const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
          if (!response.ok) throw new Error(`${url} returned ${response.status}`);
          return response.json();
        };
        const results = await Promise.allSettled([
          request(`content/constitutional-graph.json${bust}`),
          request(`${RUNTIME}/v1/status`),
          request(`${RUNTIME}/v1/cycles`),
          request(`cultivation/memory.json${bust}`),
          request(`content/attractor-packets.json${bust}`)
        ]);
        if (!results.some(({ status }) => status === "fulfilled")) throw new Error("No topology source responded");
        const value = (index, fallback) => results[index].status === "fulfilled" ? results[index].value : fallback;
        const cycleResult = value(2, { cycles: this.state.cycles });
        this.synchronize({
          graph: value(0, this.state.graph),
          runtime: value(1, this.state.runtime),
          cycles: cycleResult.cycles || this.state.cycles,
          memory: value(3, this.state.memory),
          attractors: value(4, this.state.attractors)
        }, results.every(({ status }) => status === "fulfilled") ? "live topology" : "reconciled topology");
      } catch (error) {
        this.renderSynchrony("preserved");
        console.warn("Resonant synchronization retained the last witnessed topology.", error);
      } finally {
        this.refreshing = false;
      }
    }

    synchronize(state, source) {
      if (!state?.graph || !state?.runtime) return;
      const previousSignature = this.score.signature;
      this.state = state;
      const nextScore = this.compose();
      this.lastSynchronized = new Date();
      if (nextScore.signature === previousSignature) {
        this.renderSynchrony("current");
        return;
      }
      this.score = nextScore;
      this.cursor = this.cursor % this.score.events.length;
      this.renderScore();
      this.renderProvenance();
      this.renderAudit();
      this.renderSynchrony("recomposed");
      this.trace({
        label: "Topology recomposed",
        voice: "constitution",
        provenance: `${source} changed score ${previousSignature} into ${nextScore.signature}`,
        rest: true
      });
      if (this.started && !this.paused) {
        this.master.gain.cancelScheduledValues(this.audio.currentTime);
        this.master.gain.setTargetAtTime(this.muted ? 0 : this.gain(), this.audio.currentTime, .6);
      }
    }

    renderSynchrony(state) {
      const element = $("#score-synchrony");
      element.dataset.state = state;
      const time = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(this.lastSynchronized);
      const labels = {
        current: `Current with the witnessed topology · ${time}`,
        listening: "Listening for architectural change",
        preserved: `Live contact unavailable · preserving ${time} reading`,
        recomposed: `New topology received · score recomposed ${time}`
      };
      element.querySelector("span").textContent = labels[state];
    }

    gain() { return Math.min(this.grammar.limits.maximumGain, .018 + this.presence * .09); }

    async start() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        $("#resonance-state").textContent = "This browser cannot form the chamber.";
        return;
      }
      this.audio ||= new AudioContext();
      await this.audio.resume();
      this.master ||= this.audio.createGain();
      this.master.connect(this.audio.destination);
      this.master.gain.setValueAtTime(0, this.audio.currentTime);
      this.master.gain.linearRampToValueAtTime(this.gain(), this.audio.currentTime + 1.8);
      this.started = true;
      this.paused = false;
      this.nextAt = this.audio.currentTime + .12;
      this.scheduler = window.setInterval(() => this.schedule(), 120);
      $("#resonance-instrument").dataset.state = "sounding";
      $("#listen-control").setAttribute("aria-pressed", "true");
      $("#listen-label").textContent = "Return to silence";
      $("#resonance-state").textContent = "The field is sounding.";
      $("#resonance-declaration").textContent = `A ${this.score.tempo} BPM reading of revision ${this.state.graph.meta.revision}, composed now from preserved state.`;
      $("#resonance-pause").disabled = false;
      $("#resonance-mute").disabled = false;
      this.schedule();
    }

    stop() {
      clearInterval(this.scheduler);
      this.scheduler = null;
      if (this.master) this.master.gain.setTargetAtTime(0, this.audio.currentTime, .12);
      this.started = false;
      this.paused = false;
      $("#resonance-instrument").dataset.state = "silent";
      $("#listen-control").setAttribute("aria-pressed", "false");
      $("#listen-label").textContent = "Enter listening";
      $("#resonance-state").textContent = "Silence is present.";
      $("#resonance-declaration").textContent = "The chamber retains its reading. Silence closes the composition without erasing its trace.";
      $("#resonance-pause").disabled = true;
      $("#resonance-mute").disabled = true;
      this.trace({ label: "Silence", provenance: "Listening ended by the participant", rest: true });
    }

    togglePause() {
      this.paused = !this.paused;
      $("#resonance-pause").textContent = this.paused ? "Resume" : "Pause";
      this.master.gain.setTargetAtTime(this.paused ? 0 : this.gain(), this.audio.currentTime, .1);
      if (!this.paused) this.nextAt = this.audio.currentTime + .12;
    }

    toggleMute() {
      this.muted = !this.muted;
      $("#resonance-mute").textContent = this.muted ? "Unmute" : "Mute";
      $("#resonance-mute").setAttribute("aria-pressed", String(this.muted));
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.gain(), this.audio.currentTime, .08);
    }

    schedule() {
      if (!this.started || this.paused) return;
      const beat = 60 / this.score.tempo;
      while (this.nextAt < this.audio.currentTime + .65) {
        const event = this.score.events[this.cursor % this.score.events.length];
        const duration = event.beats * beat;
        const allowed = this.voiceAllowed(event);
        const renderedEvent = allowed ? event : { ...event, rest: true, provenance: `Complexity boundary withheld ${event.label.toLowerCase()}` };
        if (!event.rest && allowed) this.sound(event, this.nextAt, duration);
        window.setTimeout(() => this.trace(renderedEvent), Math.max(0, (this.nextAt - this.audio.currentTime) * 1000));
        this.nextAt += duration;
        this.cursor += 1;
      }
    }

    voiceAllowed(event) {
      const order = ["constitution", "breath", "relation", "memory", "inquiry", "threshold"];
      return order.indexOf(event.voice) < this.complexity + 2;
    }

    sound(event, at, duration) {
      const oscillator = this.audio.createOscillator();
      const envelope = this.audio.createGain();
      const filter = this.audio.createBiquadFilter();
      oscillator.type = event.wave;
      oscillator.frequency.setValueAtTime(event.frequency, at);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(680 + this.presence * 1700, at);
      envelope.gain.setValueAtTime(.0001, at);
      envelope.gain.exponentialRampToValueAtTime(.16 / Math.max(2, this.complexity), at + Math.min(.22, duration * .25));
      envelope.gain.exponentialRampToValueAtTime(.0001, at + Math.max(.3, duration * .92));
      oscillator.connect(filter).connect(envelope).connect(this.master);
      oscillator.start(at);
      oscillator.stop(at + duration + .05);
    }

    trace(event) {
      const heard = { ...event, at: Date.now() };
      this.eventsHeard.push(heard);
      if (this.eventsHeard.length > 80) this.eventsHeard.shift();
      $("#resonance-trace").innerHTML = `<span>${event.rest ? "Constitutional rest" : sentence(event.voice)}</span><p>${event.rest ? "Silence holds the relation open." : `${event.label} · ${event.provenance}`}</p>`;
      $("#resonance-instrument").style.setProperty("--resonant-energy", event.rest ? ".15" : ".85");
      if (this.eventsHeard.length % 8 === 0) this.renderAudit();
    }

    renderScore() {
      $("#score-signature").textContent = `${this.score.signature} / ${this.score.tempo} BPM`;
      $("#score-measures").innerHTML = this.score.events.slice(0, 32).map((event) => `<i class="${event.rest ? "is-rest" : ""}" style="--measure:${event.beats};--voice:${["constitution", "relation", "inquiry", "memory", "threshold", "breath"].indexOf(event.voice)}" title="${event.label}: ${event.provenance}"></i>`).join("");
    }

    renderProvenance() {
      $("#voice-provenance").textContent = `Score ${this.score.signature} is a reproducible interpretation of ${this.state.graph.meta.revision}. Reloading unchanged data produces the same sequence.`;
      $("#voice-sources").innerHTML = this.score.sources.map(({ voice, source, label }) => `<div><span>${sentence(voice)}</span><b>${label}</b><small>${source}</small></div>`).join("");
    }

    audit() {
      const heard = this.eventsHeard;
      const audible = heard.filter(({ rest }) => !rest);
      const represented = new Set(audible.map(({ voice }) => voice)).size;
      const rests = heard.filter(({ rest }) => rest).length;
      const traceable = audible.filter(({ provenance }) => provenance).length;
      return [
        { label: "Range", value: `${represented} / 6 voices`, state: represented >= 4 ? "coherent" : "forming" },
        { label: "Silence", value: heard.length ? `${Math.round(rests / heard.length * 100)}% of events` : "Designed into score", state: rests || !heard.length ? "preserved" : "review" },
        { label: "Traceability", value: audible.length ? `${Math.round(traceable / audible.length * 100)}%` : "Awaiting listening", state: traceable === audible.length ? "intact" : "review" },
        { label: "Repetition", value: this.score.events.length >= 32 ? "Long-form cycle" : "Narrow cycle", state: this.score.events.length >= 32 ? "bounded" : "review" }
      ];
    }

    renderAudit() {
      const findings = this.audit();
      const review = findings.filter(({ state }) => state === "review");
      $("#audit-title").textContent = review.length ? "A revision may be worth proposing" : "The voice remains within its constitution";
      $("#audit-summary").textContent = review.length ? `${review.map(({ label }) => label).join(" and ")} have crossed the grammar's review threshold. No change has been made.` : "Current range, rests, provenance, and recurrence remain accountable to the sonic grammar.";
      $("#audit-findings").innerHTML = findings.map(({ label, value, state }) => `<div><span>${label}</span><b>${value}</b><i>${sentence(state)}</i></div>`).join("");
    }

    resize() {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = this.canvas.clientWidth * ratio;
      this.canvas.height = this.canvas.clientHeight * ratio;
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    draw() {
      const width = this.canvas.clientWidth;
      const height = this.canvas.clientHeight;
      const context = this.context;
      context.clearRect(0, 0, width, height);
      const energy = this.started && !this.paused ? .8 : .18;
      this.phase += .0025 * energy;
      context.lineWidth = .6;
      for (let ring = 0; ring < 9; ring += 1) {
        const radius = 70 + ring * Math.min(width, height) * .055 + Math.sin(this.phase * (ring + 1)) * 8;
        context.beginPath();
        context.arc(width * .42, height * .54, radius, 0, Math.PI * 2);
        context.strokeStyle = `rgba(${ring % 2 ? "147,185,187" : "203,183,122"},${.025 + energy * .018})`;
        context.stroke();
      }
      requestAnimationFrame(() => this.draw());
    }
  }

  const awaken = async (state) => {
    try {
      const response = await fetch("resonance/grammar.json");
      if (!response.ok) throw new Error("sonic grammar unavailable");
      new ResonantChamber(state, await response.json());
    } catch (error) {
      console.error(error);
      $("#resonance-state").textContent = "The grammar remains silent.";
      $("#resonance-declaration").textContent = "Its constitutional voice could not be resolved from the archive.";
      $("#listen-control").disabled = true;
    }
  };

  const RUNTIME = "https://runtime.rootlogos.com";

  window.addEventListener("rootlogos:ready", ({ detail }) => awaken(detail), { once: true });
})();
