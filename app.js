const dropzone = document.getElementById("dropzone");
const uploadStep = document.getElementById("uploadStep");
const settingsStep = document.getElementById("settingsStep");
const resultsSection = document.getElementById("results");
const workflowNav = document.getElementById("workflowNav");
const workflowButtons = document.querySelectorAll("[data-step-button]");

const folderInput = document.getElementById("folderInput");
const fileInput = document.getElementById("fileInput");
const selectFilesButton = document.getElementById("selectFilesButton");
const selectFolderButton = document.getElementById("selectFolderButton");
const jumpToUploadButton = document.getElementById("jumpToUpload");
const reuploadFilesButton = document.getElementById("reuploadFilesButton");
const regenerateButton = document.getElementById("regenerateButton");
const logoLink = document.getElementById("logoLink");

const selectedFiles = document.getElementById("selectedFiles");
const settingsForm = document.getElementById("settingsForm");
const modeInput = document.getElementById("modeInput");
const autoModeToggle = document.getElementById("autoModeToggle");
const clipCountEl = document.getElementById("clipCount");
const originalTotalEl = document.getElementById("originalTotal");
const adjustmentEl = document.getElementById("adjustment");
const targetTotalEl = document.getElementById("targetTotal");
const logEl = document.getElementById("log");
const downloadLink = document.getElementById("downloadLink");
const frameToggle = document.getElementById("enableFrameLock");
const frameRateOptionsEl = document.getElementById("frameRateOptions");
const frameRateInput = document.getElementById("frameRate");
const trimFrameOverflowInput = document.getElementById("trimFrameOverflow");
const frameRatePresetContainer = document.getElementById("frameRatePresets");
const frameRateStatEl = document.getElementById("frameRateStat");
const frameAlignedTotalEl = document.getElementById("frameAlignedTotal");
const frameDriftEl = document.getElementById("frameDrift");

const manualSettings = document.querySelector('.mode-settings[data-mode="manual"]');
const autoSettings = document.querySelector('.mode-settings[data-mode="auto"]');

let storedFiles = [];
let currentDownloadUrl = null;
let autoProcessOnSelection = false;
let hasResults = false;
const stepOrder = ["upload", "settings", "results"];

const resetSelectionDisplay = () => {
  if (!selectedFiles) return;
  selectedFiles.textContent = "ファイルが選択されていません";
  selectedFiles.classList.add("empty");
};

const renderSelectedFiles = (files) => {
  if (!selectedFiles) return;

  if (!files.length) {
    resetSelectionDisplay();
    return;
  }

  const counts = files.reduce(
    (acc, file) => {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension === "wav") acc.audio += 1;
      if (extension === "txt") acc.text += 1;
      return acc;
    },
    { audio: 0, text: 0 }
  );

  const list = files
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "ja"))
    .map((file) => file.webkitRelativePath || file.name);

  selectedFiles.classList.remove("empty");
  selectedFiles.innerHTML = "";

  const summary = document.createElement("div");
  summary.className = "selection-summary";
  summary.textContent = `${files.length}件を読み込みました`;

  const sub = document.createElement("small");
  sub.textContent = `音声 ${counts.audio} / テキスト ${counts.text} ・ ペア候補 ${Math.min(
    counts.audio,
    counts.text
  )}`;
  summary.appendChild(sub);

  const note = document.createElement("p");
  note.className = "selection-note muted";
  note.textContent = "ファイル名順に並べて処理します。";

  const listEl = document.createElement("ul");
  listEl.className = "selected-file-list";
  list.forEach((name) => {
    const item = document.createElement("li");
    item.textContent = name;
    listEl.appendChild(item);
  });

  selectedFiles.append(summary, note, listEl);
};

resetSelectionDisplay();

const focusUploadStep = () => {
  uploadStep?.scrollIntoView({ behavior: "smooth", block: "start" });
  dropzone?.focus({ preventScroll: true });
};

const setWorkflowMode = (active) => {
  document.body.classList.toggle("workflow-mode", active);
  if (workflowNav) {
    workflowNav.hidden = !active;
  }
};

const updateStepIndicators = (step) => {
  const currentIndex = stepOrder.indexOf(step);
  workflowButtons.forEach((button) => {
    const name = button.dataset.stepButton;
    const index = stepOrder.indexOf(name);
    const isActive = name === step;
    button.classList.toggle("active", isActive);
    button.classList.toggle("completed", index !== -1 && index < currentIndex);
    button.setAttribute("aria-current", isActive ? "step" : "false");
  });
};

const resetToLanding = () => {
  storedFiles = [];
  hasResults = false;
  autoProcessOnSelection = false;
  if (fileInput) fileInput.value = "";
  if (folderInput) folderInput.value = "";
  resetSelectionDisplay();
  goToStep("upload", { scroll: false });
  window.scrollTo({ top: 0, behavior: "smooth" });
  highlightDropzone();
};

const goToStep = (step, { scroll = true } = {}) => {
  if (step === "results" && !hasResults) return;

  const shouldEnterWorkflow = step !== "upload" || storedFiles.length > 0 || hasResults;
  setWorkflowMode(shouldEnterWorkflow);
  const targets = {
    upload: uploadStep,
    settings: settingsStep,
    results: resultsSection,
  };

  Object.entries(targets).forEach(([name, element]) => {
    if (!element) return;
    const isActive = name === step;
    element.hidden = !isActive;
    if (isActive && scroll) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  updateStepIndicators(step);
};

workflowButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.stepButton;
    if (target) {
      goToStep(target);
    }
  });
});

logoLink?.addEventListener("click", (event) => {
  event.preventDefault();
  resetToLanding();
});

updateStepIndicators("upload");

const highlightDropzone = () => {
  dropzone?.classList.add("active");
  setTimeout(() => dropzone?.classList.remove("active"), 800);
};

if (frameToggle && frameRateOptionsEl && frameRateInput) {
  const syncFrameOptionsVisibility = () => {
    const enabled = frameToggle.checked;
    frameRateInput.disabled = !enabled;
    if (trimFrameOverflowInput) {
      trimFrameOverflowInput.disabled = !enabled;
    }
    if (frameRatePresetContainer) {
      frameRatePresetContainer
        .querySelectorAll("button")
        .forEach((button) => {
          button.disabled = !enabled;
        });
    }
  };

  syncFrameOptionsVisibility();
  frameToggle.addEventListener("change", syncFrameOptionsVisibility);
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
  const presetButtons = Array.from(
    frameRatePresetContainer.querySelectorAll(".frame-rate-chip[data-frame-rate]")
  );

  const activatePreset = (targetButton) => {
    presetButtons.forEach((button) => {
      const isActive = button === targetButton;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  };

  presetButtons.forEach((button) => {
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
    const matched = presetButtons.find((button) => {
      const presetValue = Number(button.dataset.frameRate);
      return button.dataset.frameRate !== "custom" && Number.isFinite(presetValue)
        ? Math.abs(presetValue - currentValue) < 1e-3
        : false;
    });

    if (matched) {
      activatePreset(matched);
    } else {
      const customButton = presetButtons.find((button) => button.dataset.frameRate === "custom");
      if (customButton) {
        activatePreset(customButton);
      }
    }
  };

  syncPresetFromInput();
  frameRateInput.addEventListener("input", syncPresetFromInput);
}

const handleFileSelection = (files) => {
  storedFiles = Array.from(files);

  if (!storedFiles.length) {
    renderSelectedFiles([]);
    return;
  }

  renderSelectedFiles(storedFiles);
  hasResults = false;
  goToStep("settings");

  if (autoProcessOnSelection) {
    autoProcessOnSelection = false;
    processCurrentSelection();
  }
};

const extractFilesFromItems = async (items) => {
  const traverseEntry = (entry, path = "") =>
    new Promise((resolve, reject) => {
      if (entry.isFile) {
        entry.file(
          (file) => {
            file.webkitRelativePath = path + file.name;
            resolve([file]);
          },
          (error) => reject(error)
        );
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = [];
        const readEntries = () => {
          reader.readEntries(async (batch) => {
            if (!batch.length) {
              const children = await Promise.all(
                entries.map((child) => traverseEntry(child, `${path}${entry.name}/`))
              );
              resolve(children.flat());
            } else {
              entries.push(...batch);
              readEntries();
            }
          }, reject);
        };
        readEntries();
      } else {
        resolve([]);
      }
    });

  const allEntries = items
    .map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null))
    .filter(Boolean);

  const collected = await Promise.all(allEntries.map((entry) => traverseEntry(entry)));
  return collected.flat();
};

const handleDrop = async (event) => {
  event.preventDefault();
  dropzone?.classList.remove("active");

  const { dataTransfer } = event;
  if (!dataTransfer) return;

  if (dataTransfer.items?.length && dataTransfer.items[0].webkitGetAsEntry) {
    const files = await extractFilesFromItems(Array.from(dataTransfer.items));
    handleFileSelection(files);
  } else if (dataTransfer.files?.length) {
    handleFileSelection(dataTransfer.files);
  }
};

if (dropzone) {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("active");
    });
  });

  ["dragleave", "dragend"].forEach((eventName) => {
    dropzone.addEventListener(eventName, () => dropzone.classList.remove("active"));
  });

  dropzone.addEventListener("drop", handleDrop);
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectFilesButton?.click();
    }
  });
}

selectFilesButton?.addEventListener("click", () => {
  autoProcessOnSelection = false;
  fileInput?.click();
});

selectFolderButton?.addEventListener("click", () => {
  autoProcessOnSelection = false;
  folderInput?.click();
});

folderInput?.addEventListener("change", (event) => {
  if (event.target.files?.length) {
    handleFileSelection(event.target.files);
    fileInput && (fileInput.value = "");
  }
});

fileInput?.addEventListener("change", (event) => {
  if (event.target.files?.length) {
    handleFileSelection(event.target.files);
    folderInput && (folderInput.value = "");
  }
});

jumpToUploadButton?.addEventListener("click", () => {
  goToStep("upload");
  focusUploadStep();
  highlightDropzone();
});

reuploadFilesButton?.addEventListener("click", () => {
  autoProcessOnSelection = true;
  hasResults = false;
  goToStep("upload");
  focusUploadStep();
  highlightDropzone();
});

regenerateButton?.addEventListener("click", () => {
  goToStep("settings");
});

settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  autoProcessOnSelection = false;
  processCurrentSelection();
});

async function processCurrentSelection() {
  if (!storedFiles.length) {
    alert("先に音声とテキストのファイルを選択してください。");
    setWorkflowMode(false);
    uploadStep.hidden = false;
    settingsStep.hidden = true;
    resultsSection.hidden = true;
    updateStepIndicators("upload");
    focusUploadStep();
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
    const trimFrameOverflow = settingsForm.elements["trimFrameOverflow"]?.checked ?? false;

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
}

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

  hasResults = true;
  goToStep("results");
}

const contactForm = document.querySelector(".contact-form");
const contactStatus = document.getElementById("contactStatus");
const contactSubmitButton = document.getElementById("contactSubmitButton");
const contactFrame = document.getElementById("contactFormFrame");

if (contactForm && contactStatus && contactSubmitButton && contactFrame) {
  let isSubmittingContact = false;

  const resetContactForm = (message) => {
    contactSubmitButton.disabled = false;
    contactSubmitButton.textContent = "送信する";
    contactStatus.textContent = message;
  };

  contactForm.addEventListener("submit", () => {
    isSubmittingContact = true;
    contactSubmitButton.disabled = true;
    contactSubmitButton.textContent = "送信中...";
    contactStatus.textContent = "送信しています...";
  });

  contactFrame.addEventListener("load", () => {
    if (!isSubmittingContact) return;
    isSubmittingContact = false;
    contactForm.reset();
    resetContactForm("送信が完了しました。ありがとうございました！");
  });
}
