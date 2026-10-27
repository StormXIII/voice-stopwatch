// ============================================================
//  State
// ============================================================
const display = document.querySelector("#timerDisplay");
const status = document.querySelector("#timerStatus");
const resetButton = document.querySelector("#resetButton");
const voiceToggle = document.querySelector("#voiceToggle");
const voiceToggleText = voiceToggle.querySelector(".voice-toggle-text");

const state = {
  elapsed: 0,
  startedAt: null,
  rafId: null,
};

// ============================================================
//  Format & render
// ============================================================
function formatTime(milliseconds) {
  const totalCentiseconds = Math.floor(milliseconds / 10);
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  return (
    [minutes, seconds].map((u) => String(u).padStart(2, "0")).join(":") +
    `.${String(centiseconds).padStart(2, "0")}`
  );
}

function currentElapsed() {
  return state.startedAt === null
    ? state.elapsed
    : state.elapsed + (performance.now() - state.startedAt);
}

function statusLabel() {
  if (state.startedAt !== null) return "计时中";
  if (state.elapsed > 0) return "已暂停";
  return "准备开始";
}

function render() {
  display.textContent = formatTime(currentElapsed());
  if (state.startedAt !== null) {
    state.rafId = requestAnimationFrame(render);
  }
}

// ============================================================
//  Actions
// ============================================================
function start() {
  if (state.startedAt !== null) return;
  state.startedAt = performance.now();
  setBaseStatus("计时中");
  render();
}

function pause() {
  if (state.startedAt === null) return;
  state.elapsed += performance.now() - state.startedAt;
  state.startedAt = null;
  cancelAnimationFrame(state.rafId);
  setBaseStatus("已暂停");
  render();
}

function reset() {
  state.elapsed = 0;
  state.startedAt = null;
  cancelAnimationFrame(state.rafId);
  setBaseStatus("准备开始");
  render();
}

function toggle() {
  if (state.startedAt !== null) pause();
  else start();
}

function setBaseStatus(text) {
  status.textContent = text;
  status.style.color = "";
}

let flashTimerId = null;
function flashStatus(text, color) {
  if (flashTimerId) clearTimeout(flashTimerId);
  status.textContent = text;
  status.style.color = color;
  flashTimerId = setTimeout(() => {
    setBaseStatus(statusLabel());
    flashTimerId = null;
  }, 1200);
}

// ============================================================
//  Voice recognition (Web Speech API)
// ============================================================
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let voiceActive = false;
let lastTriggerAt = 0;
let triggeredCommand = null;

// Single source of truth: regex drives matching, label/hint drive the help modal.
const VOICE_COMMANDS = [
  {
    action: "start",
    label: "开始",
    hint: "开始 · 启动 · 继续",
    pattern: /开始|启动|继续/i,
  },
  {
    action: "pause",
    label: "暂停",
    hint: "暂停 · 停止 · 停",
    pattern: /暂停|停止|停(?!下)/i,
  },
  {
    action: "reset",
    label: "清零",
    hint: "清零 · 重置 · 归零",
    pattern: /清零|重置|归零/i,
  },
];

function matchCommand(text) {
  for (const { action, pattern } of VOICE_COMMANDS) {
    if (pattern.test(text)) return action;
  }
  return null;
}

function startVoice() {
  if (!SpeechRecognition) {
    flashStatus("当前浏览器不支持语音", "#c44545");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    const transcript = result[0].transcript.trim();
    const isFinal = result.isFinal;

    // A final result always ends the utterance: clear the per-utterance
    // marker even if the server revised the text into a non-matching phrase.
    const alreadyTriggered = triggeredCommand;
    if (isFinal) triggeredCommand = null;

    const command = matchCommand(transcript);
    if (!command) return;

    const now = performance.now();
    if (now - lastTriggerAt < 400) return;

    // Interim results keep being revised by the server: mark and act once;
    // don't re-act when the final result confirms the same command.
    if (isFinal) {
      if (alreadyTriggered === command) return;
    } else {
      if (alreadyTriggered) return;
      triggeredCommand = command;
    }

    lastTriggerAt = now;
    executeCommand(command);
  };

  recognition.onerror = (event) => {
    switch (event.error) {
      case "not-allowed":
      case "service-not-allowed":
        flashStatus("麦克风权限被拒绝", "#c44545");
        stopVoice();
        return;
      case "audio-capture":
        flashStatus("未检测到麦克风", "#c44545");
        stopVoice();
        return;
      case "network":
        flashStatus("无法连接语音服务（Chrome 需访问 Google，建议用 Safari）", "#c44545");
        return;
      case "no-speech":
        return;
      default:
        return;
    }
  };

  recognition.onend = () => {
    triggeredCommand = null;
    if (voiceActive) {
      setTimeout(() => {
        if (voiceActive && recognition) {
          try { recognition.start(); } catch (_) { /* swallow */ }
        }
      }, 120);
    }
  };

  try {
    recognition.start();
  } catch (_) {
    flashStatus("无法启动语音识别", "#c44545");
    return;
  }

  voiceActive = true;
  voiceToggle.setAttribute("aria-pressed", "true");
  voiceToggleText.textContent = "监听中";
}

function stopVoice() {
  voiceActive = false;
  if (recognition) {
    try { recognition.stop(); } catch (_) { /* swallow */ }
    recognition = null;
  }
  voiceToggle.setAttribute("aria-pressed", "false");
  voiceToggleText.textContent = "语音";

  if (flashTimerId) {
    clearTimeout(flashTimerId);
    flashTimerId = null;
  }
  setBaseStatus(statusLabel());
}

function executeCommand(command) {
  switch (command) {
    case "start":
      start();
      flashStatus("已识别：开始", "#2e7d32");
      break;
    case "pause":
      pause();
      flashStatus("已识别：暂停", "#2e7d32");
      break;
    case "reset":
      reset();
      flashStatus("已识别：清零", "#2e7d32");
      break;
  }
}

function toggleVoice() {
  if (voiceActive) stopVoice();
  else startVoice();
}

if (!SpeechRecognition) {
  voiceToggle.style.display = "none";
}

// ============================================================
//  Wire up
// ============================================================
// ============================================================
//  Voice command help modal
// ============================================================
const helpButton = document.querySelector("#helpButton");
const helpOverlay = document.querySelector("#helpOverlay");
const helpClose = document.querySelector("#helpClose");
const commandList = document.querySelector("#commandList");

for (const { label, hint } of VOICE_COMMANDS) {
  const item = document.createElement("li");
  item.className = "command-item";

  const action = document.createElement("span");
  action.className = "command-action";
  action.textContent = label;

  const words = document.createElement("span");
  words.className = "command-words";
  words.textContent = hint;

  item.append(action, words);
  commandList.append(item);
}

function openHelp() {
  helpOverlay.hidden = false;
  helpButton.setAttribute("aria-expanded", "true");
  helpClose.focus();
}

function closeHelp() {
  helpOverlay.hidden = true;
  helpButton.setAttribute("aria-expanded", "false");
  helpButton.focus();
}

helpButton.addEventListener("click", openHelp);
helpClose.addEventListener("click", closeHelp);

// Click on backdrop (outside .modal) closes.
helpOverlay.addEventListener("click", (event) => {
  if (event.target === helpOverlay) closeHelp();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !helpOverlay.hidden) {
    closeHelp();
    return;
  }
  if (event.code !== "Space" || event.repeat) return;
  if (!helpOverlay.hidden) return; // Modal open: Space scrolls / activates, don't toggle timer.
  const tag = (event.target && event.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  event.preventDefault();
  toggle();
});

resetButton.addEventListener("click", reset);
voiceToggle.addEventListener("click", toggleVoice);

render();
