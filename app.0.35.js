const state = {
  title: "",
  adafruitUsername: "",
  palette: {
    sage: "#9caf88",
    yellow: "#e7d86a",
    brown: "#7a5c3c",
    white: "#f4f1e8",
    orange: "#d97a2b",
  },
  sensorIDs: [],
  places: [],
  sensorFeedUrls: {},
  sensorDrawers: [],
  sensorMeta: [],
  headerHeight: 76,
  rowHeight: 138,
  longPressMs: 2800,
  isPressing: false,
  showDetails: false,
  staleThresholdMs: 2 * 60 * 60 * 1000,
  aqMinVal: 0,
  aqMaxVal: 300,
  drawReady: false,
  visualsReady: false,
};

const pollingState = {
  activeTimer: null,
  inactiveTimer: null,
  activeCursor: 0,
  minPollGapMs: 60 * 1000,
  inactiveFixedMs: 60 * 1000,
};

const TRACK_TEMPO_MULTIPLIERS = [0.125, 0.25, 0.5, 1, 1.5, 2, 4];
const TRACK_ROLE_KEYS = ["low", "midLow", "mid", "high", "top", "air"];
const TRACK_INSTRUMENT_OPTIONS = {
  low: [
    { label: "Pulse Bass", create: () => withVolume(new Tone.MonoSynth({ oscillator: { type: "square" }, filter: { Q: 2, type: "lowpass", rolloff: -24 }, envelope: { attack: 0.01, decay: 0.14, sustain: 0.08, release: 0.18 }, filterEnvelope: { attack: 0.01, decay: 0.12, sustain: 0.05, release: 0.2, baseFrequency: 80, octaves: 2.2 } }).toDestination(), -9) },
    { label: "Sine Bass", create: () => withVolume(new Tone.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.01, decay: 0.12, sustain: 0.05, release: 0.18 } }).toDestination(), -10) },
    { label: "Rubber Bass", create: () => withVolume(new Tone.MonoSynth({ oscillator: { type: "sawtooth" }, filter: { Q: 3, type: "lowpass", rolloff: -24 }, envelope: { attack: 0.008, decay: 0.12, sustain: 0.06, release: 0.16 }, filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 0.02, release: 0.14, baseFrequency: 70, octaves: 3 } }).toDestination(), -12) },
    { label: "Duo Bass", create: () => withVolume(new Tone.DuoSynth({ vibratoAmount: 0.1, harmonicity: 1.5, voice0: { oscillator: { type: "triangle" }, envelope: { attack: 0.01, decay: 0.08, sustain: 0.08, release: 0.14 } }, voice1: { oscillator: { type: "sine" }, envelope: { attack: 0.02, decay: 0.08, sustain: 0.05, release: 0.16 } } }).toDestination(), -13) },
    { label: "Sub Thump", create: () => withVolume(new Tone.MonoSynth({ oscillator: { type: "sine" }, envelope: { attack: 0.005, decay: 0.16, sustain: 0.02, release: 0.18 }, filterEnvelope: { attack: 0.005, decay: 0.12, sustain: 0.01, release: 0.15, baseFrequency: 60, octaves: 1.8 } }).toDestination(), -8) },
  ],
  midLow: [
    { label: "Square Beep", create: () => withVolume(new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.008, decay: 0.09, sustain: 0.02, release: 0.08 } }).toDestination(), -12) },
    { label: "Triangle Beep", create: () => withVolume(new Tone.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.006, decay: 0.08, sustain: 0.02, release: 0.07 } }).toDestination(), -11) },
    { label: "Combo Organ", create: () => withVolume(new Tone.AMSynth({ harmonicity: 1.5, envelope: { attack: 0.01, decay: 0.1, sustain: 0.06, release: 0.1 }, modulationEnvelope: { attack: 0.01, decay: 0.08, sustain: 0.04, release: 0.08 } }).toDestination(), -13) },
    { label: "Soft Reed", create: () => withVolume(new Tone.DuoSynth({ harmonicity: 1.25, vibratoAmount: 0.08, voice0: { oscillator: { type: "sawtooth" }, envelope: { attack: 0.008, decay: 0.08, sustain: 0.05, release: 0.08 } }, voice1: { oscillator: { type: "triangle" }, envelope: { attack: 0.01, decay: 0.08, sustain: 0.04, release: 0.08 } } }).toDestination(), -14) },
    { label: "Wood Pluck", create: () => withVolume(new Tone.PluckSynth({ attackNoise: 0.7, dampening: 1800, resonance: 0.7 }).toDestination(), -10) },
  ],
  mid: [
    { label: "Glass Pluck", create: () => withVolume(new Tone.PluckSynth({ attackNoise: 0.8, dampening: 2800, resonance: 0.75 }).toDestination(), -9) },
    { label: "Bell Tone", create: () => withVolume(new Tone.FMSynth({ harmonicity: 2.2, modulationIndex: 5, envelope: { attack: 0.005, decay: 0.18, sustain: 0.02, release: 0.12 }, modulationEnvelope: { attack: 0.01, decay: 0.12, sustain: 0.03, release: 0.1 } }).toDestination(), -12) },
    { label: "Warm Organ", create: () => withVolume(new Tone.AMSynth({ harmonicity: 1.2, envelope: { attack: 0.01, decay: 0.12, sustain: 0.08, release: 0.12 }, modulationEnvelope: { attack: 0.008, decay: 0.08, sustain: 0.05, release: 0.08 } }).toDestination(), -11) },
    { label: "Nylon Pluck", create: () => withVolume(new Tone.PluckSynth({ attackNoise: 0.6, dampening: 2200, resonance: 0.8 }).toDestination(), -8) },
    { label: "Soft Bell", create: () => withVolume(new Tone.Synth({ oscillator: { type: "triangle8" }, envelope: { attack: 0.006, decay: 0.14, sustain: 0.03, release: 0.1 } }).toDestination(), -11) },
  ],
  high: [
    { label: "FM Ping", create: () => withVolume(new Tone.FMSynth({ harmonicity: 2.6, modulationIndex: 6, envelope: { attack: 0.006, decay: 0.12, sustain: 0.02, release: 0.1 }, modulationEnvelope: { attack: 0.005, decay: 0.09, sustain: 0.02, release: 0.08 } }).toDestination(), -13) },
    { label: "Bright Square", create: () => withVolume(new Tone.Synth({ oscillator: { type: "square4" }, envelope: { attack: 0.004, decay: 0.08, sustain: 0.01, release: 0.06 } }).toDestination(), -14) },
    { label: "Glass Bell", create: () => withVolume(new Tone.FMSynth({ harmonicity: 3.2, modulationIndex: 9, envelope: { attack: 0.004, decay: 0.16, sustain: 0.01, release: 0.12 }, modulationEnvelope: { attack: 0.004, decay: 0.1, sustain: 0.01, release: 0.08 } }).toDestination(), -15) },
    { label: "Hollow Ping", create: () => withVolume(new Tone.AMSynth({ harmonicity: 2, envelope: { attack: 0.004, decay: 0.08, sustain: 0.01, release: 0.06 }, modulationEnvelope: { attack: 0.004, decay: 0.06, sustain: 0.01, release: 0.05 } }).toDestination(), -15) },
    { label: "Needle FM", create: () => withVolume(new Tone.FMSynth({ harmonicity: 4, modulationIndex: 12, envelope: { attack: 0.003, decay: 0.07, sustain: 0.01, release: 0.05 }, modulationEnvelope: { attack: 0.003, decay: 0.05, sustain: 0.01, release: 0.04 } }).toDestination(), -16) },
  ],
  top: [
    { label: "AM Chirp", create: () => withVolume(new Tone.AMSynth({ harmonicity: 3, envelope: { attack: 0.005, decay: 0.08, sustain: 0.01, release: 0.06 }, modulation: { type: "triangle" }, modulationEnvelope: { attack: 0.005, decay: 0.06, sustain: 0.01, release: 0.05 } }).toDestination(), -16) },
    { label: "Needle Tone", create: () => withVolume(new Tone.Synth({ oscillator: { type: "sawtooth8" }, envelope: { attack: 0.003, decay: 0.05, sustain: 0.01, release: 0.04 } }).toDestination(), -18) },
    { label: "Star Bell", create: () => withVolume(new Tone.FMSynth({ harmonicity: 4, modulationIndex: 10, envelope: { attack: 0.003, decay: 0.12, sustain: 0.01, release: 0.06 }, modulationEnvelope: { attack: 0.003, decay: 0.08, sustain: 0.01, release: 0.05 } }).toDestination(), -17) },
    { label: "Airy Pluck", create: () => withVolume(new Tone.PluckSynth({ attackNoise: 1.1, dampening: 4200, resonance: 0.85 }).toDestination(), -14) },
    { label: "Data Blip", create: () => withVolume(new Tone.DuoSynth({ harmonicity: 1.9, vibratoAmount: 0.04, voice0: { oscillator: { type: "triangle" }, envelope: { attack: 0.003, decay: 0.05, sustain: 0.01, release: 0.04 } }, voice1: { oscillator: { type: "square" }, envelope: { attack: 0.003, decay: 0.04, sustain: 0.01, release: 0.04 } } }).toDestination(), -18) },
  ],
  air: [
    { label: "Glass Air", create: () => withVolume(new Tone.FMSynth({ harmonicity: 5, modulationIndex: 7, envelope: { attack: 0.004, decay: 0.14, sustain: 0.01, release: 0.08 }, modulationEnvelope: { attack: 0.004, decay: 0.09, sustain: 0.01, release: 0.06 } }).toDestination(), -17) },
    { label: "Ice Ping", create: () => withVolume(new Tone.Synth({ oscillator: { type: "triangle16" }, envelope: { attack: 0.003, decay: 0.06, sustain: 0.01, release: 0.05 } }).toDestination(), -18) },
    { label: "Radio Chirp", create: () => withVolume(new Tone.AMSynth({ harmonicity: 4, envelope: { attack: 0.003, decay: 0.05, sustain: 0.01, release: 0.04 }, modulationEnvelope: { attack: 0.003, decay: 0.04, sustain: 0.01, release: 0.04 } }).toDestination(), -18) },
    { label: "Crystal Pluck", create: () => withVolume(new Tone.PluckSynth({ attackNoise: 1.2, dampening: 5200, resonance: 0.9 }).toDestination(), -15) },
    { label: "Shimmer Tone", create: () => withVolume(new Tone.DuoSynth({ harmonicity: 2.4, vibratoAmount: 0.05, voice0: { oscillator: { type: "sine" }, envelope: { attack: 0.004, decay: 0.05, sustain: 0.01, release: 0.04 } }, voice1: { oscillator: { type: "triangle" }, envelope: { attack: 0.004, decay: 0.06, sustain: 0.01, release: 0.05 } } }).toDestination(), -18) },
  ],
};

const audioState = {
  isPlaying: false,
  audioUnlocked: false,
  toneReady: false,
  bpm: 64,
  stepIndex: 0,
  timeScrubMinutes: 4,
  historyWindowMs: 24 * 60 * 60 * 1000,
  baseMidi: 36,
  scale: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24],
  sensorPulseUntil: [],
  pulseDurationMs: 900,
  historyBySensorId: {},
  playheadBySensorId: {},
  lastPlaybackBySensorId: {},
  lastTriggeredStepBySensorId: {},
  lastDataChangeBySensorId: {},
  channelStateBySensorId: {},
  trackTempoIndexBySensorId: {},
  trackInstrumentIndexBySensorId: {},
  activeSensorIndex: -1,
  playbackStartedAtMs: 0,
  lastSafetyDroneAtMs: 0,
  swirlDurationMs: 18000,
  swirlUntilMs: 0,
  minConcurrentAudible: 3,
  maxConcurrentAudible: 5,
  preferredTopCount: 3,
  audibleThreshold: 0.05,
  accruedDurationEl: null,
  transportButtonEl: null,
  bpmControlEl: null,
  bpmReadoutEl: null,
  bottomStripEl: null,
  autoplayRetryTimer: null,
  trackSynthBySensorId: {},
  loopId: null,
  synths: {
    ding: null,
  },
};

const visualState = {
  particles: [],
  graphPointsBySensorId: {},
  sweepStartedAtMs: 0,
  aqHitboxes: [],
  instrumentHitboxes: [],
  tempoHitboxes: [],
  primaryTrackSensorID: null,
  canvasEl: null,
};

function init() {
  audioState.accruedDurationEl = document.getElementById("accrued-duration");
  audioState.transportButtonEl = document.getElementById("transport-button");
  audioState.bpmControlEl = document.getElementById("bpm-control");
  audioState.bpmReadoutEl = document.getElementById("bpm-readout");
  audioState.bottomStripEl = document.querySelector(".bottom-strip");
  setupHudControls();
  bindPressHandlers();
  loadConfig();
}

function setupHudControls() {
  if (audioState.transportButtonEl) {
    audioState.transportButtonEl.addEventListener("click", async () => {
      await togglePlayback();
    });
  }

  if (audioState.bpmControlEl) {
    audioState.bpmControlEl.value = `${audioState.bpm}`;
    const applyBpmValue = () => {
      const value = parseInt(audioState.bpmControlEl.value, 10);
      audioState.bpm = snapBpmValue(Number.isFinite(value) ? value : 64);
      audioState.bpmControlEl.value = `${audioState.bpm}`;
      if (audioState.isPlaying) {
        audioState.playbackStartedAtMs = Date.now();
        for (let i = 0; i < state.sensorIDs.length; i += 1) {
          audioState.lastTriggeredStepBySensorId[state.sensorIDs[i]] = 0;
        }
      }
      updateBpmReadout();
      refreshPlaybackLoop();
      if (audioState.isPlaying && audioState.audioUnlocked && audioState.toneReady && window.Tone) {
        playbackTick(Tone.now(), getPlaybackStepSeconds() / 24);
      }
    };
    audioState.bpmControlEl.addEventListener("change", applyBpmValue);
    audioState.bpmControlEl.addEventListener("input", applyBpmValue);
  }

  updateBpmReadout();
  updateAccruedDurationReadout();
  updateTransportButton();
}

function bindPressHandlers() {
  let pressTimer = null;
  const pressTarget = document.body;

  function startPress() {
    state.isPressing = true;
    state.showDetails = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      if (state.isPressing) {
        state.showDetails = true;
      }
    }, state.longPressMs);
  }

  function endPress() {
    state.isPressing = false;
    state.showDetails = false;
    clearTimeout(pressTimer);
  }

  ["pointerdown", "touchstart", "click"].forEach((eventName) => {
    pressTarget.addEventListener(
      eventName,
      (event) => {
        const isControl = Boolean(event.target && event.target.closest && event.target.closest("input, button, select, textarea"));
        if (isControl) {
          return;
        }
        if (eventName !== "click") {
          event.preventDefault();
        }
        if (eventName !== "click") {
          startPress();
        }
      },
      { passive: eventName === "click" }
    );
  });

  ["pointerup", "pointercancel", "pointerleave", "touchend", "touchcancel"].forEach((eventName) => {
    pressTarget.addEventListener(eventName, endPress, { passive: false });
  });
}

function loadConfig() {
  const cacheBust = `v=${Date.now()}`;
  fetch(`sensorInfo.json?${cacheBust}`, { cache: "no-store" })
    .then((response) => response.json())
    .then((config) => {
      state.title = config.title || "Salton Sea Synth";
      state.adafruitUsername = config.adafruitUsername || "";
      state.palette = { ...state.palette, ...(config.palette || {}) };
      state.sensorIDs = (config.sensors && config.sensors.sensorIDs) || [];
      state.places = (config.sensors && config.sensors.rooms) || [];
      buildUrls();
      buildSensors();
      initializeVisuals();
      state.drawReady = true;
      pollAllSensors(true).finally(() => {
        startPolling();
      });
    })
    .catch((error) => {
      console.error("Failed to load sensorInfo.json", error);
    });
}

function buildUrls() {
  state.sensorFeedUrls = {};
  const baseUrl = `https://io.adafruit.com/api/v2/${state.adafruitUsername}/feeds/`;
  state.sensorIDs.forEach((id) => {
    state.sensorFeedUrls[id] = `${baseUrl}id-${id}.aqi`;
  });
}

function buildSensors() {
  state.sensorDrawers = [];
  state.sensorMeta = [];
  audioState.sensorPulseUntil = [];

  for (let i = 0; i < state.sensorIDs.length; i += 1) {
    const sensorID = state.sensorIDs[i];
    const drawer = new SensorDrawer(sensorID, state.places[i], i);
    state.sensorDrawers.push(drawer);
    state.sensorMeta.push({ sensorID, lastPolledAtMs: 0, isPolling: false });
    audioState.sensorPulseUntil.push(0);
    audioState.historyBySensorId[sensorID] = [];
    audioState.playheadBySensorId[sensorID] = 0;
    audioState.lastPlaybackBySensorId[sensorID] = null;
    audioState.lastTriggeredStepBySensorId[sensorID] = 0;
    audioState.lastDataChangeBySensorId[sensorID] = 0;
    audioState.channelStateBySensorId[sensorID] = { level: 0, target: 0 };
    audioState.trackTempoIndexBySensorId[sensorID] = 3;
    audioState.trackInstrumentIndexBySensorId[sensorID] = 0;
    visualState.graphPointsBySensorId[sensorID] = [];
  }
}

function initializeVisuals() {
  visualState.particles = [];
  visualState.sweepStartedAtMs = Date.now();
  const particleCount = Math.max(36, state.sensorDrawers.length * 12);
  for (let i = 0; i < particleCount; i += 1) {
    visualState.particles.push({
      x: Math.random(),
      y: Math.random(),
      speed: 0.0006 + Math.random() * 0.0014,
      size: 0.8 + Math.random() * 2.2,
      drift: -0.0016 + Math.random() * 0.0032,
      seed: Math.random() * Math.PI * 2,
    });
  }
  state.visualsReady = true;
}

function startPlayback() {
  if (!state.drawReady) {
    return;
  }
  if (audioState.isPlaying) {
    return;
  }
  audioState.isPlaying = true;
  audioState.stepIndex = 0;
  audioState.playbackStartedAtMs = Date.now();
  audioState.lastSafetyDroneAtMs = 0;
  audioState.swirlUntilMs = Date.now() + audioState.swirlDurationMs;
  for (let i = 0; i < state.sensorIDs.length; i += 1) {
    audioState.lastTriggeredStepBySensorId[state.sensorIDs[i]] = 0;
  }
  updateAccruedDurationReadout();
  updateTransportButton();
  refreshPlaybackLoop();
}

function stopPlayback() {
  if (!audioState.isPlaying) {
    return;
  }
  audioState.isPlaying = false;
  audioState.activeSensorIndex = -1;
  updateTransportButton();

  if (window.Tone) {
    if (audioState.loopId !== null) {
      Tone.Transport.clear(audioState.loopId);
      audioState.loopId = null;
    }
    Tone.Transport.stop();
  }

  Object.values(audioState.trackSynthBySensorId).forEach((synth) => {
    if (synth) {
      if (typeof synth.releaseAll === "function") {
        synth.releaseAll();
      }
    }
  });
}

async function togglePlayback() {
  if (audioState.isPlaying) {
    stopPlayback();
    return;
  }

  startPlayback();
  await unlockAudioFromGesture();

  if (!audioState.audioUnlocked) {
    stopPlayback();
  }
}

function updateTransportButton() {
  if (!audioState.transportButtonEl) {
    return;
  }
  audioState.transportButtonEl.textContent = audioState.isPlaying ? "Pause" : "Play";
  audioState.transportButtonEl.setAttribute("aria-pressed", audioState.isPlaying ? "true" : "false");
}

async function unlockAudioFromGesture() {
  const ready = await ensureToneReady();
  if (!ready) {
    return;
  }
  if (audioState.audioUnlocked) {
    return;
  }
  audioState.audioUnlocked = true;
  createInstrumentBank();
  if (audioState.isPlaying) {
    refreshPlaybackLoop();
    playbackTick(Tone.now(), getPlaybackStepSeconds());
  }
}

async function ensureToneReady() {
  if (!window.Tone) {
    return false;
  }
  try {
    await Tone.start();
    if (Tone.context && Tone.context.state === "suspended") {
      await Tone.context.resume();
    }
  } catch (_error) {
    return false;
  }
  audioState.toneReady = true;
  return true;
}

function createInstrumentBank() {
  if (!audioState.toneReady || !window.Tone) {
    return;
  }
  disposeInstrumentBank();

  audioState.trackSynthBySensorId = {};
  for (let i = 0; i < state.sensorIDs.length; i += 1) {
    const sensorID = state.sensorIDs[i];
    audioState.trackSynthBySensorId[sensorID] = createTrackInstrumentForSensor(sensorID, i);
  }

  audioState.synths.ding = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.14, sustain: 0.04, release: 0.2 },
  }).toDestination();
  audioState.synths.ding.volume.value = -18;
}

function disposeInstrumentBank() {
  if (audioState.loopId !== null && window.Tone) {
    Tone.Transport.clear(audioState.loopId);
    audioState.loopId = null;
  }

  Object.keys(audioState.trackSynthBySensorId).forEach((sensorID) => {
    const synth = audioState.trackSynthBySensorId[sensorID];
    if (!synth) {
      return;
    }
    if (typeof synth.releaseAll === "function") {
      synth.releaseAll();
    }
    synth.dispose();
    audioState.trackSynthBySensorId[sensorID] = null;
  });
  audioState.trackSynthBySensorId = {};

  if (audioState.synths.ding) {
    audioState.synths.ding.dispose();
    audioState.synths.ding = null;
  }

}

function refreshPlaybackLoop() {
  if (!audioState.isPlaying || !audioState.audioUnlocked || !audioState.toneReady || !window.Tone) {
    return;
  }
  if (!hasInstrumentBank()) {
    createInstrumentBank();
  }
  if (!hasInstrumentBank()) {
    return;
  }

  if (audioState.loopId !== null) {
    Tone.Transport.clear(audioState.loopId);
    audioState.loopId = null;
  }

  Tone.Transport.bpm.value = audioState.bpm;
  const loopStepSeconds = getPlaybackStepSeconds() / 24;
  audioState.loopId = Tone.Transport.scheduleRepeat((time) => {
    playbackTick(time, loopStepSeconds);
  }, loopStepSeconds);

  if (Tone.Transport.state !== "started") {
    Tone.Transport.start("+0.05");
  }
}

function getPlaybackStepSeconds() {
  return 60 / Math.max(1, audioState.bpm);
}

function getScrubStepPoints() {
  return clamp(Math.round(audioState.timeScrubMinutes), 1, 12);
}

function playbackTick(time, stepSeconds) {
  if (!hasInstrumentBank()) {
    return;
  }

  const activeIndices = getActiveSensorIndices().filter((index) => {
    const sensorID = state.sensorIDs[index];
    return getPlaybackSamples(sensorID).length > 0;
  });
  const candidateIndices = activeIndices.length ? activeIndices : state.sensorIDs.map((_, index) => index);
  const noteEvents = [];
  const now = Date.now();

  for (let i = 0; i < candidateIndices.length; i += 1) {
    const sensorIndex = candidateIndices[i];
    const sensorID = state.sensorIDs[sensorIndex];
    const samples = getPlaybackSamples(sensorID);
    if (!samples.length) {
      continue;
    }

    const playbackState = getTrackPlaybackState(sensorID, now);
    const triggerStep = playbackState.triggerStep;
    if (triggerStep <= (audioState.lastTriggeredStepBySensorId[sensorID] || 0)) {
      continue;
    }
    const playhead = clamp(playbackState.pointIndex, 0, samples.length - 1);
    const currentSample = samples[playhead] || samples[samples.length - 1];
    if (!currentSample) {
      continue;
    }
    const isRepeatedDot = isRepeatedSampleValue(samples, playhead);

    const currentValue = currentSample.value;
    const midi = getMasterTrackMidi(sensorID, sensorIndex, currentValue);
    const note = Tone.Frequency(midi, "midi").toNote();
    const velocity = 0.18 + clamp((currentValue - state.aqMinVal) / Math.max(1, state.aqMaxVal - state.aqMinVal), 0, 1) * 0.18;
    const synth = getTrackSynth(sensorID, sensorIndex);
    if (!synth) {
      continue;
    }

    audioState.lastTriggeredStepBySensorId[sensorID] = triggerStep;
    audioState.playheadBySensorId[sensorID] = playhead;
    audioState.lastPlaybackBySensorId[sensorID] = {
      ts: now,
      notes: isRepeatedDot ? [] : [note],
      historyLength: samples.length,
      playhead,
      pointIndex: playhead,
      suppressed: isRepeatedDot,
    };
    if (isRepeatedDot) {
      continue;
    }

    noteEvents.push({ synth, note, velocity });
    pulseSensor(sensorIndex);
  }

  if (!noteEvents.length) {
    audioState.stepIndex += 1;
    return;
  }

  const durationSeconds = Math.min(stepSeconds * 0.55, 0.22);
  for (let i = 0; i < noteEvents.length; i += 1) {
    noteEvents[i].synth.triggerAttackRelease(noteEvents[i].note, durationSeconds, time, noteEvents[i].velocity);
  }
  audioState.activeSensorIndex = getPrimaryTrackIndex();
  audioState.stepIndex += 1;
}

function playSafetyDrone(time, stepSeconds, preferredIndices) {
  const now = Date.now();
  if (now - audioState.lastSafetyDroneAtMs < 850) {
    return;
  }

  const seed = getSafetyDroneSeed(preferredIndices);
  if (!seed) {
    return;
  }

  const rootMidi = Math.round(aqiToMidi(seed.aqi, seed.sensorIndex));
  const chord = [
    Tone.Frequency(rootMidi, "midi").toNote(),
    Tone.Frequency(clamp(rootMidi + 7, 30, 88), "midi").toNote(),
    Tone.Frequency(clamp(rootMidi + 12, 30, 88), "midi").toNote(),
  ];
  const synth = getSynthForAqi(seed.aqi) || audioState.synths.low || audioState.synths.mid;
  if (!synth) {
    return;
  }

  synth.triggerAttackRelease(chord, Math.max(5.5, stepSeconds * 2.8), time, 0.16);
  audioState.activeSensorIndex = seed.sensorIndex;
  pulseSensor(seed.sensorIndex);

  const sensorID = state.sensorIDs[seed.sensorIndex];
  const samples = getPlaybackSamples(sensorID);
  const playbackState = getTrackPlaybackState(sensorID);
  const playhead = playbackState.pointIndex;
  audioState.lastPlaybackBySensorId[sensorID] = {
    ts: now,
    notes: chord,
    historyLength: samples.length,
    playhead,
    pointIndex: playhead,
  };
  audioState.lastSafetyDroneAtMs = now;
}

function getSafetyDroneSeed(preferredIndices) {
  const indexPool =
    preferredIndices && preferredIndices.length ? preferredIndices : state.sensorIDs.map((_, index) => index);

  for (let i = 0; i < indexPool.length; i += 1) {
    const sensorIndex = indexPool[i];
    const sensorID = state.sensorIDs[sensorIndex];
    const history = getWindowedHistory(sensorID);
    if (history.length) {
      return { sensorIndex, aqi: history[history.length - 1].value };
    }
  }

  for (let i = 0; i < indexPool.length; i += 1) {
    const sensorIndex = indexPool[i];
    const drawer = state.sensorDrawers[sensorIndex];
    if (drawer && Number.isFinite(drawer.aqi)) {
      return { sensorIndex, aqi: drawer.aqi };
    }
  }

  return null;
}

function playSwirlCluster(time, stepSeconds, activeIndices) {
  if (!hasInstrumentBank()) {
    return;
  }

  const activeEntries = [];
  const now = Date.now();

  for (let i = 0; i < activeIndices.length; i += 1) {
    const sensorIndex = activeIndices[i];
    const sensorID = state.sensorIDs[sensorIndex];
    const samples = getPlaybackSamples(sensorID);
    if (!samples.length) {
      continue;
    }

    const playbackState = getTrackPlaybackState(sensorID);
    const playhead = clamp(playbackState.pointIndex, 0, samples.length - 1);
    const reading = samples[playhead];
    if (!reading) {
      continue;
    }
    const midi = Math.round(aqiToMidi(reading.value, sensorIndex));
    activeEntries.push({
      note: Tone.Frequency(midi, "midi").toNote(),
      value: reading.value,
      sensorIndex,
      sensorID,
      playhead,
      historyLength: samples.length,
    });

    audioState.playheadBySensorId[sensorID] = playhead;
    audioState.lastPlaybackBySensorId[sensorID] = {
      ts: now,
      notes: [Tone.Frequency(midi, "midi").toNote()],
      historyLength: samples.length,
      playhead,
      pointIndex: playhead,
    };
    pulseSensor(sensorIndex);
  }

  if (!activeEntries.length) {
    return;
  }

  const durationSeconds = Math.max(3.2, stepSeconds * 2.2);
  for (let i = 0; i < activeEntries.length; i += 1) {
    const entry = activeEntries[i];
    const synth = getSynthForAqi(entry.value);
    if (synth) {
      synth.triggerAttackRelease(entry.note, durationSeconds, time + i * 0.035, 0.26 + 0.3 * getChannelLevel(entry.sensorID));
    }
  }
}

function hasInstrumentBank() {
  return Object.values(audioState.trackSynthBySensorId).some(Boolean);
}

function getSynthForAqi(aqi) {
  return null;
}

function getDesiredAudibleCount(activeCount) {
  if (activeCount <= 0) {
    return 0;
  }
  if (activeCount <= audioState.minConcurrentAudible) {
    return activeCount;
  }
  return clamp(Math.ceil(activeCount * 0.5), audioState.minConcurrentAudible, audioState.maxConcurrentAudible);
}

function updateAudibleMixTargets(activeIndices) {
  const activeSet = new Set(activeIndices.map((index) => state.sensorIDs[index]));

  for (let i = 0; i < state.sensorIDs.length; i += 1) {
    const sensorID = state.sensorIDs[i];
    const channelState = audioState.channelStateBySensorId[sensorID];
    if (!channelState) {
      continue;
    }
    channelState.target = activeSet.has(sensorID) ? channelState.target : 0;
  }

  const rankedIndices = rankSensorIndicesByChange(activeIndices);
  const selectedIDs = new Set();
  const limit = Math.min(getDesiredAudibleCount(activeIndices.length), rankedIndices.length);
  for (let i = 0; i < limit; i += 1) {
    selectedIDs.add(state.sensorIDs[rankedIndices[i]]);
  }

  for (let i = 0; i < state.sensorIDs.length; i += 1) {
    const sensorID = state.sensorIDs[i];
    const channelState = audioState.channelStateBySensorId[sensorID];
    if (!channelState) {
      continue;
    }
    channelState.target = selectedIDs.has(sensorID) ? 1 : 0;
  }
}

function updateAllChannelLevels(stepSeconds) {
  for (let i = 0; i < state.sensorIDs.length; i += 1) {
    const sensorID = state.sensorIDs[i];
    const channelState = audioState.channelStateBySensorId[sensorID];
    if (!channelState) {
      continue;
    }
    const fadeSeconds = channelState.target > channelState.level ? 4.5 : 6.5;
    const alpha = clamp(stepSeconds / fadeSeconds, 0.05, 0.55);
    channelState.level += (channelState.target - channelState.level) * alpha;
    channelState.level = clamp(channelState.level, 0, 1);
  }
}

function getChannelLevel(sensorID) {
  const channelState = audioState.channelStateBySensorId[sensorID];
  if (!channelState) {
    return 0;
  }
  return clamp(channelState.level, 0, 1);
}

function isSensorAudible(sensorID, index, allowStale) {
  if (!audioState.isPlaying) {
    return false;
  }
  if (index < 0 || index >= state.sensorDrawers.length) {
    return false;
  }
  if (!allowStale && state.sensorDrawers[index].isStale()) {
    return false;
  }
  return getChannelLevel(sensorID) >= audioState.audibleThreshold;
}

function getCompositionOffsets(sensorID) {
  const voiceCount = getCompositionVoiceCount(sensorID);
  if (voiceCount <= 1) {
    return [0];
  }
  if (voiceCount === 2) {
    return [0, 4];
  }
  if (voiceCount === 3) {
    return [0, 4, 9];
  }
  return [0, 4, 9, 16];
}

function getCompositionVoiceCount(sensorID) {
  const elapsedMs = Math.max(0, Date.now() - audioState.playbackStartedAtMs);
  let voices = 1;
  if (elapsedMs > 45 * 1000) {
    voices = 2;
  }
  if (elapsedMs > 2 * 60 * 1000) {
    voices = 3;
  }
  if (elapsedMs > 4 * 60 * 1000) {
    voices = 4;
  }
  if (getRecentChangeScoreById(sensorID) > 18) {
    voices += 1;
  }
  return clamp(voices, 1, 4);
}

function rankSensorIndicesByChange(indices) {
  return indices.slice().sort((indexA, indexB) => {
    const scoreA = getRecentChangeScoreById(state.sensorIDs[indexA]);
    const scoreB = getRecentChangeScoreById(state.sensorIDs[indexB]);
    if (scoreA === scoreB) {
      return indexA - indexB;
    }
    return scoreB - scoreA;
  });
}

function getRecentChangeScoreById(sensorID) {
  const history = getWindowedHistory(sensorID);
  if (history.length < 2) {
    return 0;
  }

  const sampleSize = Math.min(8, history.length);
  const start = history.length - sampleSize;
  let total = 0;
  let latestDelta = 0;

  for (let i = start + 1; i < history.length; i += 1) {
    const delta = Math.abs(history[i].value - history[i - 1].value);
    total += delta;
    latestDelta = delta;
  }

  return total / Math.max(1, sampleSize - 1) + latestDelta * 0.8;
}

function ensureVoiceCount(midiValues, targetVoices) {
  const result = midiValues.slice();
  if (!result.length) {
    return result;
  }
  const intervals = [0, 5, 7, 12, 14];
  let intervalIndex = 0;
  while (result.length < targetVoices) {
    result.push(clamp(result[0] + intervals[intervalIndex % intervals.length], 30, 88));
    intervalIndex += 1;
  }
  return result;
}

function startPolling() {
  stopPolling();
  pollingState.inactiveTimer = setInterval(() => {
    pollInactiveSensors();
  }, pollingState.inactiveFixedMs);
  scheduleActivePollingTick();
}

function stopPolling() {
  if (pollingState.activeTimer !== null) {
    clearTimeout(pollingState.activeTimer);
    pollingState.activeTimer = null;
  }
  if (pollingState.inactiveTimer !== null) {
    clearInterval(pollingState.inactiveTimer);
    pollingState.inactiveTimer = null;
  }
}

function scheduleActivePollingTick() {
  if (pollingState.activeTimer !== null) {
    clearTimeout(pollingState.activeTimer);
    pollingState.activeTimer = null;
  }
  const activeCount = Math.max(1, getActiveSensorIndices().length);
  const tickMs = Math.max(3000, Math.floor(60000 / activeCount));
  pollingState.activeTimer = setTimeout(runActivePollingTick, tickMs);
}

function runActivePollingTick() {
  const activeIndices = getActiveSensorIndices();
  if (!activeIndices.length) {
    scheduleActivePollingTick();
    return;
  }
  const slot = pollingState.activeCursor % activeIndices.length;
  pollingState.activeCursor = (pollingState.activeCursor + 1) % activeIndices.length;
  pollSensorByIndex(activeIndices[slot], false).finally(() => {
    scheduleActivePollingTick();
  });
}

function pollInactiveSensors() {
  const activeSet = new Set(getActiveSensorIndices());
  for (let i = 0; i < state.sensorDrawers.length; i += 1) {
    if (!activeSet.has(i)) {
      pollSensorByIndex(i, false);
    }
  }
}

function pollAllSensors(force) {
  const tasks = [];
  for (let i = 0; i < state.sensorDrawers.length; i += 1) {
    tasks.push(pollSensorByIndex(i, force));
  }
  return Promise.all(tasks);
}

function pollSensorByIndex(index, force) {
  const drawer = state.sensorDrawers[index];
  const meta = state.sensorMeta[index];
  if (!drawer || !meta) {
    return Promise.resolve(false);
  }

  const now = Date.now();
  if (!force && now - meta.lastPolledAtMs < pollingState.minPollGapMs) {
    return Promise.resolve(false);
  }
  if (meta.isPolling) {
    return Promise.resolve(false);
  }

  const url = state.sensorFeedUrls[drawer.sensorID];
  if (!url) {
    return Promise.resolve(false);
  }

  meta.isPolling = true;
  meta.lastPolledAtMs = now;

  return fetch(url)
    .then((response) => response.json())
    .then((data) => {
      const sensorID = extractNumber(data.key);
      const sensorIndex = findSensorIndex(sensorID);
      if (sensorIndex < 0) {
        return;
      }

      const sensorDrawer = state.sensorDrawers[sensorIndex];
      const value = parseInt(data.last_value, 10);
      const parsedValue = Number.isFinite(value) ? value : 0;
      const updatedAt = data.updated_at;
      const sampleTs = Date.parse(updatedAt);

      sensorDrawer.setData("aqi", parsedValue);
      sensorDrawer.setLastUpdated(updatedAt);
      addGraphPoint(sensorID, parsedValue, now);

      const didAdd = addHistoryReading(sensorID, parsedValue, Number.isFinite(sampleTs) ? sampleTs : now);
      if (didAdd) {
        triggerNewDataDing(sensorIndex, parsedValue);
      }
    })
    .catch((error) => {
      console.warn("Failed to fetch sensor data", url, error);
    })
    .finally(() => {
      meta.isPolling = false;
    });
}

function addHistoryReading(sensorID, value, ts) {
  if (!Number.isFinite(value) || !Number.isFinite(ts)) {
    return false;
  }

  const history = audioState.historyBySensorId[sensorID] || [];
  const last = history[history.length - 1];
  if (last && last.ts === ts && last.value === value) {
    return false;
  }

  history.push({ ts, value });
  audioState.lastDataChangeBySensorId[sensorID] = Date.now();

  const cutoff = Date.now() - audioState.historyWindowMs;
  while (history.length > 0 && history[0].ts < cutoff) {
    history.shift();
  }

  audioState.historyBySensorId[sensorID] = history;
  if (audioState.playheadBySensorId[sensorID] >= history.length) {
    audioState.playheadBySensorId[sensorID] = 0;
  }

  updateAccruedDurationReadout();
  return true;
}

function addGraphPoint(sensorID, value, ts) {
  const points = visualState.graphPointsBySensorId[sensorID] || [];
  const last = points[points.length - 1];
  if (last && last.ts === ts && last.value === value) {
    return;
  }
  points.push({ ts, value });
  while (points.length > 48) {
    points.shift();
  }
  visualState.graphPointsBySensorId[sensorID] = points;
}

function triggerNewDataDing(sensorIndex, aqi) {
  if (!audioState.isPlaying || !audioState.audioUnlocked || !audioState.synths.ding || !window.Tone) {
    return;
  }
  const midi = clamp(Math.round(aqiToMidi(aqi, sensorIndex)) + 12, 48, 96);
  audioState.synths.ding.triggerAttackRelease(Tone.Frequency(midi, "midi").toNote(), "16n", Tone.now(), 0.18);
}

function getWindowedHistory(sensorID) {
  const history = audioState.historyBySensorId[sensorID] || [];
  const cutoff = Date.now() - audioState.historyWindowMs;
  return history.filter((reading) => reading.ts >= cutoff);
}

function getDisplaySamples(sensorID, fallbackValue) {
  const graphPoints = visualState.graphPointsBySensorId[sensorID] || [];
  if (graphPoints.length) {
    return graphPoints.slice();
  }
  return [{ value: Number.isFinite(fallbackValue) ? fallbackValue : 0 }];
}

function getPlaybackSamples(sensorID) {
  const sensorIndex = findSensorIndex(sensorID);
  const fallbackValue = sensorIndex >= 0 ? state.sensorDrawers[sensorIndex].aqi : 0;
  return getDisplaySamples(sensorID, fallbackValue);
}

function getActiveSensorIndices() {
  const active = [];
  for (let i = 0; i < state.sensorDrawers.length; i += 1) {
    if (!state.sensorDrawers[i].isStale()) {
      active.push(i);
    }
  }
  return active;
}

function findSensorIndex(sensorID) {
  for (let i = 0; i < state.sensorDrawers.length; i += 1) {
    if (state.sensorDrawers[i].sensorID === sensorID) {
      return i;
    }
  }
  return -1;
}

function getAccruedDurationMs() {
  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = Number.NEGATIVE_INFINITY;
  Object.keys(audioState.historyBySensorId).forEach((sensorID) => {
    const history = audioState.historyBySensorId[sensorID];
    if (!history || !history.length) {
      return;
    }
    minTs = Math.min(minTs, history[0].ts);
    maxTs = Math.max(maxTs, history[history.length - 1].ts);
  });
  if (!Number.isFinite(minTs) || !Number.isFinite(maxTs) || maxTs <= minTs) {
    return 0;
  }
  return maxTs - minTs;
}

function updateAccruedDurationReadout() {
  if (!audioState.accruedDurationEl) {
    return;
  }
  audioState.accruedDurationEl.textContent = `Time: ${formatDurationShort(getAccruedDurationMs())}`;
}

function updateBpmReadout() {
  if (!audioState.bpmReadoutEl) {
    return;
  }
  audioState.bpmReadoutEl.textContent = `${Math.round(audioState.bpm)} BPM`;
}

function formatDurationShort(durationMs) {
  const totalMinutes = Math.floor(Math.max(0, durationMs) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

function pulseSensor(index) {
  if (audioState.sensorPulseUntil[index] !== undefined) {
    audioState.sensorPulseUntil[index] = performance.now() + audioState.pulseDurationMs;
  }
}

function extractNumber(key) {
  const idPart = key.split(".")[0];
  return parseInt(idPart.split("-")[1], 10);
}

function aqiToMidi(aqi, sensorIndex) {
  const range = Math.max(1, state.aqMaxVal - state.aqMinVal);
  const t = clamp(aqi, state.aqMinVal, state.aqMaxVal) / range;
  const baseIndex = Math.round(t * (audioState.scale.length - 1));
  const offset = (sensorIndex * 2) % audioState.scale.length;
  const scaleIndex = (baseIndex + offset) % audioState.scale.length;
  const sensorCount = Math.max(1, state.sensorDrawers.length);
  const octaveSlots = 3;
  const slot = sensorCount === 1 ? 0 : Math.floor((sensorIndex / Math.max(1, sensorCount - 1)) * (octaveSlots - 1));
  let midi = audioState.baseMidi + audioState.scale[scaleIndex] + slot * 12;

  if (t < 0.5) {
    midi -= Math.round(((0.5 - t) / 0.5) * 10);
  }

  return clamp(midi, 24, 96);
}

function getMasterTrackMidi(sensorID, sensorIndex, value) {
  const samples = getPlaybackSamples(sensorID);
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < samples.length; i += 1) {
    const sampleValue = samples[i] ? samples[i].value : NaN;
    if (!Number.isFinite(sampleValue)) {
      continue;
    }
    minValue = Math.min(minValue, sampleValue);
    maxValue = Math.max(maxValue, sampleValue);
  }

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    minValue = state.aqMinVal;
    maxValue = state.aqMaxVal;
  }
  if (minValue === maxValue) {
    minValue -= 1;
    maxValue += 1;
  }

  const range = getChannelMidiRange(sensorIndex);
  return Math.round(clamp(mapRange(value, minValue, maxValue, range.min, range.max), range.min, range.max));
}

function getChannelMidiRange(index) {
  const safeIndex = Math.max(0, index);
  const min = 12 + safeIndex * 12;
  return { min, max: min + 12 };
}

function getTrackRoleKey(sensorIndex) {
  const safeIndex = clamp(Math.max(0, sensorIndex), 0, TRACK_ROLE_KEYS.length - 1);
  return TRACK_ROLE_KEYS[safeIndex];
}

function getTrackInstrumentOptions(sensorIndex) {
  return TRACK_INSTRUMENT_OPTIONS[getTrackRoleKey(sensorIndex)] || TRACK_INSTRUMENT_OPTIONS.low;
}

function getTrackInstrumentIndex(sensorID, sensorIndex) {
  const options = getTrackInstrumentOptions(sensorIndex);
  const storedIndex = audioState.trackInstrumentIndexBySensorId[sensorID];
  return clamp(Number.isFinite(storedIndex) ? storedIndex : 0, 0, Math.max(0, options.length - 1));
}

function getTrackInstrumentConfig(sensorID, sensorIndex) {
  const options = getTrackInstrumentOptions(sensorIndex);
  return options[getTrackInstrumentIndex(sensorID, sensorIndex)] || options[0];
}

function getTrackInstrumentLabel(sensorID, sensorIndex) {
  return getTrackInstrumentConfig(sensorID, sensorIndex).label;
}

function getTrackSynth(sensorID, sensorIndex) {
  const existing = audioState.trackSynthBySensorId[sensorID];
  if (existing) {
    return existing;
  }
  const created = createTrackInstrumentForSensor(sensorID, sensorIndex);
  audioState.trackSynthBySensorId[sensorID] = created;
  return created;
}

function getTrackTempoMultiplier(sensorID) {
  const primaryTrackIndex = getPrimaryTrackIndex();
  const sensorIndex = findSensorIndex(sensorID);
  if (sensorIndex < 0 || sensorIndex === primaryTrackIndex) {
    return 1;
  }
  const storedIndex = audioState.trackTempoIndexBySensorId[sensorID];
  const safeIndex = clamp(Number.isFinite(storedIndex) ? storedIndex : 3, 0, TRACK_TEMPO_MULTIPLIERS.length - 1);
  return TRACK_TEMPO_MULTIPLIERS[safeIndex];
}

function getTrackTempoLabel(sensorID) {
  return formatTempoMultiplier(getTrackTempoMultiplier(sensorID));
}

function formatTempoMultiplier(multiplier) {
  if (multiplier === 0.125) {
    return "x1/8";
  }
  if (multiplier === 0.25) {
    return "x1/4";
  }
  if (multiplier === 0.5) {
    return "x1/2";
  }
  if (multiplier === 1.5) {
    return "x1.5";
  }
  if (multiplier === 2) {
    return "x2";
  }
  if (multiplier === 4) {
    return "x4";
  }
  return "x1";
}

function cycleTrackTempo(sensorID) {
  const currentIndex = clamp(
    Number.isFinite(audioState.trackTempoIndexBySensorId[sensorID]) ? audioState.trackTempoIndexBySensorId[sensorID] : 3,
    0,
    TRACK_TEMPO_MULTIPLIERS.length - 1
  );
  audioState.trackTempoIndexBySensorId[sensorID] = (currentIndex + 1) % TRACK_TEMPO_MULTIPLIERS.length;
  audioState.lastTriggeredStepBySensorId[sensorID] = 0;
}

function cycleTrackInstrument(sensorID) {
  const sensorIndex = findSensorIndex(sensorID);
  if (sensorIndex < 0) {
    return;
  }
  const options = getTrackInstrumentOptions(sensorIndex);
  const currentIndex = getTrackInstrumentIndex(sensorID, sensorIndex);
  audioState.trackInstrumentIndexBySensorId[sensorID] = (currentIndex + 1) % options.length;
  recreateTrackInstrument(sensorID, sensorIndex);
}

function recreateTrackInstrument(sensorID, sensorIndex) {
  const existing = audioState.trackSynthBySensorId[sensorID];
  if (existing) {
    if (typeof existing.releaseAll === "function") {
      existing.releaseAll();
    }
    existing.dispose();
  }
  audioState.trackSynthBySensorId[sensorID] = null;
  if (audioState.audioUnlocked && audioState.toneReady && window.Tone) {
    audioState.trackSynthBySensorId[sensorID] = createTrackInstrumentForSensor(sensorID, sensorIndex);
  }
}

function createTrackInstrumentForSensor(sensorID, sensorIndex) {
  const config = getTrackInstrumentConfig(sensorID, sensorIndex);
  return config && typeof config.create === "function" ? config.create() : null;
}

function withVolume(synth, value) {
  if (synth && synth.volume) {
    synth.volume.value = value;
  }
  return synth;
}

function aqiToVelocity(aqi) {
  const range = Math.max(1, state.aqMaxVal - state.aqMinVal);
  const t = clamp(aqi, state.aqMinVal, state.aqMaxVal) / range;
  return 0.35 + t * 0.5;
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) {
    return outMin;
  }
  const normalized = (value - inMin) / (inMax - inMin);
  return outMin + normalized * (outMax - outMin);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function positiveModulo(value, modulus) {
  if (!Number.isFinite(modulus) || modulus <= 0) {
    return 0;
  }
  return ((value % modulus) + modulus) % modulus;
}

function hexToRgb(hex) {
  const normalized = (hex || "#000000").replace("#", "");
  const value = parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function lerpColor(colorA, colorB, amount) {
  const t = clamp(amount, 0, 1);
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function getAqiColor(aqi) {
  const { sage, yellow, orange } = state.palette;
  if (aqi <= 90) {
    return lerpColor(sage, yellow, clamp(aqi / 90, 0, 1));
  }
  return lerpColor(yellow, orange, clamp((aqi - 90) / 160, 0, 1));
}

class SensorDrawer {
  constructor(sensorID, locationName, index) {
    this.sensorID = sensorID;
    this.locationName = locationName;
    this.index = index;
    this.aqi = 0;
    this.updatedTime = "-";
    this.updatedAtMs = null;
  }

  setData(_key, value) {
    this.aqi = parseInt(value, 10);
  }

  setLastUpdated(updatedAt) {
    this.updatedTime = this.formatTime(updatedAt);
    const parsed = Date.parse(updatedAt);
    this.updatedAtMs = Number.isNaN(parsed) ? null : parsed;
  }

  isStale() {
    if (!Number.isFinite(this.updatedAtMs)) {
      return false;
    }
    return Date.now() - this.updatedAtMs > state.staleThresholdMs;
  }

  formatTime(updatedTime) {
    const updatedDate = new Date(updatedTime);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[updatedDate.getMonth()];
    const day = updatedDate.getDate();
    let hours = updatedDate.getHours();
    const minutes = updatedDate.getMinutes();
    const period = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const minuteLabel = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${month} ${day} ${hours}:${minuteLabel} ${period}`;
  }
}

new p5((p) => {
  p.setup = () => {
    const canvas = p.createCanvas(p.windowWidth, getCanvasHeight());
    canvas.parent("sketch-root");
    visualState.canvasEl = canvas.elt;
    visualState.canvasEl.addEventListener("pointerdown", (event) => {
      const rect = visualState.canvasEl.getBoundingClientRect();
      handleCanvasPress(event.clientX - rect.left, event.clientY - rect.top);
    });
    p.noStroke();
    init();
    p.resizeCanvas(p.windowWidth, getCanvasHeight());
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, getCanvasHeight());
  };

  p.draw = () => {
    drawSketch(p);
  };

});

function getCanvasHeight() {
  const stripHeight = audioState.bottomStripEl ? audioState.bottomStripEl.offsetHeight : 0;
  return Math.max(560, window.innerHeight - stripHeight);
}

function drawSketch(p) {
  if (!state.drawReady || !state.visualsReady) {
    p.background(28, 22, 18);
    return;
  }
  drawBackgroundGradient(p);
  drawDustField(p);
  drawEnergyBursts(p);
  drawSensorPanels(p);
}

function drawBackgroundGradient(p) {
  for (let y = 0; y < p.height; y += 10) {
    const mix = y / Math.max(1, p.height);
    const base = lerpColor(state.palette.brown, state.palette.orange, mix * 0.7);
    p.fill(base.r, base.g, base.b, 255);
    p.rect(0, y, p.width, 10);
  }
}

function drawDustField(p) {
  const dust = hexToRgb(state.palette.white);
  const time = p.millis() * 0.001;
  visualState.particles.forEach((particle, index) => {
    particle.y -= particle.speed;
    particle.x += Math.sin(time + particle.seed + index * 0.03) * particle.drift;
    if (particle.y < -0.05) {
      particle.y = 1.05;
      particle.x = Math.random();
    }
    if (particle.x < -0.05) {
      particle.x = 1.05;
    }
    if (particle.x > 1.05) {
      particle.x = -0.05;
    }
    const alpha = 24 + 18 * Math.sin(time * 0.8 + particle.seed);
    p.fill(dust.r, dust.g, dust.b, alpha);
    p.circle(particle.x * p.width, particle.y * p.height, particle.size);
  });
}

function drawSensorPanels(p) {
  const marginX = Math.min(28, p.width * 0.05);
  const panelWidth = p.width - marginX * 2;
  const bottomReserve = p.width <= 820 ? 170 : 134;
  const rowHeight = Math.max(
    112,
    Math.min(136, (p.height - state.headerHeight - bottomReserve) / Math.max(1, state.sensorDrawers.length))
  );
  const titleColor = hexToRgb(state.palette.white);
  const bodyColor = hexToRgb(state.palette.brown);
  visualState.aqHitboxes = [];
  visualState.instrumentHitboxes = [];
  visualState.tempoHitboxes = [];

  p.fill(titleColor.r, titleColor.g, titleColor.b, 242);
  p.textAlign(p.LEFT, p.TOP);
  p.textSize(p.width <= 600 ? 28 : 34);
  p.textStyle(p.BOLD);
  p.text(state.title, marginX, 26);
  p.textSize(14);
  p.textStyle(p.NORMAL);
  p.fill(state.palette.yellow);
  p.text("by BioSymphonic", marginX + 6, 54);
  const instrumentColumnOffset = p.width <= 600 ? 114 : 236;
  const instrumentColumnX = marginX + panelWidth - instrumentColumnOffset;
  const tempoColumnX = marginX + panelWidth - 18;
  p.textSize(10);
  p.fill(titleColor.r, titleColor.g, titleColor.b, 132);
  p.textAlign(p.LEFT, p.TOP);
  p.text("Instrument", instrumentColumnX, state.headerHeight - 12);
  p.textAlign(p.RIGHT, p.TOP);
  p.text("Tempo", tempoColumnX, state.headerHeight - 12);

  const visibleDrawers = state.sensorDrawers
    .map((drawer, index) => ({ drawer, index }))
    .filter(({ drawer }) => !drawer.isStale());
  const primaryTrackIndex = getPrimaryTrackIndex();

  visibleDrawers.forEach(({ drawer, index }, visibleIndex) => {
    const y = state.headerHeight + 4 + visibleIndex * rowHeight;
    const panelHeight = rowHeight - 12;
    const panelColor = getAqiColor(drawer.aqi);

    p.push();
    p.noStroke();
    p.fill(bodyColor.r, bodyColor.g, bodyColor.b, 148);
    drawRoundedRect(p, marginX, y, panelWidth, panelHeight, 26);

    p.fill(panelColor.r, panelColor.g, panelColor.b, 230);
    drawRoundedRect(p, marginX + 10, y + 12, 84, panelHeight - 24, 8);
    visualState.aqHitboxes.push({
      sensorID: drawer.sensorID,
      x: marginX + 10,
      y: y + 12,
      width: 84,
      height: panelHeight - 24,
    });

    if (index === primaryTrackIndex) {
      p.noFill();
      p.stroke(132, 132, 132, 220);
      p.strokeWeight(2);
      drawRoundedRect(p, marginX + 22, y + 22, 60, panelHeight - 44, 8);
      p.noStroke();
    }

    p.fill(state.palette.white);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(drawer.aqi >= 100 ? 26 : 30);
    p.textStyle(p.BOLD);
    p.text(`${Math.round(drawer.aqi)}`, marginX + 52, y + 12 + (panelHeight - 24) * 0.5);

    p.textAlign(p.LEFT, p.TOP);
    p.textStyle(p.BOLD);
    p.textSize(22);
    p.fill(titleColor.r, titleColor.g, titleColor.b, 240);
    p.text(drawer.locationName, marginX + 122, y + 16);
    const instrumentLabel = getTrackInstrumentLabel(drawer.sensorID, index);
    const instrumentX = instrumentColumnX;
    const instrumentY = y + 18;
    p.textAlign(p.LEFT, p.TOP);
    p.textStyle(p.NORMAL);
    p.textSize(12);
    p.fill(titleColor.r, titleColor.g, titleColor.b, 156);
    const instrumentWidth = p.textWidth(instrumentLabel);
    p.text(instrumentLabel, instrumentX, instrumentY);
    visualState.instrumentHitboxes.push({
      sensorID: drawer.sensorID,
      x: instrumentX - 4,
      y: instrumentY - 2,
      width: instrumentWidth + 8,
      height: 18,
    });
    if (index !== primaryTrackIndex) {
      const tempoLabel = getTrackTempoLabel(drawer.sensorID);
      const tempoX = marginX + panelWidth - 18;
      const tempoY = y + 20;
      p.textAlign(p.RIGHT, p.TOP);
      p.textStyle(p.NORMAL);
      p.textSize(12);
      p.fill(titleColor.r, titleColor.g, titleColor.b, 168);
      const tempoWidth = p.textWidth(tempoLabel);
      p.text(tempoLabel, tempoX, tempoY);
      visualState.tempoHitboxes.push({
        sensorID: drawer.sensorID,
        x: tempoX - tempoWidth - 6,
        y: tempoY - 2,
        width: tempoWidth + 12,
        height: 18,
      });
    }
    p.textStyle(p.NORMAL);
    p.textSize(12);
    p.textAlign(p.LEFT, p.TOP);
    p.fill(titleColor.r, titleColor.g, titleColor.b, 168);
    drawHistoryWave(p, drawer.sensorID, marginX + 122, y + 42, panelWidth - 156, panelHeight - 52, panelColor);

    if (state.showDetails) {
      p.text(`Updated ${drawer.updatedTime}`, marginX + 122, y + panelHeight - 24);
    }

    p.pop();
  });
}

function drawRoundedRect(p, x, y, width, height, radius) {
  p.rect(x, y, width, height, radius);
}

function drawHistoryWave(p, sensorID, x, y, width, height, panelColor) {
  const samples = getPlaybackSamples(sensorID);
  const boxHeight = Math.max(24, height);
  const waveTop = y;
  const waveBottom = y + boxHeight;
  const dataTop = waveTop + 10;
  const dataBottom = waveBottom - 10;

  p.push();
  p.noStroke();
  p.fill(panelColor.r, panelColor.g, panelColor.b, 14);
  drawRoundedRect(p, x, y, width, boxHeight, 10);
  p.drawingContext.save();
  p.drawingContext.beginPath();
  p.drawingContext.rect(x, waveTop, width, boxHeight);
  p.drawingContext.clip();
  p.noFill();
  p.stroke(255, 255, 255, 22);
  p.strokeWeight(1);
  p.line(x, dataBottom, x + width, dataBottom);

  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < samples.length; i += 1) {
    minValue = Math.min(minValue, samples[i].value);
    maxValue = Math.max(maxValue, samples[i].value);
  }
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    minValue = 0;
    maxValue = 1;
  }
  if (minValue === maxValue) {
    minValue -= 1;
    maxValue += 1;
  }

  const wavePoints = getWavePoints(samples, x, width, dataTop, dataBottom, minValue, maxValue);
  p.stroke(panelColor.r, panelColor.g, panelColor.b, 210);
  p.strokeWeight(2);
  const markerFractions = getMarkerFractions(samples.length);
  p.beginShape();
  for (let i = 0; i < wavePoints.length; i += 1) {
    p.vertex(wavePoints[i].x, wavePoints[i].y);
  }
  p.endShape();

  const playbackState = getTrackPlaybackState(sensorID);
  const headState = getSweepHeadState(wavePoints, playbackState.headPhase);

  p.noStroke();
  for (let i = 0; i < samples.length; i += 1) {
    const glowAmount = getMarkerGlowAmount(i, playbackState.trackFloat, samples.length);
    const isRepeatedDot = isRepeatedSampleValue(samples, i);
    const px = x + markerFractions[i] * width;
    const py = dataBottom - mapRange(samples[i].value, minValue, maxValue, 0, dataBottom - dataTop);
    if (glowAmount > 0) {
      p.drawingContext.shadowBlur = 10 + glowAmount * 18;
      p.drawingContext.shadowColor = `rgba(${panelColor.r}, ${panelColor.g}, ${panelColor.b}, ${0.25 + glowAmount * 0.5})`;
    } else {
      p.drawingContext.shadowBlur = 0;
    }
    if (isRepeatedDot) {
      p.noFill();
      p.stroke(214, 208, 187, 120 + glowAmount * 70);
      p.strokeWeight(1.5 + glowAmount * 1.2);
      p.circle(px, py, 8 + glowAmount * 4);
      p.noStroke();
    } else {
      p.fill(panelColor.r, panelColor.g, panelColor.b, 180 + glowAmount * 75);
      p.circle(px, py, 8 + glowAmount * 4);
    }
  }
  p.drawingContext.shadowBlur = 0;

  p.push();
  p.translate(headState.x, headState.y);
  p.rectMode(p.CENTER);
  p.noStroke();
  p.fill(panelColor.r, panelColor.g, panelColor.b, 204);
  p.rect(0, 0, 12, 20, 3);
  p.pop();

  p.drawingContext.restore();
  p.pop();
}

function getMarkerFractions(sampleCount) {
  if (sampleCount <= 1) {
    return [0.5];
  }
  const fractions = [];
  for (let i = 0; i < sampleCount; i += 1) {
    fractions.push((i + 0.5) / sampleCount);
  }
  return fractions;
}

function getWavePoints(samples, x, width, dataTop, dataBottom, minValue, maxValue) {
  if (samples.length <= 1) {
    const y = dataBottom - mapRange(samples[0].value, minValue, maxValue, 0, dataBottom - dataTop);
    return [
      { x, y },
      { x: x + width, y },
    ];
  }

  const markerFractions = getMarkerFractions(samples.length);
  const points = [];
  const firstY = dataBottom - mapRange(samples[0].value, minValue, maxValue, 0, dataBottom - dataTop);
  points.push({ x, y: firstY });
  for (let i = 0; i < samples.length; i += 1) {
    const px = x + markerFractions[i] * width;
    const py = dataBottom - mapRange(samples[i].value, minValue, maxValue, 0, dataBottom - dataTop);
    points.push({ x: px, y: py });
  }
  const lastY =
    dataBottom - mapRange(samples[samples.length - 1].value, minValue, maxValue, 0, dataBottom - dataTop);
  points.push({ x: x + width, y: lastY });
  return points;
}

function isRepeatedSampleValue(samples, index) {
  if (!samples.length || index < 0 || index >= samples.length) {
    return false;
  }
  if (samples.length <= 1 || index === 0) {
    return false;
  }
  const currentSample = samples[index];
  const previousSample = samples[index - 1];
  if (!currentSample || !previousSample) {
    return false;
  }
  return currentSample.value === previousSample.value;
}

function getSweepHeadState(wavePoints, sweepPhase) {
  if (!wavePoints.length) {
    return { x: 0, y: 0, angle: 0 };
  }
  if (wavePoints.length === 1) {
    return { x: wavePoints[0].x, y: wavePoints[0].y, angle: 0 };
  }

  const minX = wavePoints[0].x;
  const maxX = wavePoints[wavePoints.length - 1].x;
  const targetX = minX + clamp(sweepPhase, 0, 1) * (maxX - minX);

  for (let i = 1; i < wavePoints.length; i += 1) {
    const left = wavePoints[i - 1];
    const right = wavePoints[i];
    if (targetX > right.x && i < wavePoints.length - 1) {
      continue;
    }
    const span = Math.max(1e-6, right.x - left.x);
    const localT = clamp((targetX - left.x) / span, 0, 1);
    return {
      x: left.x + (right.x - left.x) * localT,
      y: left.y + (right.y - left.y) * localT,
      angle: Math.atan2(right.y - left.y, right.x - left.x),
    };
  }

  const tailLeft = wavePoints[wavePoints.length - 2];
  const tailRight = wavePoints[wavePoints.length - 1];
  return {
    x: tailRight.x,
    y: tailRight.y,
    angle: Math.atan2(tailRight.y - tailLeft.y, tailRight.x - tailLeft.x),
  };
}

function getPointIndexForHistory(playhead, historyLength) {
  if (!Number.isFinite(playhead) || historyLength <= 0) {
    return -1;
  }
  if (historyLength <= 1) {
    return 0;
  }
  return clamp(Math.round((playhead / Math.max(1, historyLength - 1)) * 47), 0, 47);
}

function getPlaybackPointIndex(playbackData, sampleCount) {
  if (!playbackData || sampleCount <= 0) {
    return -1;
  }
  if (sampleCount <= 1) {
    return 0;
  }
  if (Number.isFinite(playbackData.playhead) && Number.isFinite(playbackData.historyLength) && playbackData.historyLength > 1) {
    return clamp(
      Math.round((playbackData.playhead / Math.max(1, playbackData.historyLength - 1)) * (sampleCount - 1)),
      0,
      sampleCount - 1
    );
  }
  if (Number.isFinite(playbackData.pointIndex)) {
    return clamp(Math.round(playbackData.pointIndex), 0, sampleCount - 1);
  }
  return -1;
}

function getVisualSweepPhase(sensorID, sensorIndex, sampleCount) {
  return getTrackPlaybackState(sensorID).headPhase;
}

function getTrackBeatCount(sensorID) {
  return Math.max(1, getPlaybackSamples(sensorID).length);
}

function getTrackPlaybackState(sensorID, nowMs = Date.now()) {
  const trackBeatCount = getTrackBeatCount(sensorID);
  const beatDurationMs = getPlaybackStepSeconds() * 1000;
  const elapsedBeats =
    audioState.isPlaying && audioState.playbackStartedAtMs > 0 && beatDurationMs > 0
      ? Math.max(0, (nowMs - audioState.playbackStartedAtMs) / beatDurationMs)
      : 0;
  const tempoMultiplier = getTrackTempoMultiplier(sensorID);
  const elapsedTrackBeats = elapsedBeats * tempoMultiplier;
  const wrappedTrackFloat = positiveModulo(elapsedTrackBeats, trackBeatCount);
  const centeredTrackFloat = positiveModulo(wrappedTrackFloat + 0.5, trackBeatCount);
  const pointIndex = trackBeatCount <= 1 ? 0 : Math.floor(centeredTrackFloat) % trackBeatCount;
  const headPhase = trackBeatCount <= 1 ? wrappedTrackFloat : centeredTrackFloat / trackBeatCount;
  const triggerStep = Math.floor(elapsedTrackBeats + 0.5);

  return {
    trackBeatCount,
    masterBeatCount: trackBeatCount,
    elapsedBeats,
    elapsedTrackBeats,
    tempoMultiplier,
    trackFloat: centeredTrackFloat,
    pointIndex,
    headPhase: clamp(headPhase, 0, 1),
    triggerStep,
  };
}

function getMarkerGlowAmount(markerIndex, trackFloat, sampleCount) {
  const markerCenter = markerIndex + 0.5;
  const directDistance = Math.abs(trackFloat - markerCenter);
  const wrappedDistance = Math.min(directDistance, sampleCount - directDistance);
  return clamp(1 - wrappedDistance / 0.22, 0, 1);
}

function getPrimaryTrackIndex() {
  if (visualState.primaryTrackSensorID !== null) {
    const selectedIndex = findSensorIndex(visualState.primaryTrackSensorID);
    if (selectedIndex >= 0 && !state.sensorDrawers[selectedIndex].isStale()) {
      return selectedIndex;
    }
  }
  const activeIndices = getActiveSensorIndices();
  if (activeIndices.length) {
    return activeIndices[0];
  }
  return state.sensorDrawers.length ? 0 : -1;
}

function handleCanvasPress(x, y) {
  for (let i = 0; i < visualState.instrumentHitboxes.length; i += 1) {
    const hitbox = visualState.instrumentHitboxes[i];
    if (
      x >= hitbox.x &&
      x <= hitbox.x + hitbox.width &&
      y >= hitbox.y &&
      y <= hitbox.y + hitbox.height
    ) {
      cycleTrackInstrument(hitbox.sensorID);
      return true;
    }
  }
  for (let i = 0; i < visualState.tempoHitboxes.length; i += 1) {
    const hitbox = visualState.tempoHitboxes[i];
    if (
      x >= hitbox.x &&
      x <= hitbox.x + hitbox.width &&
      y >= hitbox.y &&
      y <= hitbox.y + hitbox.height
    ) {
      cycleTrackTempo(hitbox.sensorID);
      return true;
    }
  }
  for (let i = 0; i < visualState.aqHitboxes.length; i += 1) {
    const hitbox = visualState.aqHitboxes[i];
    if (
      x >= hitbox.x &&
      x <= hitbox.x + hitbox.width &&
      y >= hitbox.y &&
      y <= hitbox.y + hitbox.height
    ) {
      visualState.primaryTrackSensorID = hitbox.sensorID;
      return true;
    }
  }
  return false;
}

function snapBpmValue(value) {
  const clamped = clamp(Number.isFinite(value) ? value : 64, 32, 96);
  return 32 + Math.round((clamped - 32) / 4) * 4;
}

function drawEnergyBursts(p) {
  const time = p.millis() * 0.001;
  state.sensorDrawers.forEach((drawer, index) => {
    if (drawer.isStale()) {
      return;
    }
    const color = getAqiColor(drawer.aqi);
    const pulseProgress = clamp((audioState.sensorPulseUntil[index] - performance.now()) / audioState.pulseDurationMs, 0, 1);
    const x = p.width * (0.14 + (index / Math.max(1, state.sensorDrawers.length - 1)) * 0.72);
    const y = 120 + Math.sin(time * 1.2 + index * 0.8) * 18;
    const particleCount = Math.max(3, Math.round(mapRange(drawer.aqi, 0, 300, 3, 34)));
    const plumeHeight = 16 + mapRange(drawer.aqi, 0, 300, 8, 84);
    const plumeWidth = 10 + mapRange(drawer.aqi, 0, 300, 6, 42);

    p.push();
    p.noStroke();
    for (let i = 0; i < particleCount; i += 1) {
      const seed = index * 0.73 + i * 1.91;
      const driftX = Math.sin(time * (0.8 + i * 0.02) + seed) * plumeWidth;
      const rise = (time * (18 + i * 0.9) + seed * 9) % plumeHeight;
      const px = x + driftX + Math.sin(time * 0.7 + seed * 2.4) * 4;
      const py = y - rise - pulseProgress * 10;
      const size = 1.2 + (i % 3) * 0.6 + pulseProgress * 1.2;
      const alpha = 26 + mapRange(drawer.aqi, 0, 300, 10, 70) + (i % 5) * 3;
      p.fill(color.r, color.g, color.b, alpha);
      p.circle(px, py, size);
    }
    p.pop();
  });
}
