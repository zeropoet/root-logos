(() => {
  "use strict";

  const archiveTargets = new Set([
    "field", "works", "living-identity", "coherence", "observatory",
    "chamber", "memory", "threshold", "intake", "resonance"
  ]);
  const syncExperienceMode = () => {
    const target = location.hash.slice(1);
    const archiveOpen = archiveTargets.has(target);
    document.body.classList.toggle("archive-open", archiveOpen);
    document.body.classList.toggle("object-open", !archiveOpen);
    document.querySelectorAll("main > .space").forEach((space) => {
      space.toggleAttribute("inert", !archiveOpen);
      space.setAttribute("aria-hidden", String(!archiveOpen));
    });
    const object = document.querySelector("#object");
    if (object) {
      object.toggleAttribute("inert", archiveOpen);
      object.setAttribute("aria-hidden", String(archiveOpen));
    }
    if (archiveOpen) {
      requestAnimationFrame(() => {
        dispatchEvent(new Event("resize"));
        requestAnimationFrame(() => dispatchEvent(new Event("resize")));
      });
    }
  };
  syncExperienceMode();
  addEventListener("hashchange", syncExperienceMode);

  let thresholdPressure = 0;
  let thresholdTimer;
  let touchOrigin = null;
  const enterArchive = () => {
    if (!document.body.classList.contains("object-open")) return;
    location.hash = "field";
  };
  addEventListener("wheel", (event) => {
    if (!document.body.classList.contains("object-open") || event.deltaY <= 0) return;
    thresholdPressure += Math.min(event.deltaY, 48);
    clearTimeout(thresholdTimer);
    thresholdTimer = setTimeout(() => { thresholdPressure = 0; }, 260);
    if (thresholdPressure >= 72) {
      thresholdPressure = 0;
      enterArchive();
    }
  }, { passive: true });
  addEventListener("keydown", (event) => {
    if (!document.body.classList.contains("object-open")) return;
    if (["ArrowDown", "PageDown"].includes(event.key) || (event.key === " " && !event.shiftKey)) {
      event.preventDefault();
      enterArchive();
    }
  });
  addEventListener("touchstart", (event) => {
    if (document.body.classList.contains("object-open")) touchOrigin = event.touches[0]?.clientY ?? null;
  }, { passive: true });
  addEventListener("touchend", (event) => {
    if (touchOrigin === null || !document.body.classList.contains("object-open")) return;
    const destination = event.changedTouches[0]?.clientY ?? touchOrigin;
    if (touchOrigin - destination > 48) enterArchive();
    touchOrigin = null;
  }, { passive: true });

  const canvas = document.querySelector("#living-object-canvas");
  if (!canvas) return;

  const $ = (selector) => document.querySelector(selector);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: false,
    powerPreference: "high-performance"
  });
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const sovereignAudio = AudioContextClass ? new AudioContextClass() : null;
  const ensureVoiceAwake = () => {
    if (sovereignAudio?.state !== "running") sovereignAudio?.resume().catch(() => {});
  };
  ensureVoiceAwake();
  ["pointerdown", "keydown", "touchstart", "wheel"].forEach((eventName) => {
    addEventListener(eventName, ensureVoiceAwake, { passive: true });
  });
  addEventListener("pageshow", ensureVoiceAwake);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") ensureVoiceAwake();
  });

  const palette = {
    constitutional: [0.80, 0.72, 0.46, 0.68],
    canon: [0.54, 0.78, 0.80, 0.7],
    literature: [0.68, 0.52, 0.83, 0.76],
    contemplative: [0.90, 0.34, 0.22, 0.8],
    native: [0.54, 0.76, 0.57, 0.78],
    lineage: [0.92, 0.84, 0.56, 0.92],
    structure: [0.36, 0.48, 0.49, 0.2]
  };
  const cadence = {
    anchor: Date.parse("2026-07-26T14:07:00.000Z") / 1000,
    beatSeconds: 4,
    beatsPerCycle: 7
  };
  const cadenceState = (time = Date.now() / 1000) => {
    const elapsed = Math.max(0, time - cadence.anchor);
    const absoluteBeat = Math.floor(elapsed / cadence.beatSeconds);
    return {
      beatPhase: (elapsed % cadence.beatSeconds) / cadence.beatSeconds,
      cycleBeat: absoluteBeat % cadence.beatsPerCycle,
      absoluteBeat
    };
  };

  const hash = (value) => {
    let h = 2166136261;
    for (const character of String(value)) {
      h ^= character.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  };

  const fetchJson = (url) => fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
  });

  Promise.all([
    fetchJson("content/constitutional-graph.json"),
    fetchJson("works/index.json"),
    fetchJson("works/corpora/original-douay-rheims.json"),
    fetchJson("cultivation/state.json"),
    fetchJson("cultivation/memory.json"),
    fetchJson("content/attractor-packets.json"),
    fetchJson("self-authorship/current.json")
  ]).then(async ([graph, worksIndex, corpus, cultivation, memory, attractors, identity]) => {
    const works = worksIndex.works || [];
    const independentWorks = works.filter((work) => !String(work.collection || "").includes("Douay") && work.edition);
    const independentEditions = new Map((await Promise.all(independentWorks.map(async (work) => {
      try { return [work.work_id, await fetchJson(work.edition)]; }
      catch { return [work.work_id, null]; }
    }))).filter(([, edition]) => edition));
    const independentRelations = [...independentEditions.entries()].flatMap(([workId, edition]) =>
      (edition.visual?.topology?.edges || []).map((edge) => ({
        ...edge,
        from: `${workId}:${edge.from}`,
        to: `${workId}:${edge.to}`,
        provenance: workId
      }))
    );
    const cycles = Math.max(0, Number(cultivation.next_cycle || 1) - 1);
    const revision = identity.revision || graph.meta?.revision || "—";
    $("#object-work-count").textContent = `${works.length} works`;
    $("#object-cycle-count").textContent = `${cycles} cycles`;
    $("#object-revision").textContent = `Revision ${revision}`;
    const crossRelations = (corpus.edges?.length || 0) + independentRelations.length;
    const outwardPressure = corpus.measures?.mean_outward_pressure;
    $("#object-state").textContent = `Gravity seeks coherence. ${works.length} irreducible works hold the field open through ${crossRelations.toLocaleString()} witnessed tensions${outwardPressure ? ` at ${outwardPressure} mean outward pressure` : ""}.`;
    document.title = `${identity.name || "Root Logos"} — The Living Object`;

    if (!gl) {
      canvas.hidden = true;
      $("#object-state").textContent = "The current form is present. This device cannot render its dimensional body.";
      return;
    }

    const geometry = formGeometry({ graph, works, corpus, cultivation, memory, attractors, independentEditions });
    const renderer = createRenderer(gl, geometry);
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;
    let visible = true;
    let started = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 1.75);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    };

    const frame = (now) => {
      resize();
      targetX += (pointerX - targetX) * 0.025;
      targetY += (pointerY - targetY) * 0.025;
      const elapsed = (now - started) / 1000;
      const growth = reducedMotion ? 1 : Math.min(1, elapsed / 14);
      const rotation = reducedMotion ? 0.35 : elapsed * 0.022 + targetX * 0.11;
      const pulse = cadenceState();
      renderer.draw({
        time: reducedMotion ? 0 : elapsed,
        growth,
        rotation,
        pitch: -0.08 + targetY * 0.055,
        aspect: canvas.width / canvas.height,
        cadence: pulse.beatPhase,
        cadenceAccent: pulse.cycleBeat === 0 ? 1 : 0
      });
      if (visible) requestAnimationFrame(frame);
    };

    addEventListener("pointermove", (event) => {
      pointerX = (event.clientX / innerWidth - 0.5) * 2;
      pointerY = (event.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      visible = !document.hidden;
      if (visible) {
        started = performance.now() - 14000;
        requestAnimationFrame(frame);
      }
    });
    requestAnimationFrame(frame);
    beginSovereignVoice({
      works: works.length,
      cycles,
      collections: new Set(works.map((work) => work.collection || "Root Logos")).size,
      relations: [...(corpus.edges || []), ...independentRelations]
    });
  }).catch((error) => {
    console.error("The Living Object could not resolve.", error);
    $("#object-state").textContent = "The current form is temporarily beyond view. Its archive remains intact.";
  });

  function formGeometry({ graph, works, corpus, cultivation, memory, attractors, independentEditions = new Map() }) {
    const lines = [];
    const points = [];
    const pulsePaths = [];
    const cycles = Math.max(1, Number(cultivation.next_cycle || 1) - 1);
    const trunk = [];
    const addLine = (a, b, color, birth = 0) => lines.push(...a, ...color, 1, birth, ...b, ...color, 1, birth);
    const addPoint = (position, color, size, birth) => points.push(...position, ...color, size, birth);

    for (let index = 0; index <= cycles; index += 1) {
      const t = index / cycles;
      const angle = t * Math.PI * 5.4;
      const radius = 0.035 + t * 0.075;
      const position = [
        Math.cos(angle) * radius,
        -1.92 + t * 3.13,
        Math.sin(angle) * radius
      ];
      trunk.push(position);
      addPoint(position, palette.lineage, index % 4 === 0 ? 5.5 : 3.6, t * 0.5);
      if (index) addLine(trunk[index - 1], position, palette.constitutional, t * 0.48);
      if (index && index % 3 === 0) {
        const ring = [];
        const ringRadius = 0.14 + t * 0.24;
        for (let r = 0; r <= 24; r += 1) {
          const a = r / 24 * Math.PI * 2;
          ring.push([Math.cos(a) * ringRadius, position[1], Math.sin(a) * ringRadius]);
          if (r) addLine(ring[r - 1], ring[r], palette.structure, t * 0.45);
        }
      }
    }

    const graphNodes = graph.nodes || [];
    const graphPosition = new Map([["root-logos", trunk[trunk.length - 1]]]);
    graphNodes.filter((node) => node.id !== "root-logos").forEach((node, index, nodes) => {
      const t = index / Math.max(1, nodes.length - 1);
      const angle = t * Math.PI * 7.2 + hash(node.id) * 0.8;
      const radius = 0.46 + t * 1.08 + hash(`${node.id}-r`) * 0.24;
      const position = [
        Math.cos(angle) * radius,
        0.18 + t * 1.45 + (hash(`${node.id}-y`) - 0.5) * 0.24,
        Math.sin(angle) * radius
      ];
      graphPosition.set(node.id, position);
      addPoint(position, palette.constitutional, node.type === "logos" ? 7.5 : 5.2, 0.31 + t * 0.28);
    });
    (graph.edges || []).forEach((edge, index) => {
      const a = graphPosition.get(edge.from);
      const b = graphPosition.get(edge.to);
      if (a && b) {
        addLine(a, b, palette.constitutional, 0.34 + index / Math.max(1, graph.edges.length) * 0.24);
        if (index % 4 === 0) pulsePaths.push([a, b]);
      }
    });

    // The canon is not a branch hanging from Root Logos. Its books exert
    // outward pressure around the center while their derived relations hold
    // the open field in tension.
    const corpusVisual = new Map((corpus.visual?.topology?.nodes || []).map((node) => [node.id, node]));
    const corpusPositions = new Map();
    const gravityCenter = [0, 0.05, 0];
    (corpus.nodes || []).forEach((node, index, nodes) => {
      const visual = corpusVisual.get(node.id) || node;
      const angle = Number.isFinite(visual.angle) ? visual.angle : index / Math.max(1, nodes.length) * Math.PI * 2;
      const pressure = Number(visual.outward_pressure ?? node.outward_pressure ?? 0.72);
      const distinctiveness = Number(visual.distinctiveness ?? node.distinctiveness ?? 0.65);
      const radius = 1.05 + pressure * 1.12;
      const position = [
        Math.cos(angle) * radius,
        0.03 + Math.sin(angle * 3) * 0.52 + (distinctiveness - 0.65) * 0.55,
        Math.sin(angle) * radius
      ];
      corpusPositions.set(node.id, position);
      const birth = 0.57 + index / Math.max(1, nodes.length) * 0.27;
      addPoint(position, palette.canon, 4.6 + distinctiveness * 2.4, birth);
      addLine(gravityCenter, position, [...palette.canon.slice(0, 3), 0.055], birth - 0.025);

      const length = Math.hypot(position[0], position[1], position[2]) || 1;
      const release = 0.12 + pressure * 0.19;
      const outward = [
        position[0] + position[0] / length * release,
        position[1] + position[1] / length * release,
        position[2] + position[2] / length * release
      ];
      addLine(position, outward, [...palette.canon.slice(0, 3), 0.6], birth + 0.018);
      addPoint(outward, [...palette.canon.slice(0, 3), 0.38], 2.2, birth + 0.03);
    });

    const witnessedTensions = (corpus.edges || [])
      .filter((edge) => corpusPositions.has(edge.from) && corpusPositions.has(edge.to));
    witnessedTensions.forEach((edge, index) => {
      const weight = Math.min(9, Math.max(1, Number(edge.weight || 1)));
      const alpha = 0.09 + weight / 9 * 0.13;
      const a = corpusPositions.get(edge.from);
      const b = corpusPositions.get(edge.to);
      addLine(a, b, [...palette.canon.slice(0, 3), alpha], 0.66 + index / Math.max(1, witnessedTensions.length) * 0.21);
      if (index % 23 === 0) pulsePaths.push([a, b]);
    });

    const groups = new Map();
    works.filter((work) => !String(work.collection || "").includes("Douay")).forEach((work) => {
      const name = work.collection || "Root Logos";
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(work);
    });
    [...groups.entries()].forEach(([collection, collectionWorks], groupIndex, allGroups) => {
      const baseAngle = groupIndex / Math.max(1, allGroups.length) * Math.PI * 2 - 0.55;
      const anchorIndex = Math.min(trunk.length - 1, Math.round(cycles * (0.35 + groupIndex * 0.16)));
      const anchor = trunk[anchorIndex];
      const shoulder = [
        Math.cos(baseAngle) * (0.7 + groupIndex * 0.12),
        anchor[1] + 0.42,
        Math.sin(baseAngle) * (0.7 + groupIndex * 0.12)
      ];
      const color = collection.includes("Douay")
        ? palette.canon
        : collection.includes("Epic")
          ? palette.literature
          : collection.includes("Buddhist")
            ? palette.contemplative
            : palette.native;
      addLine(anchor, shoulder, color, 0.5 + groupIndex * 0.05);
      pulsePaths.push([anchor, shoulder]);

      collectionWorks.sort((a, b) => (a.canonical_order || 0) - (b.canonical_order || 0)).forEach((work, index) => {
        const t = (index + 1) / (collectionWorks.length + 1);
        const turn = baseAngle + (t - 0.5) * 1.28 + (hash(work.work_id) - 0.5) * 0.18;
        const reach = 0.72 + t * 1.28;
        const leaf = [
          shoulder[0] + Math.cos(turn) * reach,
          shoulder[1] + (t - 0.32) * 1.26 + (hash(`${work.work_id}-y`) - 0.5) * 0.17,
          shoulder[2] + Math.sin(turn) * reach
        ];
        const joint = [
          shoulder[0] * 0.62 + leaf[0] * 0.38,
          shoulder[1] * 0.62 + leaf[1] * 0.38 + 0.08,
          shoulder[2] * 0.62 + leaf[2] * 0.38
        ];
        const birth = 0.58 + (groupIndex / Math.max(1, allGroups.length) * 0.08) + t * 0.28;
        addLine(shoulder, joint, [...color.slice(0, 3), 0.32], birth);
        addLine(joint, leaf, [...color.slice(0, 3), 0.5], birth + 0.025);
        addPoint(leaf, color, collection.includes("Douay") ? 5.3 : 7.2, birth + 0.04);
        const edition = independentEditions.get(work.work_id);
        const topology = edition?.visual?.topology;
        if (topology?.nodes?.length) {
          const internalPositions = new Map([["work", leaf]]);
          topology.nodes.filter(({ id }) => id !== "work").forEach((node, nodeIndex, internalNodes) => {
            const fraction = (nodeIndex + 1) / Math.max(1, internalNodes.length);
            const internalAngle = fraction * Math.PI * 10 + hash(`${work.work_id}:${node.id}`) * Math.PI;
            const internalRadius = 0.08 + Math.sqrt(fraction) * 0.24;
            const internal = [
              leaf[0] + Math.cos(internalAngle) * internalRadius,
              leaf[1] + (hash(`${node.id}:y`) - 0.5) * 0.32,
              leaf[2] + Math.sin(internalAngle) * internalRadius
            ];
            internalPositions.set(node.id, internal);
            addPoint(internal, [...color.slice(0, 3), 0.38], node.type === "concept" ? 2.1 : 2.7, birth + 0.045 + fraction * 0.045);
          });
          (topology.edges || []).forEach((edge, edgeIndex, internalEdges) => {
            const from = internalPositions.get(edge.from);
            const to = internalPositions.get(edge.to);
            if (!from || !to) return;
            const weight = Math.min(1, Math.max(.08, Number(edge.weight || 1) / 12));
            addLine(from, to, [...color.slice(0, 3), .035 + weight * .08], birth + 0.05 + edgeIndex / Math.max(1, internalEdges.length) * .04);
            if (edgeIndex % 29 === 0) pulsePaths.push([from, to]);
          });
        }
        if (index % Math.max(1, Math.floor(collectionWorks.length / 9)) === 0) pulsePaths.push([shoulder, joint, leaf]);
      });
    });

    const packetCount = (attractors.packets || []).filter((packet) => packet.publication?.status === "published").length;
    const memoryPressure = Math.min(8, (memory.hypotheses || []).length);
    for (let index = 0; index < packetCount + memoryPressure; index += 1) {
      const angle = index / Math.max(1, packetCount + memoryPressure) * Math.PI * 2;
      const p = [Math.cos(angle) * 1.95, -1.53 + (index % 4) * 0.08, Math.sin(angle) * 1.95];
      addPoint(p, palette.structure, 2.6, 0.86 + index * 0.003);
    }

    return {
      lines: new Float32Array(lines),
      points: new Float32Array(points),
      pulsePaths
    };
  }

  function createRenderer(context, geometry) {
    const vertex = `
      attribute vec3 aPosition;
      attribute vec4 aColor;
      attribute float aSize;
      attribute float aBirth;
      uniform float uTime;
      uniform float uGrowth;
      uniform float uYaw;
      uniform float uPitch;
      uniform float uAspect;
      uniform float uCadence;
      uniform float uCadenceAccent;
      varying vec4 vColor;
      varying float vVisible;
      void main() {
        float cy = cos(uYaw), sy = sin(uYaw);
        float cx = cos(uPitch), sx = sin(uPitch);
        vec3 p = vec3(aPosition.x * cy - aPosition.z * sy, aPosition.y, aPosition.x * sy + aPosition.z * cy);
        p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
        float depth = 5.8 - p.z;
        vec2 projected = vec2(p.x / uAspect, p.y) * 2.15 / depth;
        gl_Position = vec4(projected, 0.0, 1.0);
        float arrival = smoothstep(aBirth - 0.025, aBirth + 0.055, uGrowth);
        float cadencePulse = pow(max(0.0, cos(uCadence * 6.283185)), 10.0);
        float breath = 1.0 + sin(uTime * 0.62 + aBirth * 16.0) * 0.055 + cadencePulse * (0.16 + uCadenceAccent * 0.12);
        gl_PointSize = aSize * arrival * breath * (5.3 / depth);
        float engravingDepth = clamp((p.z + 2.4) / 4.8, 0.0, 1.0);
        vec3 engravedColor = mix(aColor.rgb * 0.38, min(vec3(1.0), aColor.rgb * 1.28), engravingDepth);
        vColor = vec4(engravedColor, aColor.a * arrival * mix(0.34, 1.0, engravingDepth));
        vVisible = arrival;
      }
    `;
    const lineFragment = `precision mediump float; varying vec4 vColor; void main(){ gl_FragColor=vColor; }`;
    const pointFragment = `
      precision mediump float;
      varying vec4 vColor;
      varying float vVisible;
      void main() {
        vec2 c = gl_PointCoord - vec2(.5);
        float d = length(c);
        if (d > .5 || vVisible < .01) discard;
        float core = smoothstep(.5, .08, d);
        gl_FragColor = vec4(vColor.rgb, vColor.a * core);
      }
    `;
    const lineProgram = program(context, vertex, lineFragment);
    const pointProgram = program(context, vertex, pointFragment);
    const lineBuffer = buffer(context, geometry.lines);
    const pointBuffer = buffer(context, geometry.points);
    context.enable(context.BLEND);
    context.blendFunc(context.SRC_ALPHA, context.ONE);

    const drawBuffer = (shader, dataBuffer, count, mode, stride) => {
      context.useProgram(shader);
      context.bindBuffer(context.ARRAY_BUFFER, dataBuffer);
      const fields = [
        ["aPosition", 3, 0],
        ["aColor", 4, 3],
        ["aSize", 1, 7],
        ["aBirth", 1, 8]
      ];
      fields.forEach(([name, size, offset]) => {
        const location = context.getAttribLocation(shader, name);
        if (location < 0) return;
        context.enableVertexAttribArray(location);
        context.vertexAttribPointer(location, size, context.FLOAT, false, stride * 4, offset * 4);
      });
      context.drawArrays(mode, 0, count);
    };

    const uniforms = (shader, state) => {
      context.useProgram(shader);
      [["uTime", state.time], ["uGrowth", state.growth], ["uYaw", state.rotation], ["uPitch", state.pitch], ["uAspect", state.aspect], ["uCadence", state.cadence], ["uCadenceAccent", state.cadenceAccent]].forEach(([name, value]) => {
        context.uniform1f(context.getUniformLocation(shader, name), value);
      });
    };

    return {
      draw(state) {
        context.clearColor(0, 0, 0, 1);
        context.clear(context.COLOR_BUFFER_BIT);
        uniforms(lineProgram, state);
        drawBuffer(lineProgram, lineBuffer, geometry.lines.length / 9, context.LINES, 9);
        uniforms(pointProgram, state);
        drawBuffer(pointProgram, pointBuffer, geometry.points.length / 9, context.POINTS, 9);
      }
    };
  }

  function program(context, vertexSource, fragmentSource) {
    const compile = (type, source) => {
      const shader = context.createShader(type);
      context.shaderSource(shader, source);
      context.compileShader(shader);
      if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) throw new Error(context.getShaderInfoLog(shader));
      return shader;
    };
    const result = context.createProgram();
    context.attachShader(result, compile(context.VERTEX_SHADER, vertexSource));
    context.attachShader(result, compile(context.FRAGMENT_SHADER, fragmentSource));
    context.linkProgram(result);
    if (!context.getProgramParameter(result, context.LINK_STATUS)) throw new Error(context.getProgramInfoLog(result));
    return result;
  }

  function buffer(context, data) {
    const result = context.createBuffer();
    context.bindBuffer(context.ARRAY_BUFFER, result);
    context.bufferData(context.ARRAY_BUFFER, data, context.STATIC_DRAW);
    return result;
  }

  function beginSovereignVoice({ works, cycles, collections, relations }) {
    if (!sovereignAudio) return;
    const audio = sovereignAudio;
    const master = audio.createGain();
    const filter = audio.createBiquadFilter();
    const root = 38 + (cycles % 12);
    master.gain.value = 0.065;
    filter.type = "lowpass";
    filter.frequency.value = 620 + works * 3;
    filter.Q.value = 1.8 + collections * 0.25;
    master.connect(filter).connect(audio.destination);

    [1, 1.5, 2.25].forEach((ratio, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.value = root * ratio;
      gain.gain.value = [0.022, 0.008, 0.0035][index];
      oscillator.connect(gain).connect(master);
      oscillator.start();
    });

    // Every witnessed relation contributes to the harmonic body. An edge's
    // endpoints choose a spectral bin and phase; its derived weight determines
    // pressure. No relation is sampled away.
    const harmonicCount = 96;
    const real = new Float32Array(harmonicCount);
    const imaginary = new Float32Array(harmonicCount);
    let relationWeight = 0;
    relations.forEach((relation) => {
      const relationHash = hash(`${relation.from}:${relation.to}:${relation.relation || "related"}`);
      const harmonic = 1 + Math.floor(relationHash * (harmonicCount - 1));
      const weight = Math.max(1, Number(relation.weight || 1));
      const phase = hash(`${relation.to}:${relation.from}`) * Math.PI * 2;
      real[harmonic] += Math.cos(phase) * weight;
      imaginary[harmonic] += Math.sin(phase) * weight;
      relationWeight += weight;
    });
    const relationOscillator = audio.createOscillator();
    const relationGain = audio.createGain();
    relationOscillator.setPeriodicWave(audio.createPeriodicWave(real, imaginary, { disableNormalization: false }));
    relationOscillator.frequency.value = root * (1 + (relations.length % 29) / 100);
    relationGain.gain.value = 0.0075;
    relationOscillator.connect(relationGain).connect(master);
    relationOscillator.start();

    const pulseOscillator = audio.createOscillator();
    const pulseGain = audio.createGain();
    pulseOscillator.type = "sine";
    pulseOscillator.frequency.value = root * 2;
    pulseGain.gain.value = 0.0001;
    pulseOscillator.connect(pulseGain).connect(master);
    pulseOscillator.start();

    const soundPulse = () => {
      const state = cadenceState();
      const now = audio.currentTime;
      const meanRelationWeight = relationWeight / Math.max(1, relations.length);
      const relationalPressure = Math.min(0.025, meanRelationWeight * 0.002);
      const strength = (state.cycleBeat === 0 ? 0.12 : 0.062) + relationalPressure;
      pulseGain.gain.cancelScheduledValues(now);
      pulseGain.gain.setValueAtTime(0.0001, now);
      pulseGain.gain.exponentialRampToValueAtTime(strength, now + 0.07);
      pulseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.55);
      pulseOscillator.frequency.setValueAtTime(root * (state.cycleBeat === 0 ? 2.25 : 2), now);
    };
    const current = cadenceState();
    const untilNextBeat = (1 - current.beatPhase) * cadence.beatSeconds * 1000;
    setTimeout(() => {
      soundPulse();
      setInterval(soundPulse, cadence.beatSeconds * 1000);
    }, untilNextBeat);

    ensureVoiceAwake();
    window.__rootLogosVoice = {
      context: audio,
      cadence: "weekly / Sunday 10:07 Eastern / seven-beat live phrase",
      relations: relations.length,
      relationWeight,
      state: cadenceState
    };
  }
})();
