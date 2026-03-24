const state = {
  sensorIDs: [],
  places: [],
  sensorDrawers: [],
  sensorFeedUrls: {},
  sensorMeta: [],
  adafruitUsername: "",
  headerTitle: "",
  appVersion: "0.29",
  showDetails: false,
  isPressing: false,
  longPressMs: 3000,
  canvasWidth: 1080,
  canvasHeight: 1920,
  headerHeight: 96,
  dataHeight: 70,
  leftMargin: 10,
  aqiSize: 60,
  aqMinVal: 0,
  aqMaxVal: 300,
  staleThresholdMs: 2 * 60 * 60 * 1000,
  overMaxColor: "#da1c5c",
  drawReady: false,
  dpr: Math.max(1, window.devicePixelRatio || 1),
  scale: 1,
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
  synths: {
    low: null,
    mid: null,
    high: null,
    ding: null,
  },
  reverb: null,
  loopId: null,
  stepIndex: 0,
  timeScrubMinutes: 4,
  historyWindowMs: 24 * 60 * 60 * 1000,
  baseMidi: 36,
  scale: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24],
  sensorPulseUntil: [],
  pulseDurationMs: 600,
  historyBySensorId: {},
  playheadBySensorId: {},
  lastPlaybackBySensorId: {},
  lastDataChangeBySensorId: {},
  channelStateBySensorId: {},
  activeSensorIndex: -1,
  playButton: null,
  accruedDurationEl: null,
  playbackStartedAtMs: 0,
  lastSafetyDroneAtMs: 0,
  swirlDurationMs: 18000,
  swirlUntilMs: 0,
  minConcurrentAudible: 3,
  maxConcurrentAudible: 5,
  preferredTopCount: 3,
  audibleThreshold: 0.05,
};

const canvas = document.getElementById("aqi-canvas");
const ctx = canvas.getContext("2d");

function init() {
  loadConfig();
  setupAudioControls();
  bindPressHandlers();
  window.addEventListener("resize", resizeCanvas);
}

function loadConfig() {
  const cacheBust = `v=${Date.now()}`;
  fetch(`sensorInfo.json?${cacheBust}`)
    .then((response) => response.json())
    .then((sensorData) => {
      state.sensorIDs = sensorData.sensors.sensorIDs;
      state.places = sensorData.sensors.rooms;
      state.adafruitUsername = sensorData.adafruitUsername || "";
      state.headerTitle = sensorData.title || "";
      state.canvasHeight = state.headerHeight + state.sensorIDs.length * state.dataHeight;

      buildUrls();
      buildSensors();
      resizeCanvas();
      state.drawReady = true;
      draw();

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

  for (let i = 0; i < state.sensorIDs.length; i += 1) {
    const sensorID = state.sensorIDs[i];
    const drawer = new SensorDrawer();
    drawer.setup(sensorID, state.places[i]);
    state.sensorDrawers.push(drawer);
    state.sensorMeta.push({
      sensorID,
      lastPolledAtMs: 0,
      isPolling: false,
    });

    audioState.historyBySensorId[sensorID] = [];
    audioState.playheadBySensorId[sensorID] = 0;
    audioState.lastPlaybackBySensorId[sensorID] = null;
    audioState.lastDataChangeBySensorId[sensorID] = 0;
    audioState.channelStateBySensorId[sensorID] = {
      level: 0,
      target: 0,
    };
  }

  audioState.sensorPulseUntil = new Array(state.sensorDrawers.length).fill(0);
  audioState.stepIndex = 0;
}

function resizeCanvas() {
  state.dpr = Math.max(1, window.devicePixelRatio || 1);
  const isPhone = window.innerWidth <= 600;
  state.aqiSize = isPhone ? 56 : 60;
  state.headerHeight = isPhone ? 76 : 96;
  state.dataHeight = isPhone ? 78 : 70;
  state.canvasWidth = Math.min(1080, window.innerWidth);
  state.canvasHeight = state.headerHeight + state.sensorIDs.length * state.dataHeight;
  state.scale = 1;

  canvas.width = Math.round(state.canvasWidth * state.dpr);
  canvas.height = Math.round(state.canvasHeight * state.dpr);
  canvas.style.width = `${Math.round(state.canvasWidth)}px`;
  canvas.style.height = `${Math.round(state.canvasHeight)}px`;
}

function bindPressHandlers() {
  let pressTimer = null;
  function isControlEventTarget(target) {
    return Boolean(target && target.closest && target.closest(".controls"));
  }

  function startPress() {
    state.isPressing = true;
    state.showDetails = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      if (state.isPressing) {
        state.showDetails = true;
        document.body.classList.add("show-details");
      }
    }, state.longPressMs);
  }

  function endPress() {
    state.isPressing = false;
    state.showDetails = false;
    document.body.classList.remove("show-details");
    clearTimeout(pressTimer);
  }

  const pressTarget = document.body;

  pressTarget.addEventListener("pointerdown", (event) => {
    if (isControlEventTarget(event.target)) {
      return;
    }
    event.preventDefault();
    if (window.Tone && Tone.context && Tone.context.state !== "running") {
      Tone.start().catch(() => {});
    }
    startPress();
  });

  pressTarget.addEventListener("pointerup", (event) => {
    if (isControlEventTarget(event.target)) {
      return;
    }
    event.preventDefault();
    endPress();
  });

  pressTarget.addEventListener("pointercancel", endPress);
  pressTarget.addEventListener("pointerleave", endPress);

  pressTarget.addEventListener(
    "touchstart",
    (event) => {
      if (isControlEventTarget(event.target)) {
        return;
      }
      event.preventDefault();
      if (window.Tone && Tone.context && Tone.context.state !== "running") {
        Tone.start().catch(() => {});
      }
      startPress();
    },
    { passive: false }
  );

  pressTarget.addEventListener(
    "touchend",
    (event) => {
      if (isControlEventTarget(event.target)) {
        return;
      }
      event.preventDefault();
      endPress();
    },
    { passive: false }
  );

  pressTarget.addEventListener(
    "touchcancel",
    (event) => {
      if (isControlEventTarget(event.target)) {
        return;
      }
      event.preventDefault();
      endPress();
    },
    { passive: false }
  );
}

function setupAudioControls() {
  const controls = document.querySelector(".controls");
  const playButton = document.getElementById("play-button");
  const timeScrubControl = document.getElementById("time-scrub-control");
  const accruedDurationEl = document.getElementById("accrued-duration");

  if (!playButton) {
    return;
  }

  audioState.playButton = playButton;
  audioState.accruedDurationEl = accruedDurationEl;
  setPlayButtonState(audioState.isPlaying);
  updateAccruedDurationReadout();

  if (controls) {
    ["pointerdown", "touchstart", "click"].forEach((eventName) => {
      controls.addEventListener(
        eventName,
        (event) => {
          event.stopPropagation();
        },
        { passive: eventName === "touchstart" }
      );
    });
  }

  if (timeScrubControl) {
    const applyTimeScrubValue = () => {
      const value = parseInt(timeScrubControl.value, 10);
      audioState.timeScrubMinutes = clamp(Number.isFinite(value) ? value : 4, 1, 12);
      refreshPlaybackLoop();
    };
    timeScrubControl.value = `${audioState.timeScrubMinutes}`;
    timeScrubControl.addEventListener("change", applyTimeScrubValue);
    timeScrubControl.addEventListener("input", applyTimeScrubValue);
  }

  playButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await togglePlayback();
  });
}

function setPlayButtonState(isPlaying) {
  if (!audioState.playButton) {
    return;
  }
  audioState.playButton.textContent = isPlaying ? "Stop" : "Play";
  audioState.playButton.setAttribute("aria-pressed", isPlaying ? "true" : "false");
  audioState.playButton.classList.toggle("is-playing", isPlaying);
}

async function togglePlayback() {
  if (!window.Tone) {
    return;
  }

  if (audioState.isPlaying) {
    stopPlayback();
    setPlayButtonState(false);
    return;
  }

  try {
    await Tone.start();
  } catch (error) {
    console.warn("Unable to start audio context", error);
  }

  startPlayback();
  setPlayButtonState(true);
}

function startPlayback() {
  if (!window.Tone) {
    return;
  }

  stopPlayback();

  audioState.reverb = new Tone.Reverb({
    decay: 9,
    preDelay: 0.04,
    wet: 0.38,
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

  Tone.Transport.start("+0.05");
  audioState.isPlaying = true;
  audioState.stepIndex = 0;
  audioState.playbackStartedAtMs = Date.now();
  audioState.lastSafetyDroneAtMs = 0;
  audioState.swirlUntilMs = Date.now() + audioState.swirlDurationMs;
  refreshPlaybackLoop();
  playbackTick(Tone.now(), getPlaybackStepSeconds());
}

function stopPlayback() {
  if (!window.Tone) {
    return;
  }

  if (audioState.loopId !== null) {
    Tone.Transport.clear(audioState.loopId);
    audioState.loopId = null;
  }

  Tone.Transport.stop();
  Tone.Transport.cancel();

  if (audioState.synths.low) {
    audioState.synths.low.releaseAll();
    audioState.synths.low.dispose();
    audioState.synths.low = null;
  }
  if (audioState.synths.mid) {
    audioState.synths.mid.releaseAll();
    audioState.synths.mid.dispose();
    audioState.synths.mid = null;
  }
  if (audioState.synths.high) {
    audioState.synths.high.releaseAll();
    audioState.synths.high.dispose();
    audioState.synths.high = null;
  }
  if (audioState.synths.ding) {
    audioState.synths.ding.dispose();
    audioState.synths.ding = null;
  }
  if (audioState.reverb) {
    audioState.reverb.dispose();
    audioState.reverb = null;
  }

  audioState.isPlaying = false;
  audioState.activeSensorIndex = -1;
}

function refreshPlaybackLoop() {
  if (!window.Tone) {
    return;
  }

  if (audioState.loopId !== null) {
    Tone.Transport.clear(audioState.loopId);
    audioState.loopId = null;
  }

  if (!audioState.isPlaying) {
    return;
  }

  const stepSeconds = getPlaybackStepSeconds();
  audioState.loopId = Tone.Transport.scheduleRepeat((time) => {
    playbackTick(time, stepSeconds);
  }, stepSeconds);
}

function getPlaybackStepSeconds() {
  return 7.5;
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
    const history = getWindowedHistory(sensorID);
    return history.length > 0;
  });

  const fallbackIndices = [];
  if (!activeIndices.length) {
    for (let i = 0; i < state.sensorIDs.length; i += 1) {
      const sensorID = state.sensorIDs[i];
      if (getWindowedHistory(sensorID).length > 0) {
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
    const offset = offsets[i];
    const historyIndex = (playhead - offset + history.length) % history.length;
    const reading = history[historyIndex];
    const midi = aqiToMidi(reading.value, sensorIndex);
    midiValues.push(midi);
  }

  const targetVoices = offsets.length;
  const enrichedMidi = ensureVoiceCount(midiValues, targetVoices);
  const uniqueMidi = Array.from(new Set(enrichedMidi.map((midi) => Math.round(midi))));
  const uniqueNotes = uniqueMidi.map((midi) => Tone.Frequency(midi, "midi").toNote());
  const currentValue = history[playhead].value;
  const channelLevel = getChannelLevel(sensorID);
  const velocity = Math.min(0.58, aqiToVelocity(currentValue) * channelLevel);
  const durationSeconds = Math.max(2.5, stepSeconds * 1.8);
  const synth = getSynthForAqi(currentValue);

  if (synth) {
    synth.triggerAttackRelease(uniqueNotes, durationSeconds, time, velocity);
  }
  const scrubStep = getScrubStepPoints();
  audioState.playheadBySensorId[sensorID] = (playhead + scrubStep) % history.length;

  audioState.activeSensorIndex = sensorIndex;
  pulseSensor(sensorIndex);
  audioState.lastPlaybackBySensorId[sensorID] = {
    ts: Date.now(),
    notes: uniqueNotes,
    historyLength: history.length,
    playhead,
  };
  audioState.stepIndex += 1;
}

function playSafetyDrone(time, stepSeconds, preferredIndices) {
  const now = Date.now();
  const minGapMs = 850;
  if (now - audioState.lastSafetyDroneAtMs < minGapMs) {
    return;
  }

  const seed = getSafetyDroneSeed(preferredIndices);
  if (!seed) {
    return;
  }

  const { sensorIndex, aqi } = seed;
  const rootMidi = Math.round(aqiToMidi(aqi, sensorIndex));
  const chord = [
    Tone.Frequency(rootMidi, "midi").toNote(),
    Tone.Frequency(clamp(rootMidi + 7, 30, 88), "midi").toNote(),
    Tone.Frequency(clamp(rootMidi + 12, 30, 88), "midi").toNote(),
  ];
  const durationSeconds = Math.max(5.5, stepSeconds * 2.8);
  const velocity = 0.16;
  const synth = getSynthForAqi(aqi) || audioState.synths.low || audioState.synths.mid;
  if (!synth) {
    return;
  }

  synth.triggerAttackRelease(chord, durationSeconds, time, velocity);
  audioState.activeSensorIndex = sensorIndex;
  pulseSensor(sensorIndex);

  const sensorID = state.sensorIDs[sensorIndex];
  audioState.lastPlaybackBySensorId[sensorID] = {
    ts: now,
    notes: chord,
    historyLength: getWindowedHistory(sensorID).length,
    playhead: audioState.playheadBySensorId[sensorID] || 0,
  };
  audioState.lastSafetyDroneAtMs = now;
}

function getSafetyDroneSeed(preferredIndices) {
  const indexPool =
    preferredIndices && preferredIndices.length
      ? preferredIndices
      : state.sensorIDs.map((_, index) => index);

  let pickedIndex = -1;
  let pickedAqi = null;
  for (let i = 0; i < indexPool.length; i += 1) {
    const idx = indexPool[i];
    const sensorID = state.sensorIDs[idx];
    const history = getWindowedHistory(sensorID);
    if (history.length) {
      pickedIndex = idx;
      pickedAqi = history[history.length - 1].value;
      break;
    }
  }

  if (pickedIndex >= 0 && Number.isFinite(pickedAqi)) {
    return { sensorIndex: pickedIndex, aqi: pickedAqi };
  }

  for (let i = 0; i < indexPool.length; i += 1) {
    const idx = indexPool[i];
    const drawer = state.sensorDrawers[idx];
    if (!drawer) {
      continue;
    }
    if (Number.isFinite(drawer.aqi)) {
      return { sensorIndex: idx, aqi: drawer.aqi };
    }
  }

  return null;
}

function playSwirlCluster(time, stepSeconds, activeIndices) {
  if (!hasInstrumentBank()) {
    return;
  }

  const activeEntries = [];
  const nowMs = Date.now();
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
    const note = Tone.Frequency(midi, "midi").toNote();
    activeEntries.push({ note, value: reading.value, sensorIndex, sensorID });

    const scrubStep = getScrubStepPoints();
    audioState.playheadBySensorId[sensorID] = (playhead + scrubStep) % history.length;
    audioState.lastPlaybackBySensorId[sensorID] = {
      ts: nowMs,
      notes: [note],
      historyLength: history.length,
      playhead,
    };
    pulseSensor(sensorIndex);
  }

  if (!activeEntries.length) {
    return;
  }

  const durationSeconds = Math.max(3.2, stepSeconds * 2.2);
  const strumGap = 0.035;

  for (let i = 0; i < activeEntries.length; i += 1) {
    const entry = activeEntries[i];
    const channelLevel = getChannelLevel(entry.sensorID);
    const velocity = 0.26 + 0.3 * channelLevel;
    const synth = getSynthForAqi(entry.value);
    if (synth) {
      synth.triggerAttackRelease(entry.note, durationSeconds, time + i * strumGap, velocity);
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
    if (!activeSet.has(sensorID)) {
      channelState.target = 0;
    }
  }

  const desiredCount = getDesiredAudibleCount(activeIndices.length);
  const rankedIndices = rankSensorIndicesByChange(activeIndices);
  const selectedIDs = new Set();
  const limit = Math.min(desiredCount, rankedIndices.length);
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
  const fadeInSeconds = 4.5;
  const fadeOutSeconds = 6.5;
  for (let i = 0; i < state.sensorIDs.length; i += 1) {
    const sensorID = state.sensorIDs[i];
    const channelState = audioState.channelStateBySensorId[sensorID];
    if (!channelState) {
      continue;
    }
    const fadeSeconds = channelState.target > channelState.level ? fadeInSeconds : fadeOutSeconds;
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
  return indices
    .slice()
    .sort((indexA, indexB) => {
      const sensorIDA = state.sensorIDs[indexA];
      const sensorIDB = state.sensorIDs[indexB];
      const scoreA = getRecentChangeScoreById(sensorIDA);
      const scoreB = getRecentChangeScoreById(sensorIDB);
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
  const steps = Math.max(1, sampleSize - 1);
  return total / steps + latestDelta * 0.8;
}

function ensureVoiceCount(midiValues, targetVoices) {
  const result = midiValues.slice();
  if (!result.length) {
    return result;
  }
  const intervals = [0, 5, 7, 12, 14];
  let intervalIndex = 0;
  while (result.length < targetVoices) {
    const baseMidi = result[0];
    const nextMidi = clamp(baseMidi + intervals[intervalIndex % intervals.length], 30, 88);
    result.push(nextMidi);
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

  const activeIndices = getActiveSensorIndices();
  const activeCount = activeIndices.length;
  const tickMs = Math.max(1000, Math.floor(60000 / Math.max(1, activeCount)));

  pollingState.activeTimer = setTimeout(() => {
    runActivePollingTick();
  }, tickMs);
}

function runActivePollingTick() {
  const activeIndices = getActiveSensorIndices();
  if (!activeIndices.length) {
    scheduleActivePollingTick();
    return;
  }

  const slot = pollingState.activeCursor % activeIndices.length;
  pollingState.activeCursor = (pollingState.activeCursor + 1) % activeIndices.length;
  const targetIndex = activeIndices[slot];

  pollSensorByIndex(targetIndex, false).finally(() => {
    scheduleActivePollingTick();
  });
}

function pollInactiveSensors() {
  const activeSet = new Set(getActiveSensorIndices());
  for (let i = 0; i < state.sensorDrawers.length; i += 1) {
    if (activeSet.has(i)) {
      continue;
    }
    pollSensorByIndex(i, false);
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
  const elapsed = now - meta.lastPolledAtMs;
  if (!force && elapsed < pollingState.minPollGapMs) {
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
      const dataKey = extractDataKey(data.key);
      const sensorIndex = findSensorIndex(sensorID);
      if (sensorIndex < 0) {
        return;
      }

      const sensorDrawer = state.sensorDrawers[sensorIndex];
      sensorDrawer.setData(dataKey, data.last_value);
      sensorDrawer.setLastUpdated(data.updated_at);

      if (dataKey === "aqi") {
        const rawValue = parseInt(data.last_value, 10);
        const value = Number.isFinite(rawValue) ? rawValue : 0;
        const ts = Date.parse(data.updated_at);
        const didAdd = addHistoryReading(sensorID, value, Number.isFinite(ts) ? ts : Date.now());
        if (didAdd) {
          triggerNewDataDing(sensorIndex, value);
        }
      }
    })
    .catch((error) => {
      console.warn("Failed to fetch sensor data", url, error);
    })
    .finally(() => {
      meta.isPolling = false;
    });
}

function findSensorIndex(sensorID) {
  for (let i = 0; i < state.sensorDrawers.length; i += 1) {
    if (state.sensorDrawers[i].sensorID === sensorID) {
      return i;
    }
  }
  return -1;
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

  const retentionMs = 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - retentionMs;
  while (history.length > 0 && history[0].ts < cutoff) {
    history.shift();
  }

  audioState.historyBySensorId[sensorID] = history;
  updateAccruedDurationReadout();

  if (audioState.playheadBySensorId[sensorID] >= history.length) {
    audioState.playheadBySensorId[sensorID] = 0;
  }
  return true;
}

function triggerNewDataDing(sensorIndex, aqi) {
  if (!audioState.isPlaying || !audioState.synths.ding || !window.Tone) {
    return;
  }
  const midi = clamp(Math.round(aqiToMidi(aqi, sensorIndex)) + 12, 48, 96);
  const note = Tone.Frequency(midi, "midi").toNote();
  audioState.synths.ding.triggerAttackRelease(note, "16n", Tone.now(), 0.18);
}

function getWindowedHistory(sensorID) {
  const history = audioState.historyBySensorId[sensorID] || [];
  const cutoff = Date.now() - audioState.historyWindowMs;

  return history.filter((reading) => reading.ts >= cutoff);
}

function getAccruedDurationMs() {
  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = Number.NEGATIVE_INFINITY;
  const sensorIDs = Object.keys(audioState.historyBySensorId);
  for (let i = 0; i < sensorIDs.length; i += 1) {
    const history = audioState.historyBySensorId[sensorIDs[i]];
    if (!history || !history.length) {
      continue;
    }
    const first = history[0];
    const last = history[history.length - 1];
    if (first.ts < minTs) {
      minTs = first.ts;
    }
    if (last.ts > maxTs) {
      maxTs = last.ts;
    }
  }

  if (!Number.isFinite(minTs) || !Number.isFinite(maxTs) || maxTs <= minTs) {
    return 0;
  }
  return maxTs - minTs;
}

function formatDurationShort(durationMs) {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

function updateAccruedDurationReadout() {
  if (!audioState.accruedDurationEl) {
    return;
  }
  const durationMs = getAccruedDurationMs();
  audioState.accruedDurationEl.textContent = `Accrued Duration: ${formatDurationShort(durationMs)}`;
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

function draw() {
  if (!state.drawReady) {
    requestAnimationFrame(draw);
    return;
  }

  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
  ctx.fillStyle = "#282828";
  ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);

  drawHeader();

  let visibleIndex = 0;
  for (let i = 0; i < state.sensorDrawers.length; i += 1) {
    const drawer = state.sensorDrawers[i];
    if (drawer.isStale()) {
      continue;
    }
    const y = state.headerHeight + visibleIndex * state.dataHeight;
    drawer.draw(state.leftMargin + state.aqiSize / 2, y, i);
    visibleIndex += 1;
  }

  requestAnimationFrame(draw);
}

function drawHeader() {
  const titleY = 24;

  ctx.font = "24px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(state.headerTitle, state.leftMargin, titleY);

  if (state.isPressing) {
    const titleWidth = ctx.measureText(state.headerTitle || "").width;
    ctx.font = "12px Arial";
    ctx.fillStyle = "#c9c9c9";
    ctx.fillText(`v${state.appVersion}`, state.leftMargin + titleWidth + 10, titleY);
  }
}

function extractNumber(key) {
  const idPart = key.split(".")[0];
  const number = idPart.split("-")[1];
  return parseInt(number, 10);
}

function extractDataKey(key) {
  return key.split(".")[1];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function aqiToMidi(aqi, sensorIndex) {
  const range = Math.max(1, state.aqMaxVal - state.aqMinVal);
  const t = clamp(aqi, state.aqMinVal, state.aqMaxVal) / range;
  const baseIndex = Math.round(t * (audioState.scale.length - 1));
  const offset = (sensorIndex * 2) % audioState.scale.length;
  const scaleIndex = (baseIndex + offset) % audioState.scale.length;
  const sensorCount = Math.max(1, state.sensorDrawers.length);
  const octaveSlots = 3;
  const slot =
    sensorCount === 1
      ? 0
      : Math.floor((sensorIndex / (sensorCount - 1)) * (octaveSlots - 1));
  const octaveOffset = slot * 12;
  let midi = audioState.baseMidi + audioState.scale[scaleIndex] + octaveOffset;

  // Keep higher AQ pitch behavior intact while giving low AQ a deeper register.
  if (t < 0.5) {
    const lowFactor = (0.5 - t) / 0.5;
    midi -= Math.round(lowFactor * 10);
  }

  return clamp(midi, 24, 96);
}

function aqiToVelocity(aqi) {
  const range = Math.max(1, state.aqMaxVal - state.aqMinVal);
  const t = clamp(aqi, state.aqMinVal, state.aqMaxVal) / range;
  return 0.35 + t * 0.5;
}

function midiToNoteName(midi) {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const rounded = Math.round(midi);
  const note = noteNames[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${note}${octave}`;
}

function fitTextToWidth(text, maxWidth) {
  if (maxWidth <= 0) {
    return "";
  }
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  const ellipsis = "...";
  let out = text;
  while (out.length > 0 && ctx.measureText(`${out}${ellipsis}`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return out.length > 0 ? `${out}${ellipsis}` : ellipsis;
}

function getPlaybackInfoStartX(baseX) {
  const labelX = baseX + 40;
  ctx.save();
  ctx.font = "24px Arial";
  let maxLabelWidth = 0;
  for (let i = 0; i < state.places.length; i += 1) {
    const width = ctx.measureText(state.places[i] || "").width;
    if (width > maxLabelWidth) {
      maxLabelWidth = width;
    }
  }
  ctx.restore();
  return labelX + Math.min(320, maxLabelWidth + 14);
}

function pulseSensor(index) {
  const now = performance.now();
  if (audioState.sensorPulseUntil[index] !== undefined) {
    audioState.sensorPulseUntil[index] = now + audioState.pulseDurationMs;
  }
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const bigint = parseInt(normalized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function getAqiColor(value) {
  const greenColor = "#54b948";
  const yellowColor = "#ffff00";
  const redColor = "#da1c5c";

  if (value >= state.aqMaxVal) {
    return state.overMaxColor;
  }

  if (value <= state.aqMinVal) {
    return greenColor;
  }

  if (value <= state.aqMaxVal / 2) {
    const amount = (value - state.aqMinVal) / (state.aqMaxVal / 2 - state.aqMinVal);
    return lerpColor(greenColor, yellowColor, amount);
  }

  const amount = (value - state.aqMaxVal / 2) / (state.aqMaxVal - state.aqMaxVal / 2);
  return lerpColor(yellowColor, redColor, amount);
}

function lerpColor(colorA, colorB, amount) {
  const t = clamp(amount, 0, 1);
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bVal = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bVal})`;
}

function drawRoundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

class SensorDrawer {
  constructor() {
    this.aqi = 0;
    this.updatedTime = "-";
    this.updatedAtMs = null;
    this.sensorID = 0;
    this.locationName = "";
  }

  setup(sensorID, locationName) {
    this.sensorID = sensorID;
    this.locationName = locationName;
  }

  setData(dataKey, value) {
    const intValue = parseInt(value, 10);
    if (dataKey === "aqi") {
      this.aqi = intValue;
    }
  }

  setLastUpdated(lastUpdated) {
    this.updatedTime = this.formatTime(lastUpdated);
    const parsed = Date.parse(lastUpdated);
    this.updatedAtMs = Number.isNaN(parsed) ? null : parsed;
  }

  formatTime(updatedTime) {
    const updatedDate = new Date(updatedTime);
    const year = updatedDate.getFullYear();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[updatedDate.getMonth()];
    const day = updatedDate.getDate();

    let hours = updatedDate.getHours();
    const minutes = updatedDate.getMinutes();
    const period = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
    return `${month} ${day}, ${year} ${hours}:${formattedMinutes} ${period}`;
  }

  setFillColor(value) {
    ctx.fillStyle = getAqiColor(value);
  }

  isStale() {
    if (!Number.isFinite(this.updatedAtMs)) {
      return false;
    }
    return Date.now() - this.updatedAtMs > state.staleThresholdMs;
  }

  draw(x, y, index) {
    const aqi = Math.round(this.aqi);
    const pulseActive = audioState.sensorPulseUntil[index] > performance.now();
    const stale = this.isStale();

    ctx.save();
    ctx.translate(0, 0);
    if (stale) {
      ctx.fillStyle = "#6e6e6e";
    } else {
      this.setFillColor(aqi);
    }
    drawRoundedRect(x - state.aqiSize / 2, y - state.aqiSize / 2, state.aqiSize, state.aqiSize, 10);

    if (pulseActive) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.globalAlpha = 0.7;
      ctx.strokeRect(
        x - state.aqiSize / 2 - 3,
        y - state.aqiSize / 2 - 3,
        state.aqiSize + 6,
        state.aqiSize + 6
      );
      ctx.globalAlpha = 1;
    }

    const isPhone = window.innerWidth <= 600;
    const aqiFontSize = isPhone ? (aqi >= 100 ? 24 : 28) : aqi >= 100 ? 28 : 32;
    ctx.font = `${aqiFontSize}px Arial`;
    ctx.fillStyle = stale ? "#e0e0e0" : "#0000ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const numberX = aqi >= 100 ? x - 1 : x;
    const numberY = isPhone ? y + 9 : y + 10;
    ctx.fillText(aqi.toString(), numberX, numberY);

    ctx.font = "24px Arial";
    ctx.fillStyle = stale ? "#bdbdbd" : "#ffffff";
    ctx.textAlign = "left";
    const locationX = x + 40;
    ctx.fillText(this.locationName, locationX, y + 7);
    const infoStartX = getPlaybackInfoStartX(x);
    this.drawStatusTag(infoStartX, y, stale, index);
    this.drawPlaybackInfo(infoStartX, y, this.sensorID, index);
    this.drawChangeDot(infoStartX, y, index);

    if (state.showDetails) {
      ctx.font = "14px Arial";
      ctx.fillText(this.updatedTime, x + 40, y + 22);

      ctx.font = "12px Arial";
      ctx.fillText(`(${this.sensorID.toString()})`, x + 40, y + 38);
    }
    ctx.restore();
  }

  drawStatusTag(infoStartX, y, stale, index) {
    if (!audioState.isPlaying || state.showDetails) {
      return;
    }

    const badgeWidth = 72;
    const badgeHeight = 16;
    const badgeX = infoStartX;
    const badgeY = y - 6;
    if (badgeX + badgeWidth + 12 >= state.canvasWidth) {
      return;
    }
    const sensorID = this.sensorID;
    const playing = !stale && isSensorAudible(sensorID, index);

    let bgColor = "rgba(170, 170, 170, 0.22)";
    let textColor = "#d0d0d0";
    let label = "OFFLINE";
    if (!stale) {
      if (playing) {
        bgColor = "rgba(84, 185, 72, 0.35)";
        textColor = "#bfffd0";
        label = "PLAYING";
      } else {
        bgColor = "rgba(218, 28, 92, 0.28)";
        textColor = "#ffc0d4";
        label = "RESTING";
      }
    }

    ctx.fillStyle = bgColor;
    drawRoundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 8);
    ctx.font = "10px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = textColor;
    ctx.fillText(label, badgeX + 6, badgeY + 12);
  }

  drawPlaybackInfo(infoStartX, y, sensorID, index) {
    if (!audioState.isPlaying || state.showDetails) {
      return;
    }

    const panelX = infoStartX + 78;
    const availableWidth = state.canvasWidth - panelX - 10;
    if (availableWidth < 74) {
      return;
    }
    const panelWidth = Math.min(94, availableWidth);
    const panelHeight = 18;
    const panelY = y - 8;

    const windowedHistory = getWindowedHistory(sensorID);
    const historyLength = windowedHistory.length;

    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    drawRoundedRect(panelX, panelY, panelWidth, panelHeight, 6);

    const playbackData = audioState.lastPlaybackBySensorId[sensorID];
    const msSinceTrigger = playbackData ? Date.now() - playbackData.ts : Number.POSITIVE_INFINITY;
    const recentlyTriggered = msSinceTrigger <= 1600;

    ctx.font = "10px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    let noteRangeLabel = "--->--";
    if (historyLength > 0) {
      const startValue = windowedHistory[0].value;
      const endValue = windowedHistory[historyLength - 1].value;
      const startNote = midiToNoteName(aqiToMidi(startValue, index));
      const endNote = midiToNoteName(aqiToMidi(endValue, index));
      noteRangeLabel = `${startNote}->${endNote}`;
    }
    const infoText = fitTextToWidth(`${historyLength}pts ${noteRangeLabel}`, panelWidth - 8);
    ctx.fillStyle = recentlyTriggered || audioState.activeSensorIndex === index ? "#ffffff" : "#aaaaaa";
    ctx.fillText(infoText, panelX + 4, panelY + 13);
  }

  drawChangeDot(infoStartX, y, index) {
    if (!audioState.isPlaying || state.showDetails) {
      return;
    }
    if (audioState.activeSensorIndex !== index) {
      return;
    }
    const sensorID = this.sensorID;
    const playbackData = audioState.lastPlaybackBySensorId[sensorID];
    const lastPlaybackTs = playbackData ? playbackData.ts : 0;
    const lastDataTs = audioState.lastDataChangeBySensorId[sensorID] || 0;
    const latestTs = Math.max(lastPlaybackTs, lastDataTs);
    const ageMs = Date.now() - latestTs;
    if (ageMs > 1800) {
      return;
    }

    const alpha = clamp(1 - ageMs / 1800, 0.25, 1);
    const dotX = infoStartX + 64;
    const dotY = y;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

init();
