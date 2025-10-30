const folderInput = document.getElementById("folderInput");
const fileInput = document.getElementById("fileInput");
const openPickerButton = document.getElementById("openPickerButton");
const pickerToggle = document.getElementById("pickerToggle");
const selectedFiles = document.getElementById("selectedFiles");
const settingsForm = document.getElementById("settingsForm");
const modeInput = document.getElementById("modeInput");
const autoModeToggle = document.getElementById("autoModeToggle");
const resultsSection = document.getElementById("results");
const clipCountEl = document.getElementById("clipCount");
const originalTotalEl = document.getElementById("originalTotal");
const adjustmentEl = document.getElementById("adjustment");
const targetTotalEl = document.getElementById("targetTotal");
const logEl = document.getElementById("log");
const downloadLink = document.getElementById("downloadLink");
const frameToggle = document.getElementById("enableFrameLock");
const frameRateInput = document.getElementById("frameRate");
const trimFrameOverflowInput = document.getElementById("trimFrameOverflow");
const frameRatePresetContainer = document.getElementById("frameRatePresets");
const frameRateStatEl = document.getElementById("frameRateStat");
const frameAlignedTotalEl = document.getElementById("frameAlignedTotal");
const frameDriftEl = document.getElementById("frameDrift");
const frameRateControl = document.querySelector(".frame-rate-control");
const openSettingsButton = document.getElementById("openSettingsButton");
const settingsPanel = document.getElementById("settingsPanel");
const settingsOverlay = settingsPanel?.querySelector("[data-close-settings]");
const settingsContent = settingsPanel?.querySelector(".settings-panel__content");
const closeSettingsButton = document.getElementById("closeSettingsButton");
const themeToggle = document.getElementById("themeToggle");
const rootElement = document.documentElement;

const manualSettings = document.querySelector('.mode-settings[data-mode="manual"]');
const autoSettings = document.querySelector('.mode-settings[data-mode="auto"]');

let storedFiles = [];
let currentDownloadUrl = null;
let pickerMode = "folder";
let lastFocusedElement = null;
let frameRatePresetButtons = [];

const setDownloadLinkEnabled = (enabled) => {
  if (!downloadLink) return;
  downloadLink.setAttribute("aria-disabled", String(!enabled));
};

const applyTheme = (theme) => {
  if (theme === "dark") {
    rootElement.dataset.theme = "dark";
  } else {
    rootElement.dataset.theme = "light";
  }
};

const storedTheme = localStorage.getItem("theme");
const prefersDark =
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : { matches: false };
const initialTheme = storedTheme ?? (prefersDark.matches ? "dark" : "light");
applyTheme(initialTheme);
if (themeToggle) {
  themeToggle.checked = initialTheme === "dark";
  themeToggle.addEventListener("change", () => {
    const nextTheme = themeToggle.checked ? "dark" : "light";
    applyTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
  });

  if (!storedTheme) {
    const handlePrefersChange = (event) => {
      const persistedTheme = localStorage.getItem("theme");
      if (persistedTheme) return;
      const nextTheme = event.matches ? "dark" : "light";
      applyTheme(nextTheme);
      themeToggle.checked = nextTheme === "dark";
    };

    if (typeof prefersDark.addEventListener === "function") {
      prefersDark.addEventListener("change", handlePrefersChange);
    } else if (typeof prefersDark.addListener === "function") {
      prefersDark.addListener(handlePrefersChange);
    }
  }
} else if (storedTheme) {
  applyTheme(storedTheme);
}

const getFocusableElements = (container) => {
  if (!container) return [];
  const selectors =
    'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(selectors)).filter((el) => {
    const rect = el.getBoundingClientRect();
    return !(rect.width === 0 && rect.height === 0);
  });
};

const openSettings = () => {
  if (!settingsPanel) return;
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  settingsPanel.classList.add("open");
  settingsPanel.removeAttribute("aria-hidden");
  openSettingsButton?.setAttribute("aria-expanded", "true");
  document.body.style.overflow = "hidden";
  const focusable = getFocusableElements(settingsContent);
  const target = focusable[0] ?? closeSettingsButton;
  requestAnimationFrame(() => target?.focus());
};

const closeSettings = () => {
  if (!settingsPanel) return;
  settingsPanel.classList.remove("open");
  settingsPanel.setAttribute("aria-hidden", "true");
  openSettingsButton?.setAttribute("aria-expanded", "false");
  document.body.style.overflow = "";
  if (lastFocusedElement) {
    requestAnimationFrame(() => lastFocusedElement?.focus());
  }
};

openSettingsButton?.addEventListener("click", openSettings);
closeSettingsButton?.addEventListener("click", closeSettings);
settingsOverlay?.addEventListener("click", closeSettings);

settingsPanel?.addEventListener("keydown", (event) => {
  if (!settingsPanel.classList.contains("open")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeSettings();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = getFocusableElements(settingsContent);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey) {
    if (document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

selectedFiles.textContent = "ファイルが選択されていません";
selectedFiles.classList.add("empty");
setDownloadLinkEnabled(false);

if (pickerToggle && openPickerButton) {
  const pickerOptions = Array.from(
    pickerToggle.querySelectorAll(".picker-option[data-picker-mode]")
  );

  const setPickerMode = (mode) => {
    if (!mode) return;
    pickerMode = mode;
    pickerOptions.forEach((button) => {
      const isActive = button.dataset.pickerMode === mode;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  };

  const activeButton = pickerOptions.find((button) => button.classList.contains("active"));
  setPickerMode(activeButton?.dataset.pickerMode ?? "folder");

  pickerOptions.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.pickerMode;
      if (mode && mode !== pickerMode) {
        setPickerMode(mode);
      }
    });
  });

  openPickerButton.addEventListener("click", () => {
    if (pickerMode === "folder") {
      folderInput?.click();
    } else {
      fileInput?.click();
    }
  });

  const syncModeFromInput = (mode) => {
    if (!mode || mode === pickerMode) return;
    setPickerMode(mode);
  };

  folderInput?.addEventListener("click", () => syncModeFromInput("folder"));
  fileInput?.addEventListener("click", () => syncModeFromInput("file"));
  folderInput?.addEventListener("change", () => setPickerMode("folder"));
  fileInput?.addEventListener("change", () => setPickerMode("file"));
}

if (autoModeToggle && modeInput) {
  const updateModeVisibility = () => {
    const useAuto = autoModeToggle.checked;
    modeInput.value = useAuto ? "auto" : "manual";
    manualSettings?.classList.toggle("hidden", useAuto);
    autoSettings?.classList.toggle("hidden", !useAuto);
    const manualInput = settingsForm?.elements["manualAdjustment"];
    const autoInput = settingsForm?.elements["targetTotalTime"];
    if (manualInput) {
      manualInput.disabled = useAuto;
    }
    if (autoInput) {
      autoInput.disabled = !useAuto;
    }
    document
      .querySelectorAll(".auto-only")
      .forEach((el) => (el.style.display = useAuto ? "flex" : "none"));
  };

  updateModeVisibility();
  autoModeToggle.addEventListener("change", updateModeVisibility);
}

if (frameRatePresetContainer && frameRateInput) {
  frameRatePresetButtons = Array.from(
    frameRatePresetContainer.querySelectorAll(".chip[data-frame-rate]")
  );

  const activatePreset = (targetButton) => {
    frameRatePresetButtons.forEach((button) => {
      const isActive = button === targetButton;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  };

  frameRatePresetButtons.forEach((button) => {
    if (!button.hasAttribute("aria-pressed")) {
      button.setAttribute("aria-pressed", String(button.classList.contains("active")));
    }

    button.addEventListener("click", () => {
      if (button.disabled) return;
      const value = button.dataset.frameRate;
      activatePreset(button);
      if (value && value !== "custom") {
        frameRateInput.value = value;
      }
      if (value === "custom") {
        frameRateInput.focus();
      }
    });
  });

  const syncPresetFromInput = () => {
    const currentValue = Number(frameRateInput.value);
    const matched = frameRatePresetButtons.find((button) => {
      const presetValue = Number(button.dataset.frameRate);
      return button.dataset.frameRate !== "custom" && Number.isFinite(presetValue)
        ? Math.abs(presetValue - currentValue) < 1e-3
        : false;
    });

    if (matched) {
      activatePreset(matched);
    } else {
      const customButton = frameRatePresetButtons.find(
        (button) => button.dataset.frameRate === "custom"
      );
      if (customButton) {
        activatePreset(customButton);
      }
    }
  };

  syncPresetFromInput();
  frameRateInput.addEventListener("input", syncPresetFromInput);
}

const syncFrameOptionsVisibility = () => {
  if (!frameToggle || !frameRateInput) return;
  const enabled = frameToggle.checked;
  frameRateInput.disabled = !enabled;
  frameRateControl?.classList.toggle("disabled", !enabled);
  if (trimFrameOverflowInput) {
    trimFrameOverflowInput.disabled = !enabled;
  }
  frameRatePresetButtons.forEach((button) => {
    button.disabled = !enabled;
  });
};

if (frameToggle && frameRateInput) {
  syncFrameOptionsVisibility();
  frameToggle.addEventListener("change", syncFrameOptionsVisibility);
}

function handleFileSelection(files) {
  storedFiles = Array.from(files);

  if (!storedFiles.length) {
    selectedFiles.textContent = "ファイルが選択されていません";
    selectedFiles.classList.add("empty");
    return;
  }

  const list = storedFiles
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "ja"))
    .map((file) => `• ${file.webkitRelativePath || file.name}`)
    .join("\n");

  selectedFiles.textContent = list;
  selectedFiles.classList.remove("empty");
}

folderInput?.addEventListener("change", (event) => {
  if (event.target.files?.length) {
    handleFileSelection(event.target.files);
    if (fileInput) {
      fileInput.value = "";
    }
  }
});

fileInput?.addEventListener("change", (event) => {
  if (event.target.files?.length) {
    handleFileSelection(event.target.files);
    if (folderInput) {
      folderInput.value = "";
    }
  }
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!storedFiles.length) {
    alert("先に音声とテキストのファイルを選択してください。");
    return;
  }

  try {
    const { pairs, warnings } = await buildFilePairs(storedFiles);

    if (!pairs.length) {
      alert("同名の .wav と .txt のペアが見つかりませんでした。");
      return;
    }

    const mode = modeInput?.value ?? "manual";
    const manualAdjustment = parseFloat(settingsForm.elements["manualAdjustment"].value || "0");
    const targetTotalTime = parseFloat(settingsForm.elements["targetTotalTime"].value || "0");
    const frameLockEnabled = settingsForm.elements["enableFrameLock"]?.checked ?? false;
    const frameRateValue = parseFloat(settingsForm.elements["frameRate"]?.value || "0");
    const trimFrameOverflow =
      settingsForm.elements["trimFrameOverflow"]?.checked ?? false;

    if (frameLockEnabled && !(frameRateValue > 0)) {
      alert("フレームレートには 0 より大きい数値を指定してください。");
      return;
    }

    const processingResult = await processPairs({
      pairs,
      mode,
      manualAdjustment,
      targetTotalTime,
      frameOptions: {
        enabled: frameLockEnabled,
        frameRate: frameRateValue,
        trimOverflow: trimFrameOverflow,
      },
    });

    showResults({ ...processingResult, warnings }, mode);
  } catch (error) {
    console.error(error);
    alert(`エラーが発生しました: ${error.message}`);
  }
});

async function buildFilePairs(files) {
  const textFiles = new Map();
  const audioFiles = new Map();

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const baseName = file.name.replace(/\.[^.]+$/, "");

    if (extension === "txt") {
      textFiles.set(baseName, file);
    } else if (extension === "wav") {
      audioFiles.set(baseName, file);
    }
  }

  const allTextNames = Array.from(textFiles.keys());
  const allAudioNames = Array.from(audioFiles.keys());

  const baseNames = allTextNames.filter((name) => audioFiles.has(name));
  baseNames.sort((a, b) => a.localeCompare(b, "ja", { numeric: true, sensitivity: "base" }));

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("このブラウザは Web Audio API に対応していません。");
  }

  const audioContext = new AudioContextConstructor();

  const pairs = [];

  for (const baseName of baseNames) {
    const textFile = textFiles.get(baseName);
    const audioFile = audioFiles.get(baseName);

    if (!textFile || !audioFile) continue;

    const [dialogue, duration] = await Promise.all([
      textFile.text().then((text) => text.trim()),
      getAudioDuration(audioContext, audioFile),
    ]);

    pairs.push({ baseName, dialogue, duration });
  }

  await audioContext.close();

  const warnings = [];

  const missingAudio = allTextNames.filter((name) => !audioFiles.has(name));
  if (missingAudio.length) {
    warnings.push(`音声が見つからないテキスト: ${missingAudio.join(", ")}`);
  }

  const missingText = allAudioNames.filter((name) => !textFiles.has(name));
  if (missingText.length) {
    warnings.push(`テキストが見つからない音声: ${missingText.join(", ")}`);
  }

  return { pairs, warnings };
}

async function getAudioDuration(audioContext, file) {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return audioBuffer.duration;
}

function formatTime(seconds) {
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;

  const pad = (value, length = 2) => String(value).padStart(length, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(milliseconds, 3)}`;
}

function formatSigned(value, decimals = 4) {
  const fixed = value.toFixed(decimals);
  return value >= 0 ? `+${fixed}` : fixed;
}

async function processPairs({
  pairs,
  mode,
  manualAdjustment,
  targetTotalTime,
  frameOptions,
}) {
  const durations = pairs.map((pair) => pair.duration);
  const originalTotal = durations.reduce((sum, value) => sum + value, 0);

  let adjustment = manualAdjustment;
  let targetTotal = null;

  if (mode === "auto") {
    const clipCount = pairs.length;
    if (!clipCount) {
      throw new Error("処理対象のクリップがありません");
    }
    targetTotal = targetTotalTime;
    adjustment = clipCount ? (targetTotalTime - originalTotal) / clipCount : 0;
  }

  const frameRateEnabled =
    frameOptions?.enabled && Number.isFinite(frameOptions.frameRate) && frameOptions.frameRate > 0;
  const frameRate = frameRateEnabled ? frameOptions.frameRate : null;
  const trimOverflow = frameRateEnabled && Boolean(frameOptions?.trimOverflow);

  let rawTimeline = 0;
  let quantizedTimeline = 0;
  let currentFrame = 0;
  const lines = [];
  const log = [];

  pairs.forEach((pair, index) => {
    const adjustedDuration = Math.max(pair.duration + adjustment, 0);
    const originalEnd = rawTimeline + adjustedDuration;
    rawTimeline = originalEnd;

    let startSeconds;
    let endSeconds;
    let outputDuration = adjustedDuration;
    let framesUsed = null;

    if (frameRateEnabled) {
      const startFrame = currentFrame;
      const rawFrames = adjustedDuration * frameRate;
      if (trimOverflow) {
        const flooredFrames = Math.floor(rawFrames + 1e-9);
        framesUsed = Math.max(flooredFrames, 0);
      } else {
        const minFrames = adjustedDuration > 0 ? 1 : 0;
        const roundedFrames = Math.round(rawFrames);
        framesUsed = Math.max(roundedFrames, minFrames);
      }
      const endFrame = startFrame + framesUsed;
      startSeconds = startFrame / frameRate;
      endSeconds = endFrame / frameRate;
      outputDuration = endSeconds - startSeconds;
      currentFrame = endFrame;
      quantizedTimeline = endSeconds;
    } else {
      startSeconds = quantizedTimeline;
      endSeconds = startSeconds + adjustedDuration;
      outputDuration = adjustedDuration;
      quantizedTimeline = endSeconds;
    }

    const startTime = formatTime(startSeconds);
    const endTime = formatTime(endSeconds);

    lines.push(`${index + 1}\n${startTime} --> ${endTime}\n${pair.dialogue}\n`);

    const parts = [`原音 ${pair.duration.toFixed(3)}s`];
    if (Math.abs(pair.duration - adjustedDuration) > 1e-6) {
      parts.push(`調整後 ${adjustedDuration.toFixed(3)}s`);
    }
    parts.push(`出力 ${outputDuration.toFixed(3)}s`);

    let entry = `${index + 1}. ${pair.baseName}.wav (${parts.join(", ")}`;

    if (frameRateEnabled) {
      const perClipDrift = outputDuration - adjustedDuration;
      const cumulativeDrift = quantizedTimeline - rawTimeline;
      entry += ` | ${framesUsed} frames | Δ=${formatSigned(perClipDrift)}s | 累積=${formatSigned(
        cumulativeDrift
      )}s`;
    }

    entry += `)`;
    log.push(entry);
  });

  const srtContent = lines.join("\n");

  const timelineDrift = quantizedTimeline - rawTimeline;

  if (frameRateEnabled) {
    log.push(
      "",
      `フレーム揃え: ${frameRate.toFixed(3)} fps`,
      `出力された合計時間: ${quantizedTimeline.toFixed(3)} 秒`,
      `累積のずれ: ${formatSigned(timelineDrift, 6)} 秒`
    );
    if (trimOverflow) {
      log.push("(フレームからはみ出した余剰時間を切り捨て設定が有効)");
    }
  }

  return {
    clipCount: pairs.length,
    originalTotal,
    adjustment,
    targetTotal,
    srtContent,
    log,
    frameLock: {
      enabled: frameRateEnabled,
      frameRate,
      total: quantizedTimeline,
      drift: timelineDrift,
      trimOverflow,
    },
  };
}

function showResults(result, mode) {
  clipCountEl.textContent = result.clipCount.toString();
  originalTotalEl.textContent = `${result.originalTotal.toFixed(2)} 秒`;
  adjustmentEl.textContent = `${result.adjustment.toFixed(4)} 秒`;

  if (mode === "auto" && typeof result.targetTotal === "number") {
    targetTotalEl.textContent = `${result.targetTotal.toFixed(2)} 秒`;
  } else {
    targetTotalEl.textContent = "-";
  }

  const frameLockEnabled = result.frameLock?.enabled;
  document.querySelectorAll(".frame-only").forEach((el) => {
    el.style.display = frameLockEnabled ? "flex" : "none";
  });

  if (frameLockEnabled && result.frameLock?.frameRate) {
    frameRateStatEl.textContent = `${result.frameLock.frameRate.toFixed(3)} fps`;
    frameAlignedTotalEl.textContent = `${result.frameLock.total.toFixed(3)} 秒`;
    frameDriftEl.textContent = `${formatSigned(result.frameLock.drift, 4)} 秒`;
  } else {
    frameRateStatEl.textContent = "-";
    frameAlignedTotalEl.textContent = "-";
    frameDriftEl.textContent = "-";
  }

  const messages = [...result.log];
  if (result.warnings?.length) {
    messages.push("\n⚠️ 警告:");
    messages.push(...result.warnings.map((warning) => `- ${warning}`));
  }

  logEl.textContent = messages.join("\n");

  const blob = new Blob([result.srtContent], { type: "text/plain;charset=utf-8" });
  if (currentDownloadUrl) {
    URL.revokeObjectURL(currentDownloadUrl);
  }
  currentDownloadUrl = URL.createObjectURL(blob);
  downloadLink.href = currentDownloadUrl;
  downloadLink.download = "output.srt";
  setDownloadLinkEnabled(true);

  resultsSection.hidden = false;
}
