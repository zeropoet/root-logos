const voiceWaveform = (voice) => ({
  coherence: "sine",
  antigravity: "triangle",
  ground: "triangle",
  relation: "sine",
  figure: "sine",
  breath: "sine",
  lexical: "triangle",
  foldforge: "triangle"
})[voice] || "sine";

const hash = (value) => {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) / 4294967295;
};

export async function createOriginMaster() {
  const source = new URL("instrument.json", import.meta.url);
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Origin Master instrument unavailable: ${response.status}`);
  const instrument = await response.json();
  if (instrument.schema !== "root-logos-origin-instrument/v1" || instrument.status !== "sealed") {
    throw new Error("Origin Master instrument identity is invalid.");
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    const fallback = new Audio(new URL("root-logos-origin-master.wav", import.meta.url));
    fallback.loop = true;
    fallback.preload = "auto";
    fallback.volume = 0.68;
    return {
      instrument,
      async start() { await fallback.play(); },
      async stop() { fallback.pause(); fallback.currentTime = 0; }
    };
  }

  let audio = null;
  let master = null;
  let timer = 0;
  let beat = 0;
  const sustained = [];

  const stop = async () => {
    clearTimeout(timer);
    timer = 0;
    if (!audio) return;
    const closing = audio;
    const now = closing.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    sustained.forEach((oscillator) => {
      try { oscillator.stop(now + 0.55); } catch {}
    });
    audio = null;
    master = null;
    await new Promise((resolve) => setTimeout(resolve, 580));
    await closing.close();
  };

  const start = async () => {
    if (audio) return;
    audio = new AudioContextClass({ sampleRate: instrument.audio.sample_rate_hz });
    await audio.resume();
    beat = 0;
    sustained.length = 0;
    const highpass = audio.createBiquadFilter();
    const lowpass = audio.createBiquadFilter();
    const compressor = audio.createDynamicsCompressor();
    const output = audio.createGain();
    master = audio.createGain();
    master.gain.value = instrument.audio.master_gain;
    highpass.type = "highpass";
    highpass.frequency.value = instrument.audio.highpass_hz;
    highpass.Q.value = instrument.audio.highpass_q;
    lowpass.type = "lowpass";
    lowpass.frequency.value = instrument.audio.lowpass_hz;
    lowpass.Q.value = instrument.audio.lowpass_q;
    compressor.threshold.value = instrument.audio.compressor.threshold;
    compressor.knee.value = instrument.audio.compressor.knee;
    compressor.ratio.value = instrument.audio.compressor.ratio;
    compressor.attack.value = instrument.audio.compressor.attack;
    compressor.release.value = instrument.audio.compressor.release;
    output.gain.value = instrument.audio.output_gain;
    master.connect(highpass).connect(lowpass).connect(compressor).connect(output).connect(audio.destination);

    instrument.sustained.forEach(({ ratio, waveform, gain }) => {
      const oscillator = audio.createOscillator();
      const amplitude = audio.createGain();
      oscillator.type = waveform;
      oscillator.frequency.value = instrument.root_hz * ratio;
      amplitude.gain.value = gain;
      oscillator.connect(amplitude).connect(master);
      oscillator.start();
      sustained.push(oscillator);
    });

    const relation = audio.createOscillator();
    const relationGain = audio.createGain();
    relation.setPeriodicWave(audio.createPeriodicWave(
      Float32Array.from(instrument.relation_harmonics.real),
      Float32Array.from(instrument.relation_harmonics.imaginary),
      { disableNormalization: false }
    ));
    relation.frequency.value = instrument.relation_harmonics.frequency_hz;
    relationGain.gain.value = instrument.relation_harmonics.gain;
    relation.connect(relationGain).connect(master);
    relation.start();
    sustained.push(relation);

    const pulse = audio.createOscillator();
    const pulseGain = audio.createGain();
    pulse.type = "sine";
    pulseGain.gain.value = 0.0001;
    pulse.connect(pulseGain).connect(master);
    pulse.start();
    sustained.push(pulse);

    const soundBeat = () => {
      if (!audio || !master) return;
      const now = audio.currentTime;
      const absoluteBeat = instrument.phrase_start_absolute_beat + beat;
      const accent = absoluteBeat % instrument.cadence.beats_per_phrase === 0;
      const strength = (accent ? 0.0065 : 0.0028) + instrument.relation_harmonics.pressure;
      pulseGain.gain.cancelScheduledValues(now);
      pulseGain.gain.setValueAtTime(0.0001, now);
      pulseGain.gain.exponentialRampToValueAtTime(strength, now + 0.07);
      pulseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.55);
      pulse.frequency.setValueAtTime(instrument.root_hz * (accent ? 2.25 : 2), now);

      const events = instrument.streams.map((stream) => {
        if (!stream.events.length) return null;
        const offset = Math.floor(hash(stream.signature) * stream.events.length);
        return stream.events[(absoluteBeat + offset) % stream.events.length];
      }).filter((event) => event && !event.rest);
      const scale = 1 / Math.sqrt(Math.max(1, events.length));
      events.forEach((event, index) => {
        const oscillator = audio.createOscillator();
        const envelope = audio.createGain();
        const frequency = Math.min(4000, Math.max(32, Number(event.frequency || event.root_hz)));
        const duration = Math.min(3.5, Math.max(0.25, Number(event.beats || 1) * 60 / event.tempo));
        const amplitude = Math.min(0.015, Math.max(0.0018, Number(event.amplitude || 0.04) * 0.13)) * scale;
        const onset = now + index * 0.055;
        oscillator.type = voiceWaveform(event.voice);
        oscillator.frequency.setValueAtTime(frequency, onset);
        envelope.gain.setValueAtTime(0.0001, onset);
        envelope.gain.exponentialRampToValueAtTime(amplitude, onset + Math.min(0.16, duration * 0.2));
        envelope.gain.exponentialRampToValueAtTime(0.0001, onset + duration);
        oscillator.connect(envelope).connect(master);
        oscillator.start(onset);
        oscillator.stop(onset + duration + 0.05);
      });
      beat += 1;
      timer = window.setTimeout(soundBeat, instrument.cadence.beat_seconds * 1000);
    };
    soundBeat();
  };

  return { instrument, start, stop };
}
