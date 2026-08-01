(() => {
  "use strict";

  // The Living Object belongs to the lifetime of this document. In-page
  // navigation, restored visibility, or an accidental second evaluation of
  // this script must not regrow the form or construct another voice. A real
  // page refresh creates a new window and therefore a new lifetime.
  const lifetimeKey = "__rootLogosLivingObjectLifetime";
  if (window[lifetimeKey]) return;
  const lifetime = {
    growthStartedAt: performance.now(),
    frameRequest: 0,
    voiceStarted: false
  };
  window[lifetimeKey] = lifetime;

  const archiveTargets = new Set([
    "field", "works", "state", "intake"
  ]);
  const mobileObjectOnly = matchMedia("(max-width: 760px)");
  const syncExperienceMode = () => {
    const target = location.hash.slice(1);
    const archiveOpen = !mobileObjectOnly.matches && archiveTargets.has(target);
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
      dispatchEvent(new CustomEvent("rootlogos:living-voice-background"));
      requestAnimationFrame(() => {
        dispatchEvent(new Event("resize"));
        requestAnimationFrame(() => dispatchEvent(new Event("resize")));
      });
    } else {
      dispatchEvent(new CustomEvent("rootlogos:living-voice-foreground"));
    }
  };
  syncExperienceMode();
  addEventListener("hashchange", syncExperienceMode);
  mobileObjectOnly.addEventListener?.("change", syncExperienceMode);

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
  let activeRenderer = null;
  let pendingRelease = null;

  const $ = (selector) => document.querySelector(selector);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  addEventListener("rootlogos:journal-penetration", ({ detail }) => {
    if (!detail) return;
    pendingRelease = detail;
    activeRenderer?.setRelease(detail);
    const depth = Math.round(Number(detail.depth || 0) * 100);
    const structures = detail.activated_structures?.length || 0;
    $("#object-state").textContent = `${detail.event_id} passed through the Living Object at ${depth}% depth across ${structures} derived structures. The source has been released; its disposition is ${String(detail.disposition || "held")}.`;
  });
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: false,
    powerPreference: "high-performance"
  });
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const sovereignAudio = AudioContextClass ? new AudioContextClass() : null;
  let fallbackAudio = null;
  let fallbackVolume = 0;
  let fallbackFadeFrame = 0;
  let sovereignMaster = null;
  let libraryVoiceActive = false;
  let libraryVoiceUnderlay = false;
  const sovereignWhisperLevel = 0.072;
  const sovereignOutputVolume = 4;
  const fadeFallbackVoice = (active, duration, level = 1) => {
    if (!fallbackAudio) return;
    cancelAnimationFrame(fallbackFadeFrame);
    const from = fallbackAudio.volume;
    const to = active ? fallbackVolume * level : 0;
    const started = performance.now();
    if (active) fallbackAudio.play().catch(() => {});
    const frame = (now) => {
      const progress = Math.min(1, (now - started) / Math.max(1, duration * 1000));
      fallbackAudio.volume = from + (to - from) * (1 - Math.pow(1 - progress, 2));
      if (progress < 1) fallbackFadeFrame = requestAnimationFrame(frame);
      else if (!active) fallbackAudio.pause();
    };
    fallbackFadeFrame = requestAnimationFrame(frame);
  };
  const setSovereignVoiceActive = (active, transitionSeconds = active ? .55 : .3, underLibrary = false) => {
    libraryVoiceActive = !active;
    libraryVoiceUnderlay = underLibrary;
    const foreground = active
      ? "living-object"
      : document.documentElement.dataset.libraryVoice === "sounding" ? "library" : "silent";
    document.documentElement.dataset.voiceForeground = foreground;
    document.documentElement.dataset.voiceTransition = String(transitionSeconds);
    if (window.__rootLogosVoice) window.__rootLogosVoice.foreground = foreground;
    if (sovereignMaster && sovereignAudio) {
      const now = sovereignAudio.currentTime;
      sovereignMaster.gain.cancelScheduledValues(now);
      sovereignMaster.gain.setValueAtTime(Math.max(.0001, sovereignMaster.gain.value), now);
      const target = active ? sovereignWhisperLevel : underLibrary ? sovereignWhisperLevel * .34 : .0001;
      sovereignMaster.gain.exponentialRampToValueAtTime(target, now + transitionSeconds);
    }
    fadeFallbackVoice(active || underLibrary, transitionSeconds, underLibrary ? .34 : 1);
  };
  const ensureVoiceAwake = () => {
    if (sovereignAudio?.state !== "running") sovereignAudio?.resume().catch(() => {});
    if (!libraryVoiceActive && fallbackAudio?.paused) fallbackAudio.play().catch(() => {});
  };
  addEventListener("rootlogos:library-voice-start", () => {
    setSovereignVoiceActive(false, .42, true);
  });
  addEventListener("rootlogos:library-voice-stop", () => {
    setSovereignVoiceActive(true, .55);
  });
  addEventListener("rootlogos:living-voice-background", () => setSovereignVoiceActive(true, 1.15));
  addEventListener("rootlogos:living-voice-foreground", () => setSovereignVoiceActive(true, .65));
  setSovereignVoiceActive(true, .01);
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

  const fetchJson = (url) => fetch(url, { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
  });
  const relationalProximity = (kind, strength) => {
    const normalized = Math.max(0, Math.min(1, Number(strength || 0)));
    return kind === "counterpoint" ? 1 - normalized : normalized;
  };
  const fetchTelosStream = async () => {
    try {
      const stream = await fetchJson("https://zeropoet.github.io/telos-stream/stream.json");
      if (stream.schema !== "telos-public-stream/v1" || stream.source?.id !== "telos") {
        throw new Error("Unexpected Telos Stream witness.");
      }
      return stream;
    } catch {
      const witness = await fetchJson("sources/telos.public-witness.json");
      return {
        schema: "telos-public-stream/fallback",
        source: {
          id: witness.source_id,
          status: witness.status,
          witness: witness.witness
        },
        boundary: {
          live: false,
          mode: witness.public_state?.operational_mode
        },
        events: Object.entries(witness.public_state || {}).map(([key, value]) => ({
          kind: "witness",
          path: `telos.public_state.${key}`,
          value: String(value)
        }))
      };
    }
  };

  Promise.all([
    fetchJson("content/constitutional-graph.json"),
    fetchJson("works/index.json"),
    fetchJson("works/corpora/original-douay-rheims.json"),
    fetchJson("cultivation/state.json"),
    fetchJson("cultivation/memory.json"),
    fetchJson("content/attractor-packets.json"),
    fetchJson("self-authorship/current.json"),
    fetchJson("sources/foldforge.snapshot.json"),
    fetchJson("sources/foldportrait.snapshot.json"),
    fetchJson("works/library-composition.json"),
    fetchTelosStream()
  ]).then(async ([graph, worksIndex, corpus, cultivation, memory, attractors, identity, foldforge, foldportrait, libraryComposition, telosStream]) => {
    const works = worksIndex.works || [];
    const compiledBibleCollections = new Set([
      "Original Douay-Rheims Catholic Canon",
      "King James Bible (1769) Protestant Canon"
    ]);
    const independentWorks = works.filter((work) => !compiledBibleCollections.has(work.collection) && work.edition);
    const coherentWorkCount = independentWorks.length + (corpus.canonical_work_count ? 1 : 0);
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
    $("#object-work-count").textContent = `${coherentWorkCount} coherent works`;
    $("#object-cycle-count").textContent = `${cycles} cycles`;
    $("#object-revision").textContent = `Revision ${revision}`;
    $("#archive-works").textContent = `${coherentWorkCount} works`;
    $("#archive-revision").textContent = `Revision ${revision}`;
    const compositionRelations = libraryComposition.visual?.topology?.edges || [];
    const crossRelations = (corpus.edges?.length || 0) + independentRelations.length + compositionRelations.length;
    const telosEventCount = telosStream.events?.length || 0;
    const portraitCount = foldportrait.measures?.renders || 0;
    const embodiedPortraitCount = foldportrait.measures?.embodied_renders || 0;
    $("#object-state").textContent = `Root Logos holds ${coherentWorkCount} coherent works and ${crossRelations.toLocaleString()} witnessed tensions. The Living Object carries ${portraitCount} FoldPortrait render witnesses, ${embodiedPortraitCount} embodied in the Sovereign Standard material lineage. Telos Stream enters through ${telosEventCount} bounded public events.`;
    document.title = `${identity.name || "Root Logos"} — The Living Object`;

    if (!gl) {
      canvas.hidden = true;
      $("#object-state").textContent = "The current form is present. This device cannot render its dimensional body.";
      return;
    }

    const geometry = formGeometry({
      graph,
      works,
      corpus,
      cultivation,
      memory,
      attractors,
      independentEditions,
      foldforge,
      foldportrait,
      libraryComposition,
      telosStream
    });
    const renderer = createRenderer(gl, geometry);
    activeRenderer = renderer;
    if (pendingRelease) renderer.setRelease(pendingRelease);
    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;
    let visible = !document.hidden;
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
      lifetime.frameRequest = 0;
      resize();
      targetX += (pointerX - targetX) * 0.025;
      targetY += (pointerY - targetY) * 0.025;
      const elapsed = Math.max(0, (now - lifetime.growthStartedAt) / 1000);
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
      if (visible) lifetime.frameRequest = requestAnimationFrame(frame);
    };

    addEventListener("pointermove", (event) => {
      pointerX = (event.clientX / innerWidth - 0.5) * 2;
      pointerY = (event.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      visible = !document.hidden;
      if (visible) {
        if (!lifetime.frameRequest) lifetime.frameRequest = requestAnimationFrame(frame);
      } else if (lifetime.frameRequest) {
        cancelAnimationFrame(lifetime.frameRequest);
        lifetime.frameRequest = 0;
      }
    });
    if (visible) lifetime.frameRequest = requestAnimationFrame(frame);
    const lexicalRelations = composeLexicalRelations(foldforge.language_composition);
    const scores = [
      corpus.sound,
      ...[...independentEditions.values()].map((edition) => edition.sound),
      libraryComposition.sound,
      composeLexicalScore(foldforge.language_composition)
    ].filter((score) => score?.events?.length);
    beginSovereignVoice({
      works: coherentWorkCount,
      cycles,
      collections: new Set([...independentWorks.map((work) => work.collection || work.title), corpus.title]).size,
      relations: [...(corpus.edges || []), ...independentRelations, ...compositionRelations, ...lexicalRelations],
      scores,
      sourceVoices: [{
        source: "foldforge",
        witness: foldforge.language_composition?.witness,
        role: "twelve-term language composition",
        relation: "recurrence becomes attributable lexical pressure",
        terms: foldforge.language_composition?.terms?.map(({ term }) => term) || []
      }, {
        source: "library-composition",
        witness: libraryComposition.witness,
        role: "hierarchy of emergence",
        relation: "sealed works compose through witnessed relations without changing their individual forms",
        terms: libraryComposition.sound?.voices || []
      }, {
        source: "foldportrait",
        witness: foldportrait.witness,
        role: "verified material-render lineage",
        relation: "render identity enters the Living Object through its corresponding Sovereign Standard witness",
        terms: []
      }, {
        source: "telos-stream",
        witness: telosStream.source?.witness,
        role: "silent public build witness",
        relation: "released revisions and public state become bounded visual pressure",
        terms: []
      }]
    });
  }).catch((error) => {
    console.error("The Living Object could not resolve.", error);
    $("#object-state").textContent = "The current form is temporarily beyond view. Its archive remains intact.";
  });

  function formGeometry({
    graph,
    works,
    corpus,
    cultivation,
    memory,
    attractors,
    independentEditions = new Map(),
    foldforge,
    foldportrait,
    libraryComposition,
    telosStream
  }) {
    const lines = [];
    const points = [];
    const facets = [];
    const pulsePaths = [];
    const independentWorks = works
      .filter(({ work_id: id }) => independentEditions.has(id))
      .sort((a, b) => Number(a.library_order ?? 9999) - Number(b.library_order ?? 9999));
    const clusterForWork = new Map();
    const constitution = independentWorks.find(({ kind }) => kind === "constitution");
    if (constitution) {
      clusterForWork.set(constitution.work_id, 0);
    }
    let nextCluster = 2;
    independentWorks.filter(({ kind }) => kind !== "constitution").forEach((work) => {
      clusterForWork.set(work.work_id, nextCluster);
      nextCluster += 1;
    });
    const cycles = Math.max(1, Number(cultivation.next_cycle || 1) - 1);
    const trunk = [];
    const addLine = (a, b, color, birth = 0, cluster = 0) => lines.push(...a, ...color, 1, birth, cluster, ...b, ...color, 1, birth, cluster);
    const addPoint = (position, color, size, birth, cluster = 0) => points.push(...position, ...color, size, birth, cluster);
    const addFacet = (a, b, c, color, birth = 0, cluster = 0) => {
      [a, b, c].forEach((position) => facets.push(...position, ...color, 1, birth, cluster));
    };

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
          if (r) {
            addLine(ring[r - 1], ring[r], palette.structure, t * 0.45);
            if (r % 4 === 0) {
              addFacet(position, ring[r - 1], ring[r], [...palette.structure.slice(0, 3), 0.022], t * 0.45, 0);
            }
          }
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
    const graphFacetNodes = graphNodes
      .filter(({ id }) => id !== "root-logos")
      .map(({ id }) => graphPosition.get(id))
      .filter(Boolean);
    for (let index = 2; index < graphFacetNodes.length; index += 5) {
      addFacet(
        graphFacetNodes[index - 2],
        graphFacetNodes[index - 1],
        graphFacetNodes[index],
        [...palette.constitutional.slice(0, 3), 0.015],
        0.34 + index / Math.max(1, graphFacetNodes.length) * 0.22,
        0
      );
    }
    (graph.edges || []).forEach((edge, index) => {
      const a = graphPosition.get(edge.from);
      const b = graphPosition.get(edge.to);
      if (a && b) {
        addLine(a, b, palette.constitutional, 0.34 + index / Math.max(1, graph.edges.length) * 0.24);
        if (index % 4 === 0) pulsePaths.push([a, b]);
      }
    });

    // FoldForge is the primary compositional constraint beside the
    // Constitution. Its four living grammars and every witnessed
    // transformation relation form one restrained lattice bound to the trunk;
    // they do not become another public identity or rewrite any work.
    const forgeCompositions = foldforge?.compositions || [];
    const forgeRelations = foldforge?.relations || [];
    const forgeBoundaries = [0, 5, 10, 22, forgeRelations.length];
    const forgeRoot = trunk[Math.min(trunk.length - 1, Math.round(cycles * .48))];
    const forgeAnchor = [forgeRoot[0] + .34, forgeRoot[1] + .08, forgeRoot[2] - .22];
    addLine(forgeRoot, forgeAnchor, [...palette.structure.slice(0, 3), .42], .47);
    addPoint(forgeAnchor, [...palette.structure.slice(0, 3), .78], 5.4, .48);
    forgeCompositions.forEach((composition, compositionIndex) => {
      const start = forgeBoundaries[compositionIndex] ?? 0;
      const end = forgeBoundaries[compositionIndex + 1] ?? start;
      const relations = forgeRelations.slice(start, end);
      const phase = compositionIndex / Math.max(1, forgeCompositions.length) * Math.PI * 2
        + hash(composition.witness) * .34;
      const grammar = [
        forgeAnchor[0] + Math.cos(phase) * (.3 + compositionIndex * .055),
        forgeAnchor[1] - .28 + compositionIndex * .2,
        forgeAnchor[2] + Math.sin(phase) * (.3 + compositionIndex * .055)
      ];
      addLine(forgeAnchor, grammar, [...palette.structure.slice(0, 3), .24], .49 + compositionIndex * .025);
      addPoint(grammar, [...palette.structure.slice(0, 3), .7], 4.2, .5 + compositionIndex * .025);
      let previous = grammar;
      relations.forEach((relation, relationIndex) => {
        const t = (relationIndex + 1) / Math.max(1, relations.length);
        const identity = `${composition.witness}:${relation}`;
        const angle = phase + t * Math.PI * (1.25 + compositionIndex * .18)
          + (hash(identity) - .5) * .16;
        const radius = .18 + t * (.44 + compositionIndex * .035);
        const position = [
          grammar[0] + Math.cos(angle) * radius,
          grammar[1] - .22 + t * (.62 + compositionIndex * .04),
          grammar[2] + Math.sin(angle) * radius
        ];
        const birth = .52 + compositionIndex * .025 + t * .09;
        addLine(previous, position, [...palette.structure.slice(0, 3), .18 + t * .18], birth);
        addPoint(position, [...palette.structure.slice(0, 3), .42 + t * .22], 2.2 + t * 1.5, birth + .01);
        if (relationIndex > 0 && relationIndex % 2 === 0) {
          addFacet(grammar, previous, position, [...palette.structure.slice(0, 3), .014], birth);
        }
        if (relationIndex === relations.length - 1 || relationIndex % 5 === 0) pulsePaths.push([grammar, position]);
        previous = position;
      });
      const returnPoint = trunk[Math.min(trunk.length - 1, Math.round(cycles * (.54 + compositionIndex * .06)))];
      addLine(previous, returnPoint, [...palette.structure.slice(0, 3), .2], .63 + compositionIndex * .018);
    });

    // The Bible is one coherent formative body, not seventy-three competing
    // library identities. Its two canonical divisions form nested chambers
    // around a shared corpus barycenter. Canonical order gives the body a spine;
    // every derived relation remains drawn; each book's outward pressure extends
    // away from the barycenter while its gravitational line pulls inward.
    const corpusVisual = new Map((corpus.visual?.topology?.nodes || []).map((node) => [node.id, node]));
    const corpusPositions = new Map();
    const corpusNodes = [...(corpus.nodes || [])].sort((a, b) => Number(a.canonical_order || 0) - Number(b.canonical_order || 0));
    const corpusCenter = [-0.82, -0.18, 0.08];
    const workLeafPositions = new Map([[corpus.corpus_id, corpusCenter]]);
    const corpusRoot = trunk[Math.min(trunk.length - 1, Math.round(cycles * 0.58))];
    const oldTestament = corpusNodes.filter(({ division }) => division === "Old Testament");
    const newTestament = corpusNodes.filter(({ division }) => division === "New Testament");
    const divisionIndex = new Map([
      ...oldTestament.map((node, index) => [node.id, [index, oldTestament.length, 0]]),
      ...newTestament.map((node, index) => [node.id, [index, newTestament.length, 1]])
    ]);
    addPoint(corpusCenter, [...palette.canon.slice(0, 3), 0.92], 12.5, 0.54, 1);
    addLine(corpusRoot, corpusCenter, [...palette.canon.slice(0, 3), 0.58], 0.52, 1);
    pulsePaths.push([corpusRoot, corpusCenter]);

    corpusNodes.forEach((node, index, nodes) => {
      const visual = corpusVisual.get(node.id) || node;
      const pressure = Number(visual.outward_pressure ?? node.outward_pressure ?? 0.72);
      const distinctiveness = Number(visual.distinctiveness ?? node.distinctiveness ?? 0.65);
      const [withinDivision, divisionLength, division] = divisionIndex.get(node.id) || [index, nodes.length, 0];
      const progress = divisionLength <= 1 ? 0 : withinDivision / (divisionLength - 1);
      const old = division === 0;
      const turns = old ? 2.62 : 1.72;
      const phase = (old ? -0.72 : 2.18) + progress * Math.PI * 2 * turns;
      const chamberRadius = (old ? 0.5 : 0.29) + pressure * (old ? 0.27 : 0.2);
      const vertical = old
        ? -0.82 + progress * 1.38
        : -0.2 + progress * 1.18;
      const position = [
        corpusCenter[0] + Math.cos(phase) * chamberRadius + (old ? -0.16 : 0.2),
        corpusCenter[1] + vertical + (distinctiveness - 0.65) * 0.38,
        corpusCenter[2] + Math.sin(phase) * chamberRadius
      ];
      corpusPositions.set(node.id, position);
      const birth = 0.57 + index / Math.max(1, nodes.length) * 0.27;
      const divisionColor = old
        ? palette.canon
        : [palette.canon[0] * 0.82, palette.canon[1] * 0.9, Math.min(1, palette.canon[2] * 1.18), 0.82];
      addPoint(position, divisionColor, 4.8 + distinctiveness * 2.8, birth, 1);
      addLine(corpusCenter, position, [...divisionColor.slice(0, 3), 0.075], birth - 0.025, 1);

      const radial = [
        position[0] - corpusCenter[0],
        position[1] - corpusCenter[1],
        position[2] - corpusCenter[2]
      ];
      const length = Math.hypot(...radial) || 1;
      const release = 0.12 + pressure * 0.19;
      const outward = [
        position[0] + radial[0] / length * release,
        position[1] + radial[1] / length * release,
        position[2] + radial[2] / length * release
      ];
      addLine(position, outward, [...divisionColor.slice(0, 3), 0.64], birth + 0.018, 1);
      addPoint(outward, [...divisionColor.slice(0, 3), 0.42], 2.2, birth + 0.03, 1);
    });

    corpusNodes.forEach((node, index) => {
      if (!index) return;
      const previous = corpusPositions.get(corpusNodes[index - 1].id);
      const current = corpusPositions.get(node.id);
      if (!previous || !current) return;
      const crossesTestament = corpusNodes[index - 1].division !== node.division;
      addLine(previous, current, [...palette.canon.slice(0, 3), crossesTestament ? 0.78 : 0.31], 0.6 + index / corpusNodes.length * 0.18, 1);
      if (crossesTestament || index % 7 === 0) pulsePaths.push([previous, current]);
      if (index % 2 === 0) {
        addFacet(
          corpusCenter,
          previous,
          current,
          [...palette.canon.slice(0, 3), crossesTestament ? 0.035 : 0.018],
          0.6 + index / corpusNodes.length * 0.18,
          1
        );
      }
    });

    const witnessedTensions = (corpus.edges || [])
      .filter((edge) => corpusPositions.has(edge.from) && corpusPositions.has(edge.to));
    witnessedTensions.forEach((edge, index) => {
      const weight = Math.min(9, Math.max(1, Number(edge.weight || 1)));
      const alpha = 0.025 + weight / 9 * 0.075;
      const a = corpusPositions.get(edge.from);
      const b = corpusPositions.get(edge.to);
      addLine(a, b, [...palette.canon.slice(0, 3), alpha], 0.66 + index / Math.max(1, witnessedTensions.length) * 0.21, 1);
      if (index % 47 === 0) pulsePaths.push([a, b]);
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
      const collectionCluster = clusterForWork.get(collectionWorks[0]?.work_id) ?? 0;
      addLine(anchor, shoulder, color, 0.5 + groupIndex * 0.05, collectionCluster);
      pulsePaths.push([anchor, shoulder]);

      collectionWorks.sort((a, b) => (a.canonical_order || 0) - (b.canonical_order || 0)).forEach((work, index) => {
        const cluster = clusterForWork.get(work.work_id) ?? 0;
        const t = (index + 1) / (collectionWorks.length + 1);
        const turn = baseAngle + (t - 0.5) * 1.28 + (hash(work.work_id) - 0.5) * 0.18;
        const reach = 0.72 + t * 1.28;
        const leaf = [
          shoulder[0] + Math.cos(turn) * reach,
          shoulder[1] + (t - 0.32) * 1.26 + (hash(`${work.work_id}-y`) - 0.5) * 0.17,
          shoulder[2] + Math.sin(turn) * reach
        ];
        workLeafPositions.set(work.work_id, leaf);
        const joint = [
          shoulder[0] * 0.62 + leaf[0] * 0.38,
          shoulder[1] * 0.62 + leaf[1] * 0.38 + 0.08,
          shoulder[2] * 0.62 + leaf[2] * 0.38
        ];
        const birth = 0.58 + (groupIndex / Math.max(1, allGroups.length) * 0.08) + t * 0.28;
        addLine(shoulder, joint, [...color.slice(0, 3), 0.32], birth, cluster);
        addLine(joint, leaf, [...color.slice(0, 3), 0.5], birth + 0.025, cluster);
        addFacet(shoulder, joint, leaf, [...color.slice(0, 3), 0.018], birth + 0.018, cluster);
        addPoint(leaf, color, collection.includes("Douay") ? 5.3 : 7.2, birth + 0.04, cluster);
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
            addPoint(internal, [...color.slice(0, 3), 0.38], node.type === "concept" ? 2.1 : 2.7, birth + 0.045 + fraction * 0.045, cluster);
          });
          (topology.edges || []).forEach((edge, edgeIndex, internalEdges) => {
            const from = internalPositions.get(edge.from);
            const to = internalPositions.get(edge.to);
            if (!from || !to) return;
            const weight = Math.min(1, Math.max(.08, Number(edge.weight || 1) / 12));
            addLine(from, to, [...color.slice(0, 3), .035 + weight * .08], birth + 0.05 + edgeIndex / Math.max(1, internalEdges.length) * .04, cluster);
            if (edgeIndex % 29 === 0) pulsePaths.push([from, to]);
          });
          const internalFacetNodes = [...internalPositions.values()].slice(1);
          for (let nodeIndex = 1; nodeIndex < internalFacetNodes.length; nodeIndex += 6) {
            addFacet(
              leaf,
              internalFacetNodes[nodeIndex - 1],
              internalFacetNodes[nodeIndex],
              [...color.slice(0, 3), 0.012],
              birth + 0.055,
              cluster
            );
          }
        }
        if (index % Math.max(1, Math.floor(collectionWorks.length / 9)) === 0) pulsePaths.push([shoulder, joint, leaf]);
      });
    });

    // The Library composition is a higher-order body. Level zero reuses the
    // existing work anchors exactly; relations, grammars, and the composed
    // Library rise above them without moving or regenerating any work.
    const compositionPositions = new Map(workLeafPositions);
    const compositionRelations = new Map((libraryComposition?.relations || []).map((relation) => [relation.id, relation]));
    const compositionNodes = libraryComposition?.visual?.topology?.nodes || [];
    compositionNodes.filter(({ level }) => level > 0).forEach((node) => {
      const relation = compositionRelations.get(node.id);
      const relationStrength = relationalProximity(
        relation?.kind || node.relation_kind,
        relation?.strength ?? node.strength ?? 0
      );
      const from = relation ? compositionPositions.get(relation.from) : null;
      const to = relation ? compositionPositions.get(relation.to) : null;
      const midpoint = from && to
        ? [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]
        : null;
      const levelY = node.level === 1 ? 1.34 : node.level === 2 ? 1.88 : 2.42;
      const position = midpoint
        ? [
          midpoint[0] * (.9 - relationStrength * .12),
          Math.max(1.08, midpoint[1] + .42) + relationStrength * .42,
          midpoint[2] * (.9 - relationStrength * .12)
        ]
        : [
          Number(node.layoutX || 0) * .92,
          levelY + Number(node.layoutY || 0) * .08,
          Number(node.layoutZ || 0) * .92
        ];
      compositionPositions.set(node.id, position);
      const alpha = node.level === 1 ? .1 + relationStrength * .78 : node.level === 2 ? .58 : .94;
      const size = node.level === 1 ? 1.8 + relationStrength * 6.4 : node.level === 2 ? 6.4 : 13.8;
      addPoint(position, [...palette.lineage.slice(0, 3), alpha], size, .88 + node.level * .025);
    });
    (libraryComposition?.visual?.topology?.edges || []).forEach((edge, index, edges) => {
      const from = compositionPositions.get(edge.from);
      const to = compositionPositions.get(edge.to);
      if (!from || !to) return;
      const strength = relationalProximity(edge.relation_kind, (Number(edge.weight || 1) - 1) / 8);
      const alpha = edge.relation === "emerges-as"
        ? .72
        : edge.relation === "composes" ? .12 + strength * .4 : .035 + strength * .34;
      addLine(from, to, [...palette.lineage.slice(0, 3), alpha], .89 + index / Math.max(1, edges.length) * .08);
      if (edge.relation === "emerges-as" || strength >= .62 || index % 47 === 0) pulsePaths.push([from, to]);
    });

    const packetCount = (attractors.packets || []).filter((packet) => packet.publication?.status === "published").length;
    const memoryPressure = Math.min(8, (memory.hypotheses || []).length);
    for (let index = 0; index < packetCount + memoryPressure; index += 1) {
      const angle = index / Math.max(1, packetCount + memoryPressure) * Math.PI * 2;
      const p = [Math.cos(angle) * 1.95, -1.53 + (index % 4) * 0.08, Math.sin(angle) * 1.95];
      addPoint(p, palette.structure, 2.6, 0.86 + index * 0.003);
    }

    // FoldPortrait's completed render archive enters as a verified material
    // lineage inside the body. Each point is derived from the render hashes;
    // vessel-embodied witnesses bind more strongly to the trunk.
    const portraitRenders = (foldportrait?.renders || []).slice(0, 96);
    const portraitRoot = trunk[Math.min(trunk.length - 1, Math.round(cycles * 0.66))];
    const portraitAnchor = [-0.18, portraitRoot[1] + 0.18, -0.24];
    addLine(portraitRoot, portraitAnchor, [...palette.lineage.slice(0, 3), 0.52], 0.72);
    addPoint(portraitAnchor, [...palette.lineage.slice(0, 3), 0.78], 5.8, 0.73);
    let previousPortrait = portraitAnchor;
    portraitRenders.forEach((render, index) => {
      const t = (index + 1) / Math.max(1, portraitRenders.length);
      const identity = `${render.render_hash}:${render.convergence_hash}:${render.memory_signature}`;
      const angle = t * Math.PI * 10.5 + hash(identity) * 0.7;
      const refinement = Math.min(1, Math.max(0, Number(render.refinement_depth || 0) / 64));
      const radius = 0.28 + t * 0.88 + refinement * 0.18;
      const position = [
        portraitAnchor[0] + Math.cos(angle) * radius,
        portraitAnchor[1] - 0.48 + t * 1.52 + (hash(`${identity}:y`) - 0.5) * 0.18,
        portraitAnchor[2] + Math.sin(angle) * radius
      ];
      const embodied = Boolean(render.material_witness?.vessels?.length);
      const color = [...palette.lineage.slice(0, 3), embodied ? 0.82 : 0.3];
      const birth = 0.73 + t * 0.19;
      addPoint(position, color, embodied ? 5.3 : 2.7 + refinement * 1.2, birth);
      addLine(previousPortrait, position, [...color.slice(0, 3), embodied ? 0.36 : 0.13], birth);
      if (embodied) {
        addLine(portraitAnchor, position, [...palette.lineage.slice(0, 3), 0.58], birth);
        addFacet(portraitAnchor, previousPortrait, position, [...palette.lineage.slice(0, 3), 0.022], birth);
        pulsePaths.push([portraitRoot, portraitAnchor, position]);
      }
      previousPortrait = position;
    });

    // Telos Stream is a one-way public aperture, not part of Root Logos's
    // custody or execution plane. Its released revision and state witnesses
    // form a quiet strand rooted in the Living Object.
    const telosEvents = (telosStream?.events || []).slice(0, 144);
    const telosRoot = trunk[Math.min(trunk.length - 1, Math.round(cycles * 0.38))];
    let previousTelos = telosRoot;
    telosEvents.forEach((event, index) => {
      const t = (index + 1) / Math.max(1, telosEvents.length);
      const eventIdentity = event.revision || event.path || `${event.kind}:${index}`;
      const angle = t * Math.PI * 8.5 + hash(eventIdentity) * 0.48;
      const radius = 0.22 + t * 0.74;
      const position = [
        0.56 + Math.cos(angle) * radius,
        telosRoot[1] - 0.08 + t * 1.42,
        0.12 + Math.sin(angle) * radius
      ];
      const alpha = event.kind === "revision" ? 0.38 : 0.22;
      addPoint(position, [...palette.lineage.slice(0, 3), alpha], event.kind === "revision" ? 3.1 : 2.3, 0.78 + t * 0.16);
      addLine(previousTelos, position, [...palette.lineage.slice(0, 3), alpha * 0.72], 0.78 + t * 0.16);
      if (index % 11 === 0) pulsePaths.push([telosRoot, position]);
      previousTelos = position;
    });

    return {
      facets: new Float32Array(facets),
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
      attribute float aCluster;
      uniform float uTime;
      uniform float uGrowth;
      uniform float uYaw;
      uniform float uPitch;
      uniform float uAspect;
      uniform float uCadence;
      uniform float uCadenceAccent;
      uniform float uRelease;
      uniform float uReleasePhase;
      uniform float uReleaseSeed;
      uniform float uReleaseCenterX;
      uniform float uReleaseCenterY;
      uniform float uReleaseCenterZ;
      uniform float uReleaseRadius;
      varying vec4 vColor;
      varying float vVisible;
      void main() {
        float cy = cos(uYaw), sy = sin(uYaw);
        float cx = cos(uPitch), sx = sin(uPitch);
        vec3 p = vec3(aPosition.x * cy - aPosition.z * sy, aPosition.y, aPosition.x * sy + aPosition.z * cy);
        p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
        float depth = 5.8 - p.z;
        float viewportFit = mix(0.40, 1.0, smoothstep(0.45, 1.0, uAspect));
        vec2 projected = vec2(p.x / uAspect, p.y) * 2.15 / depth * viewportFit;
        gl_Position = vec4(projected, 0.0, 1.0);
        float arrival = smoothstep(aBirth - 0.025, aBirth + 0.055, uGrowth);
        float cadencePulse = pow(max(0.0, cos(uCadence * 6.283185)), 10.0);
        float breath = 1.0 + sin(uTime * 0.62 + aBirth * 16.0) * 0.055 + cadencePulse * (0.16 + uCadenceAccent * 0.12);
        gl_PointSize = aSize * arrival * breath * (5.3 / depth);
        float engravingDepth = clamp((p.z + 2.4) / 4.8, 0.0, 1.0);
        vec3 canonical = vec3(0.941, 0.094, 0.094);
        vec3 affectedCenter = vec3(uReleaseCenterX, uReleaseCenterY, uReleaseCenterZ);
        float affectedDistance = length(aPosition - affectedCenter);
        float affectedRadius = max(0.0001, uReleaseRadius);
        float affectedMap = 1.0 - smoothstep(affectedRadius * 0.34, affectedRadius, affectedDistance);
        float interference = sin(dot(aPosition, vec3(2.7, 3.9, 4.6)) + uReleaseSeed * 6.283185 + uReleasePhase * 6.283185);
        float mappedTexture = 0.72 + 0.28 * interference;
        float releaseField = affectedMap * mappedTexture * uRelease;
        float azimuth = atan(aPosition.z, aPosition.x) / 6.283185;
        float hue = uReleasePhase * 0.72 + azimuth * 0.18 + length(aPosition) * 0.065 + interference * 0.055;
        vec3 spectral = 0.5 + 0.5 * cos(6.283185 * (hue + vec3(0.00, 0.67, 0.33)));
        vec3 pearl = vec3(0.94, 0.91, 0.82);
        vec3 releaseColor = mix(pearl, spectral, 0.46);
        releaseColor += vec3(0.06, 0.08, 0.09) * (0.5 + 0.5 * interference);
        vColor = vec4(mix(canonical, releaseColor, releaseField), aColor.a * arrival * mix(0.34, 1.0, engravingDepth));
        vVisible = arrival;
      }
    `;
    const lineFragment = `precision mediump float; varying vec4 vColor; void main(){ gl_FragColor=vColor; }`;
    const facetFragment = `
      precision mediump float;
      varying vec4 vColor;
      varying float vVisible;
      void main() {
        if (vVisible < .01) discard;
        gl_FragColor = vec4(vColor.rgb, vColor.a * .72);
      }
    `;
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
    const facetProgram = program(context, vertex, facetFragment);
    const lineProgram = program(context, vertex, lineFragment);
    const pointProgram = program(context, vertex, pointFragment);
    const facetBuffer = buffer(context, geometry.facets);
    const lineBuffer = buffer(context, geometry.lines);
    const pointBuffer = buffer(context, geometry.points);
    let release = null;
    context.enable(context.BLEND);
    context.blendFunc(context.SRC_ALPHA, context.ONE);

    const drawBuffer = (shader, dataBuffer, count, mode, stride) => {
      context.useProgram(shader);
      context.bindBuffer(context.ARRAY_BUFFER, dataBuffer);
      const fields = [
        ["aPosition", 3, 0],
        ["aColor", 4, 3],
        ["aSize", 1, 7],
        ["aBirth", 1, 8],
        ["aCluster", 1, 9]
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
      [
        ["uTime", state.time],
        ["uGrowth", state.growth],
        ["uYaw", state.rotation],
        ["uPitch", state.pitch],
        ["uAspect", state.aspect],
        ["uCadence", state.cadence],
        ["uCadenceAccent", state.cadenceAccent],
        ["uRelease", state.release ?? 0],
        ["uReleasePhase", state.releasePhase ?? 0],
        ["uReleaseSeed", state.releaseSeed ?? 0],
        ["uReleaseCenterX", state.releaseCenterX ?? 0],
        ["uReleaseCenterY", state.releaseCenterY ?? 0],
        ["uReleaseCenterZ", state.releaseCenterZ ?? 0],
        ["uReleaseRadius", state.releaseRadius ?? 0]
      ].forEach(([name, value]) => {
        context.uniform1f(context.getUniformLocation(shader, name), value);
      });
    };

    return {
      setRelease(detail) {
        const seed = hash(detail.event_id || "journal-release");
        const depth = Math.max(.04, Math.min(1, Number(detail.depth || 0)));
        const breadth = Math.max(0, Math.min(1, Number(detail.dimensions?.breadth || 0)));
        const azimuth = seed * Math.PI * 2;
        const elevation = (hash(`${detail.event_id}:elevation`) - .5) * .72;
        const targetRadius = .16 + (1 - depth) * 1.84;
        const horizontal = Math.cos(elevation) * targetRadius;
        release = {
          startedAt: performance.now(),
          seed,
          center: [
            Math.cos(azimuth) * horizontal,
            Math.sin(elevation) * targetRadius,
            Math.sin(azimuth) * horizontal
          ],
          radius: .42 + breadth * .78
        };
      },
      draw(state) {
        let releaseState = {
          release: 0,
          releasePhase: 0,
          releaseSeed: 0,
          releaseCenterX: 0,
          releaseCenterY: 0,
          releaseCenterZ: 0,
          releaseRadius: 0
        };
        if (release) {
          const voiceCycleDuration = cadence.beatSeconds * cadence.beatsPerCycle * 1000;
          const maximumSessionDuration = 60 * 60 * 1000;
          const elapsed = Math.max(0, performance.now() - release.startedAt);
          if (elapsed >= maximumSessionDuration) {
            release = null;
          } else {
            const finalCycleFade = Math.min(1, (maximumSessionDuration - elapsed) / voiceCycleDuration);
            releaseState = {
              release: (reducedMotion ? .48 : .9) * finalCycleFade,
              releasePhase: reducedMotion ? 0 : (elapsed % 18_000) / 18_000,
              releaseSeed: release.seed,
              releaseCenterX: release.center[0],
              releaseCenterY: release.center[1],
              releaseCenterZ: release.center[2],
              releaseRadius: release.radius
            };
          }
        }
        const renderedState = { ...state, ...releaseState };
        context.clearColor(0, 0, 0, 1);
        context.clear(context.COLOR_BUFFER_BIT);
        uniforms(facetProgram, renderedState);
        drawBuffer(facetProgram, facetBuffer, geometry.facets.length / 10, context.TRIANGLES, 10);
        uniforms(lineProgram, renderedState);
        drawBuffer(lineProgram, lineBuffer, geometry.lines.length / 10, context.LINES, 10);
        uniforms(pointProgram, renderedState);
        drawBuffer(pointProgram, pointBuffer, geometry.points.length / 10, context.POINTS, 10);
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

  function inheritedScoreField(scores) {
    const streams = scores.map((score, scoreIndex) =>
      (score.events || []).map((event) => ({
        ...event,
        scoreIndex,
        tempo: Math.max(24, Number(score.tempo || 48)),
        rootHz: Math.max(24, Number(score.root_hz || 55)),
        signature: score.signature || `score-${scoreIndex}`
      }))
    );
    const events = streams.flat();
    const sounding = events.filter((event) => !event.rest && Number.isFinite(Number(event.frequency)));
    const frequencies = sounding.map((event) => Number(event.frequency));
    return {
      events,
      streams,
      minHz: frequencies.length ? Math.min(...frequencies) : 55,
      maxHz: frequencies.length ? Math.max(...frequencies) : 880,
      tempos: [...new Set(events.map((event) => event.tempo))],
      voices: [...new Set(events.map((event) => event.voice || "relation"))],
      rests: events.filter((event) => event.rest).length
    };
  }

  function composeLexicalRelations(composition = {}) {
    return (composition.terms || []).map(({ rank, term, works, traces }) => ({
      from: "foldforge-composition-lexical",
      to: `foldforge:language:${term}`,
      relation: "recurs through source language",
      weight: Math.max(1, Number(works || 1)),
      traces,
      rank,
      provenance: `public/root-logos-language-composition.json#terms/${rank - 1}`
    }));
  }

  function composeLexicalScore(composition = {}) {
    if (!/^sha256:[a-f0-9]{64}$/.test(composition.witness || "") || composition.terms?.length !== 12) return null;
    const ratios = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 2];
    const rootHz = 55;
    const signature = `foldforge-lexical-${composition.witness.slice(7, 15)}`;
    const maximumWorks = Math.max(...composition.terms.map(({ works }) => Number(works || 1)));
    const events = composition.terms.map(({ rank, term, works, traces }, index) => {
      const seed = hash(`${composition.witness}:${rank}:${term}:${works}:${traces}`);
      const density = Number(works || 1) / maximumWorks;
      return {
        voice: "lexical",
        frequency: Number((rootHz * ratios[Math.floor(seed * ratios.length) % ratios.length]).toFixed(3)),
        beats: rank === 1 ? 2 : 1,
        amplitude: Number((0.012 + density * 0.024).toFixed(4)),
        rest: false,
        term,
        rank,
        recurrence: works,
        traces,
        provenance: `public/root-logos-language-composition.json#terms/${index}`,
        witness: composition.witness,
        boundary: composition.boundary
      };
    });
    return {
      schema: "root-logos-source-score/v1",
      source_id: "foldforge",
      composition_id: composition.grammar?.id,
      signature,
      tempo: 48,
      root_hz: rootHz,
      events
    };
  }

  function voiceWaveform(voice) {
    return ({
      coherence: "sine",
      antigravity: "triangle",
      ground: "triangle",
      relation: "sine",
      figure: "sine",
      breath: "sine",
      lexical: "triangle"
    })[voice] || "sine";
  }

  function beginSovereignVoice({ works, cycles, collections, relations, scores, sourceVoices = [] }) {
    if (lifetime.voiceStarted) return;
    lifetime.voiceStarted = true;
    if (!sovereignAudio) {
      beginFallbackVoice({ works, cycles, collections, relations, scores, sourceVoices });
      return;
    }
    const audio = sovereignAudio;
    const scoreField = inheritedScoreField(scores || []);
    const master = audio.createGain();
    const highpass = audio.createBiquadFilter();
    const lowpass = audio.createBiquadFilter();
    const compressor = audio.createDynamicsCompressor();
    const output = audio.createGain();
    const root = 38 + (cycles % 12);
    sovereignMaster = master;
    master.gain.value = libraryVoiceActive
      ? libraryVoiceUnderlay ? sovereignWhisperLevel * .34 : 0.0001
      : sovereignWhisperLevel;
    highpass.type = "highpass";
    highpass.frequency.value = 28;
    highpass.Q.value = 0.7;
    lowpass.type = "lowpass";
    lowpass.frequency.value = Math.min(1800, Math.max(760, scoreField.maxHz * 0.62));
    lowpass.Q.value = 0.55 + collections * 0.035;
    compressor.threshold.value = -34;
    compressor.knee.value = 24;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.028;
    compressor.release.value = 0.72;
    output.gain.value = sovereignOutputVolume;
    master.connect(highpass).connect(lowpass).connect(compressor).connect(output).connect(audio.destination);

    [1, 1.5, 2.25].forEach((ratio, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.value = root * ratio;
      gain.gain.value = [0.0032, 0.0009, 0.00028][index];
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
    relationGain.gain.value = 0.00115;
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
      const relationalPressure = Math.min(0.0012, meanRelationWeight * 0.00012);
      const strength = (state.cycleBeat === 0 ? 0.0065 : 0.0028) + relationalPressure;
      pulseGain.gain.cancelScheduledValues(now);
      pulseGain.gain.setValueAtTime(0.0001, now);
      pulseGain.gain.exponentialRampToValueAtTime(strength, now + 0.07);
      pulseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.55);
      pulseOscillator.frequency.setValueAtTime(root * (state.cycleBeat === 0 ? 2.25 : 2), now);

      // Recompose the current library at every cadence beat. Each current score
      // advances on its own signature-derived phase, allowing the latest works
      // to sound together without collapsing them into one long event queue.
      const currentEvents = scoreField.streams.map((stream) => {
        if (!stream.length) return null;
        const offset = Math.floor(hash(stream[0].signature) * stream.length);
        return stream[(state.absoluteBeat + offset) % stream.length];
      }).filter((event) => event && !event.rest);
      const polyphonyScale = 1 / Math.sqrt(Math.max(1, currentEvents.length));
      currentEvents.forEach((event, voiceIndex) => {
        const voice = audio.createOscillator();
        const articulation = audio.createGain();
        const frequency = Math.min(4000, Math.max(32, Number(event.frequency || event.rootHz)));
        const beatDuration = 60 / event.tempo;
        const duration = Math.min(3.5, Math.max(0.25, Number(event.beats || 1) * beatDuration));
        const amplitude = Math.min(0.015, Math.max(0.0018, Number(event.amplitude || 0.04) * 0.13)) * polyphonyScale;
        const onset = now + voiceIndex * 0.055;
        voice.type = voiceWaveform(event.voice);
        voice.frequency.setValueAtTime(frequency, onset);
        articulation.gain.setValueAtTime(0.0001, onset);
        articulation.gain.exponentialRampToValueAtTime(amplitude, onset + Math.min(0.16, duration * 0.2));
        articulation.gain.exponentialRampToValueAtTime(0.0001, onset + duration);
        voice.connect(articulation).connect(master);
        voice.start(onset);
        voice.stop(onset + duration + 0.05);
      });
    };
    const current = cadenceState();
    const untilNextBeat = (1 - current.beatPhase) * cadence.beatSeconds * 1000;
    soundPulse();
    setTimeout(() => {
      soundPulse();
      setInterval(soundPulse, cadence.beatSeconds * 1000);
    }, untilNextBeat);

    ensureVoiceAwake();
    window.__rootLogosVoice = {
      context: audio,
      master,
      foreground: document.documentElement.dataset.voiceForeground || "silent",
      cadence: "weekly / Sunday 10:07 Eastern / seven-beat live phrase",
      relations: relations.length,
      relationWeight,
      scoreEvents: scoreField.events.length,
      scoreStreams: scoreField.streams.length,
      sourceVoices,
      composition: "current-edition polyphony / signature-phased / cadence recomposed",
      range: {
        minHz: scoreField.minHz,
        maxHz: scoreField.maxHz,
        tempos: scoreField.tempos,
        voices: scoreField.voices,
        rests: scoreField.rests
      },
      state: cadenceState
    };
  }

  function beginFallbackVoice({ works, cycles, collections, relations, scores, sourceVoices = [] }) {
    const scoreField = inheritedScoreField(scores || []);
    const sampleRate = 8000;
    const seconds = cadence.beatSeconds * cadence.beatsPerCycle;
    const samples = sampleRate * seconds;
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    const write = (offset, value) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
    write(0, "RIFF");
    view.setUint32(4, 36 + samples * 2, true);
    write(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, samples * 2, true);
    const root = 38 + (cycles % 12);
    const relationTone = root * (1 + (relations.length % 29) / 100);
    const meanWeight = relations.reduce((sum, relation) => sum + Math.max(1, Number(relation.weight || 1)), 0) / Math.max(1, relations.length);
    for (let index = 0; index < samples; index += 1) {
      const time = index / sampleRate;
      const phase = time % cadence.beatSeconds;
      const beat = Math.floor(time / cadence.beatSeconds);
      const currentEvents = scoreField.streams.map((stream) => {
        if (!stream.length) return null;
        const offset = Math.floor(hash(stream[0].signature) * stream.length);
        return stream[(beat + offset) % stream.length];
      }).filter((event) => event && !event.rest);
      const pulse = Math.exp(-phase * 3.4) * (.035 + Math.min(.012, meanWeight * .0007));
      const polyphonyScale = 1 / Math.sqrt(Math.max(1, currentEvents.length));
      const composition = currentEvents.reduce((sum, event) => {
        const eventFrequency = Math.min(4000, Math.max(32, Number(event.frequency || root * 2)));
        const eventAmplitude = Math.min(.038, Math.max(.0045, Number(event.amplitude || .04) * .28)) * polyphonyScale;
        const eventEnvelope = Math.min(1, phase * 6) * Math.exp(-phase / Math.max(.3, Number(event.beats || 1) * 60 / Number(event.tempo || 48)));
        return sum + Math.sin(Math.PI * 2 * eventFrequency * time) * eventAmplitude * eventEnvelope;
      }, 0);
      const body = Math.sin(Math.PI * 2 * root * time) * .022
        + Math.sin(Math.PI * 2 * root * 1.5 * time) * .006
        + Math.sin(Math.PI * 2 * relationTone * time) * .009
        + Math.sin(Math.PI * 2 * root * 2 * time) * pulse
        + composition;
      view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, body)) * 32760, true);
    }
    fallbackAudio = document.createElement("audio");
    fallbackAudio.src = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    fallbackAudio.loop = true;
    fallbackAudio.preload = "auto";
    fallbackVolume = Math.min(.42, .3 + works / 5000 + collections / 500);
    fallbackAudio.volume = libraryVoiceActive
      ? libraryVoiceUnderlay ? fallbackVolume * .34 : 0
      : fallbackVolume;
    fallbackAudio.setAttribute("playsinline", "");
    fallbackAudio.hidden = true;
    document.body.append(fallbackAudio);
    ensureVoiceAwake();
    window.__rootLogosVoice = {
      context: { state: "pcm-fallback" },
      cadence: "weekly / Sunday 10:07 Eastern / seven-beat live phrase",
      relations: relations.length,
      relationWeight: meanWeight * relations.length,
      scoreEvents: scoreField.events.length,
      scoreStreams: scoreField.streams.length,
      sourceVoices,
      composition: "current-edition polyphony / signature-phased / cadence recomposed",
      range: {
        minHz: scoreField.minHz,
        maxHz: scoreField.maxHz,
        tempos: scoreField.tempos,
        voices: scoreField.voices,
        rests: scoreField.rests
      },
      state: cadenceState
    };
  }
})();
