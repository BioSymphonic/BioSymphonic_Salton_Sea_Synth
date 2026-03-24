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

const audioState = {
  isPlaying: false,
  audioUnlocked: false,
  toneReady: false,
  bpm: 90,
  reverbWet: 0.08,
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
  lastDataChangeBySensorId: {},
  channelStateBySensorId: {},
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
  reverbControlEl: null,
  bpmControlEl: null,
  bpmReadoutEl: null,
  bottomStripEl: null,
  autoplayRetryTimer: null,
  reverb: null,
  loopId: null,
  synths: {
    low: null,
    mid: null,
    high: null,
    ding: null,
  },
};

const visualState = {
  particles: [],
  graphPointsBySensorId: {},
  sweepStartedAtMs: 0,
  aqHitboxes: [],
  primaryTrackSensorID: null,
  canvasEl: null,
};

function init() {
  audioState.accruedDurationEl = document.getElementById("accrued-duration");
  audioState.transportButtonEl = document.getElementById("transport-button");
  audioState.reverbControlEl = document.getElementById("reverb-control");
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

  if (audioState.reverbControlEl) {
    audioState.reverbControlEl.value = `${Math.round(audioState.reverbWet * 100)}`;
    const applyReverbValue = () => {
      const value = parseInt(audioState.reverbControlEl.value, 10);
      audioState.reverbWet = clamp((Number.isFinite(value) ? value : 8) / 100, 0, 1);
      if (audioState.reverb && audioState.reverb.wet) {
        audioState.reverb.wet.value = audioState.reverbWet;
      }
    };
    audioState.reverbControlEl.addEventListener("change", applyReverbValue);
    audioState.reverbControlEl.addEventListener("input", applyReverbValue);
  }

  if (audioState.bpmControlEl) {
    audioState.bpmControlEl.value = `${audioState.bpm}`;
    const applyBpmValue = () => {
      const value = parseInt(audioState.bpmControlEl.value, 10);
      audioState.bpm = clamp(Number.isFinite(value) ? value : 90, 60, 180);
      updateBpmReadout();
      refreshPlaybackLoop();
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
    audioState.lastDataChangeBySensorId[sensorID] = 0;
    audioState.channelStateBySensorId[sensorID] = { level: 0, target: 0 };
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

  ["low", "mid", "high"].forEach((name) => {
    const synth = audioState.synths[name];
    if (synth) {
      synth.releaseAll();
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

  audioState.reverb = new Tone.Reverb({
    decay: 9,
    preDelay: 0.04,
    wet: audioState.reverbWet,
  }).toDestination();

  audioState.synths.low = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 12,
    oscillator: { type: "sine" },
    envelope: { attack: 1.4, decay: 0.8, sustain: 0.9, release: 4.8 },
  }).connect(audioState.reverb);
  audioState.synths.low.volume.value = -12;

  audioState.synths.mid = new Tone.PolySynth(Tone.AMSynth, {
    maxPolyphony: 10,
    harmonicity: 1.5,
    envelope: { attack: 1.1, decay: 0.7, sustain: 0.82, release: 3.8 },
    modulation: { type: "sine" },
    modulationEnvelope: { attack: 0.6, decay: 0.5, sustain: 0.6, release: 1.8 },
  }).connect(audioState.reverb);
  audioState.synths.mid.volume.value = -13;

  audioState.synths.high = new Tone.PolySynth(Tone.FMSynth, {
    maxPolyphony: 8,
    harmonicity: 2.2,
    modulationIndex: 8,
    envelope: { attack: 0.7, decay: 0.5, sustain: 0.72, release: 2.8 },
    modulationEnvelope: { attack: 0.25, decay: 0.35, sustain: 0.45, release: 1.2 },
  }).connect(audioState.reverb);
  audioState.synths.high.volume.value = -14;

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

  ["low", "mid", "high"].forEach((name) => {
    const synth = audioState.synths[name];
    if (!synth) {
      return;
    }
    synth.releaseAll();
    synth.dispose();
    audioState.synths[name] = null;
  });

  if (audioState.synths.ding) {
    audioState.synths.ding.dispose();
    audioState.synths.ding = null;
  }

  if (audioState.reverb) {
    audioState.reverb.dispose();
    audioState.reverb = null;
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

  const stepSeconds = getPlaybackStepSeconds();
  audioState.loopId = Tone.Transport.scheduleRepeat((time) => {
    playbackTick(time, stepSeconds);
  }, stepSeconds);

  if (Tone.Transport.state !== "started") {
    Tone.Transport.start("+0.05");
  }
}

function getPlaybackStepSeconds() {
  return clamp((60 / Math.max(60, audioState.bpm)) * 8, 2.5, 8);
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
    return getWindowedHistory(sensorID).length > 0;
  });

  const fallbackIndices = [];
  if (!activeIndices.length) {
    for (let i = 0; i < state.sensorIDs.length; i += 1) {
      if (getWindowedHistory(state.sensorIDs[i]).length > 0) {
        fallbackIndices.push(i);
      }
    }
  }

  const candidateIndices = activeIndices.length ? activeIndices : fallbackIndices;
  if (!candidateIndices.length) {
    playSafetyDrone(time, stepSeconds);
    return;
  }

  updateAudibleMixTargets(candidateIndices);
  updateAllChannelLevels(stepSeconds);

  const allowStale = activeIndices.length === 0;
  let audibleIndices = candidateIndices.filter((index) =>
    isSensorAudible(state.sensorIDs[index], index, allowStale)
  );

  playSafetyDrone(time, stepSeconds, candidateIndices);

  if (!audibleIndices.length) {
    audibleIndices = candidateIndices.slice();
  }

  const rankedIndices = rankSensorIndicesByChange(audibleIndices);
  if (Date.now() < audioState.swirlUntilMs) {
    playSwirlCluster(time, stepSeconds, rankedIndices);
    audioState.stepIndex += 1;
    return;
  }

  const preferredCount = Math.max(1, Math.min(audioState.preferredTopCount, rankedIndices.length));
  const activeSlot = audioState.stepIndex % preferredCount;
  const sensorIndex = rankedIndices[activeSlot];
  const sensorID = state.sensorIDs[sensorIndex];
  const history = getWindowedHistory(sensorID);

  if (!history.length) {
    audioState.stepIndex += 1;
    return;
  }

  let playhead = audioState.playheadBySensorId[sensorID] || 0;
  playhead %= history.length;

  const offsets = getCompositionOffsets(sensorID);
  const midiValues = [];

  for (let i = 0; i < offsets.length; i += 1) {
    const historyIndex = (playhead - offsets[i] + history.length) % history.length;
    midiValues.push(aqiToMidi(history[historyIndex].value, sensorIndex));
  }

  const uniqueMidi = Array.from(new Set(ensureVoiceCount(midiValues, offsets.length).map((midi) => Math.round(midi))));
  const uniqueNotes = uniqueMidi.map((midi) => Tone.Frequency(midi, "midi").toNote());
  const currentValue = history[playhead].value;
  const channelLevel = getChannelLevel(sensorID);
  const velocity = Math.min(0.58, aqiToVelocity(currentValue) * channelLevel);
  const durationSeconds = Math.max(2.5, stepSeconds * 1.8);
  const synth = getSynthForAqi(currentValue);

  if (synth) {
    synth.triggerAttackRelease(uniqueNotes, durationSeconds, time, velocity);
  }

  audioState.playheadBySensorId[sensorID] = (playhead + getScrubStepPoints()) % history.length;
  audioState.activeSensorIndex = sensorIndex;
  pulseSensor(sensorIndex);
  audioState.lastPlaybackBySensorId[sensorID] = {
    ts: Date.now(),
    notes: uniqueNotes,
    historyLength: history.length,
    playhead,
    pointIndex: getPointIndexForHistory(playhead, history.length),
  };
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
  const historyLength = getWindowedHistory(sensorID).length;
  const playhead = audioState.playheadBySensorId[sensorID] || 0;
  audioState.lastPlaybackBySensorId[sensorID] = {
    ts: now,
    notes: chord,
    historyLength,
    playhead,
    pointIndex: getPointIndexForHistory(playhead, historyLength),
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
    const history = getWindowedHistory(sensorID);
    if (!history.length) {
      continue;
    }

    let playhead = audioState.playheadBySensorId[sensorID] || 0;
    playhead %= history.length;

    const reading = history[playhead];
    const midi = Math.round(aqiToMidi(reading.value, sensorIndex));
    activeEntries.push({
      note: Tone.Frequency(midi, "midi").toNote(),
      value: reading.value,
      sensorIndex,
      sensorID,
      playhead,
      historyLength: history.length,
    });

    audioState.playheadBySensorId[sensorID] = (playhead + getScrubStepPoints()) % history.length;
    audioState.lastPlaybackBySensorId[sensorID] = {
      ts: now,
      notes: [Tone.Frequency(midi, "midi").toNote()],
      historyLength: history.length,
      playhead,
      pointIndex: getPointIndexForHistory(playhead, history.length),
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
  return Boolean(audioState.synths.low || audioState.synths.mid || audioState.synths.high);
}

function getSynthForAqi(aqi) {
  if (!Number.isFinite(aqi)) {
    return audioState.synths.mid;
  }
  if (aqi < 90) {
    return audioState.synths.low;
  }
  if (aqi < 170) {
    return audioState.synths.mid;
  }
  return audioState.synths.high;
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
  audioState.accruedDurationEl.textContent = `Accrued Duration: ${formatDurationShort(getAccruedDurationMs())}`;
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

  p.fill(titleColor.r, titleColor.g, titleColor.b, 242);
  p.textAlign(p.LEFT, p.TOP);
  p.textSize(p.width <= 600 ? 28 : 34);
  p.textStyle(p.BOLD);
  p.text(state.title, marginX, 26);
  p.textSize(14);
  p.textStyle(p.NORMAL);
  p.fill(state.palette.yellow);
  p.text("by BioSymphonic", marginX + 6, 54);

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
    p.text(`${Math.round(drawer.aqi)}`, marginX + 56, y + panelHeight * 0.5);

    p.textAlign(p.LEFT, p.TOP);
    p.textStyle(p.BOLD);
    p.textSize(22);
    p.fill(titleColor.r, titleColor.g, titleColor.b, 240);
    p.text(drawer.locationName, marginX + 122, y + 16);

    p.textStyle(p.NORMAL);
    p.textSize(12);
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
  const samples = getDisplaySamples(sensorID, 0);
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

  const headPhase = getVisualSweepPhase(sensorID, findSensorIndex(sensorID), samples.length);
  const headState = getSweepHeadState(wavePoints, headPhase);

  p.noStroke();
  p.fill(236, 229, 196, 245);
  for (let i = 0; i < samples.length; i += 1) {
    const px = x + markerFractions[i] * width;
    const py = dataBottom - mapRange(samples[i].value, minValue, maxValue, 0, dataBottom - dataTop);
    p.circle(px, py, 8);
  }

  p.push();
  p.translate(headState.x, headState.y);
  p.rectMode(p.CENTER);
  p.noStroke();
  p.fill(232, 224, 178, 235);
  p.rect(0, 0, 12, 20, 3);
  p.fill(246, 239, 216, 180);
  p.rect(0, -4, 6, 6, 2);
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
  const primaryTrackIndex = getPrimaryTrackIndex();
  const pointFactor = clamp(sampleCount / 18, 0.9, 2.6);
  const beatsPerCycle = 16;
  const masterCycleMs = (60000 / Math.max(60, audioState.bpm)) * beatsPerCycle * pointFactor;
  const relativeOffset = Math.max(0, sensorIndex) - Math.max(0, primaryTrackIndex);
  const sensorFactor = 1 + Math.abs(relativeOffset) * 0.18;
  const cycleMs = masterCycleMs * sensorFactor;
  const elapsedMs = Math.max(0, Date.now() - visualState.sweepStartedAtMs + Math.max(0, sensorIndex) * 350);
  return (elapsedMs % cycleMs) / cycleMs;
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
