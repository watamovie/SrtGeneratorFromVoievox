const folderInput = document.getElementById("folderInput");
const fileInput = document.getElementById("fileInput");
const selectedFiles = document.getElementById("selectedFiles");
const settingsForm = document.getElementById("settingsForm");
const resultsSection = document.getElementById("results");
const clipCountEl = document.getElementById("clipCount");
const originalTotalEl = document.getElementById("originalTotal");
const adjustmentEl = document.getElementById("adjustment");
const targetTotalEl = document.getElementById("targetTotal");
const outputTotalEl = document.getElementById("outputTotal");
const frameAlignmentEl = document.getElementById("frameAlignment");
const logEl = document.getElementById("log");
const downloadLink = document.getElementById("downloadLink");
const enableFrameAlignInput = document.getElementById("enableFrameAlign");
const frameRateWrapper = document.getElementById("frameRateWrapper");
const frameRateInput = document.getElementById("frameRate");

let storedFiles = [];
let currentDownloadUrl = null;

selectedFiles.textContent = "ファイルが選択されていません";
selectedFiles.classList.add("empty");

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

folderInput.addEventListener("change", (event) => {
  if (event.target.files?.length) {
    handleFileSelection(event.target.files);
    fileInput.value = "";
  }
});

fileInput.addEventListener("change", (event) => {
  if (event.target.files?.length) {
    handleFileSelection(event.target.files);
    folderInput.value = "";
  }
});

settingsForm.addEventListener("change", (event) => {
  if (event.target.name === "mode") {
    const mode = event.target.value;
    document
      .querySelectorAll(".mode-settings")
      .forEach((el) => el.classList.toggle("hidden", el.dataset.mode !== mode));

    document
      .querySelectorAll(".auto-only")
      .forEach((el) => el.style.display = mode === "auto" ? "flex" : "none");
  }
});

enableFrameAlignInput?.addEventListener("change", () => {
  const shouldShow = enableFrameAlignInput.checked;
  frameRateWrapper?.classList.toggle("hidden", !shouldShow);
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

    const mode = settingsForm.elements["mode"].value;
    const manualAdjustment = parseFloat(settingsForm.elements["manualAdjustment"].value || "0");
    const targetTotalTime = parseFloat(settingsForm.elements["targetTotalTime"].value || "0");
    const alignToFrame = enableFrameAlignInput?.checked ?? false;
    const frameRateValue = parseFloat(frameRateInput?.value || "0");

    if (alignToFrame && !(Number.isFinite(frameRateValue) && frameRateValue > 0)) {
      alert("フレームレートには1以上の数値を入力してください。");
      return;
    }

    const processingResult = await processPairs({
      pairs,
      mode,
      manualAdjustment,
      targetTotalTime,
      frameRate: alignToFrame && Number.isFinite(frameRateValue) && frameRateValue > 0 ? frameRateValue : null,
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

function quantizeDownToFrame(time, fps) {
  const epsilon = 1e-9;
  const frames = Math.floor(time * fps + epsilon);
  return Math.max(0, frames / fps);
}

function quantizeUpToFrame(time, fps) {
  const epsilon = 1e-9;
  const frames = Math.ceil(time * fps - epsilon);
  return Math.max(0, frames / fps);
}

function formatFrameRate(frameRate) {
  if (Number.isInteger(frameRate)) {
    return frameRate.toString();
  }
  return frameRate.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

async function processPairs({ pairs, mode, manualAdjustment, targetTotalTime, frameRate }) {
  const durations = pairs.map((pair) => pair.duration);
  const originalTotal = durations.reduce((sum, value) => sum + value, 0);

  let adjustment = manualAdjustment;
  let targetTotal = null;
  const frameAlignmentEnabled = typeof frameRate === "number" && Number.isFinite(frameRate) && frameRate > 0;

  if (mode === "auto") {
    const clipCount = pairs.length;
    if (!clipCount) {
      throw new Error("処理対象のクリップがありません");
    }
    targetTotal = targetTotalTime;
    adjustment = clipCount ? (targetTotalTime - originalTotal) / clipCount : 0;
  }

  let currentTime = 0;
  const lines = [];
  const log = [];
  let outputTotal = 0;

  pairs.forEach((pair, index) => {
    const adjustedDuration = Math.max(pair.duration + adjustment, 0);
    let startValue = currentTime;
    let endValue = currentTime + adjustedDuration;

    if (frameAlignmentEnabled) {
      startValue = quantizeDownToFrame(startValue, frameRate);
      endValue = quantizeUpToFrame(endValue, frameRate);
      if (endValue < startValue) {
        endValue = startValue;
      }
    }

    const startTime = formatTime(startValue);
    const endTime = formatTime(endValue);

    lines.push(`${index + 1}\n${startTime} --> ${endTime}\n${pair.dialogue}\n`);

    const outputDuration = endValue - startValue;
    let logMessage = `${index + 1}. ${pair.baseName}.wav (${pair.duration.toFixed(3)}s) → ${adjustedDuration.toFixed(3)}s`;
    if (frameAlignmentEnabled) {
      logMessage += ` / フレーム揃え後: ${outputDuration.toFixed(3)}s`;
    }

    log.push(logMessage);

    currentTime = frameAlignmentEnabled ? endValue : currentTime + adjustedDuration;
    outputTotal += outputDuration;
  });

  const srtContent = lines.join("\n");

  return {
    clipCount: pairs.length,
    originalTotal,
    adjustment,
    targetTotal,
    srtContent,
    log,
    outputTotal,
    frameAlignment: frameAlignmentEnabled ? { frameRate, label: formatFrameRate(frameRate) } : null,
  };
}

function showResults(result, mode) {
  clipCountEl.textContent = result.clipCount.toString();
  originalTotalEl.textContent = `${result.originalTotal.toFixed(2)} 秒`;
  adjustmentEl.textContent = `${result.adjustment.toFixed(4)} 秒`;
  outputTotalEl.textContent = `${(result.outputTotal ?? 0).toFixed(2)} 秒`;
  frameAlignmentEl.textContent = result.frameAlignment ? `${result.frameAlignment.label} fps` : "なし";

  if (mode === "auto" && typeof result.targetTotal === "number") {
    targetTotalEl.textContent = `${result.targetTotal.toFixed(2)} 秒`;
  } else {
    targetTotalEl.textContent = "-";
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

  resultsSection.hidden = false;
}
