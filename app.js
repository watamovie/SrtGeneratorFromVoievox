const folderInput = document.getElementById("folderInput");
const fileInput = document.getElementById("fileInput");
const selectedFiles = document.getElementById("selectedFiles");
const settingsForm = document.getElementById("settingsForm");
const resultsSection = document.getElementById("results");
const clipCountEl = document.getElementById("clipCount");
const originalTotalEl = document.getElementById("originalTotal");
const adjustmentEl = document.getElementById("adjustment");
const targetTotalEl = document.getElementById("targetTotal");
const frameRateInfoEl = document.getElementById("frameRateInfo");
const quantizedTotalEl = document.getElementById("quantizedTotal");
const frameDriftEl = document.getElementById("frameDrift");
const logEl = document.getElementById("log");
const downloadLink = document.getElementById("downloadLink");
const frameOnlyElements = document.querySelectorAll(".frame-only");

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
    const frameRateInput = settingsForm.elements["frameRate"].value?.trim();

    let frameRate = null;
    if (frameRateInput) {
      const parsedFrameRate = Number(frameRateInput);
      if (!Number.isFinite(parsedFrameRate) || parsedFrameRate <= 0) {
        alert("フレームレートには正の数値を入力してください。");
        return;
      }
      frameRate = parsedFrameRate;
    }

    const processingResult = await processPairs({
      pairs,
      mode,
      manualAdjustment,
      targetTotalTime,
      frameRate,
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

function formatFps(value) {
  const fixed = value.toFixed(3);
  return fixed.replace(/\.0+$/, "").replace(/\.(\d*[1-9])0+$/, ".$1");
}

async function processPairs({ pairs, mode, manualAdjustment, targetTotalTime, frameRate }) {
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

  const adjustedDurations = pairs.map((pair) => Math.max(pair.duration + adjustment, 0));
  const intendedTotal = adjustedDurations.reduce((sum, value) => sum + value, 0);

  const useFrameSnap = typeof frameRate === "number" && frameRate > 0;
  const frameDuration = useFrameSnap ? 1 / frameRate : null;

  let currentTime = 0;
  let currentFrame = 0;
  const lines = [];
  const log = [];

  pairs.forEach((pair, index) => {
    const adjustedDuration = adjustedDurations[index];

    let startSeconds = currentTime;
    let endSeconds = currentTime + adjustedDuration;
    let finalDuration = adjustedDuration;
    let durationFrames = null;

    if (useFrameSnap && frameDuration) {
      const startFrame = currentFrame;
      durationFrames = adjustedDuration <= 0 ? 0 : Math.max(1, Math.round(adjustedDuration / frameDuration));
      const endFrame = startFrame + durationFrames;
      startSeconds = startFrame * frameDuration;
      endSeconds = endFrame * frameDuration;
      finalDuration = endSeconds - startSeconds;
      currentFrame = endFrame;
      currentTime = endSeconds;
    } else {
      currentTime = endSeconds;
    }

    const startTime = formatTime(startSeconds);
    const endTime = formatTime(endSeconds);

    lines.push(`${index + 1}\n${startTime} --> ${endTime}\n${pair.dialogue}\n`);

    let entry = `${index + 1}. ${pair.baseName}.wav (${pair.duration.toFixed(3)}s) → ${finalDuration.toFixed(3)}s`;

    if (useFrameSnap && durationFrames !== null) {
      const diff = finalDuration - adjustedDuration;
      const diffMs = Math.abs(diff * 1000);
      const diffText = diffMs >= 0.5 ? `, Δ${diff >= 0 ? "+" : ""}${diff.toFixed(3)}s` : "";
      entry += ` (${durationFrames}f${diffText})`;
    }

    log.push(entry);
  });

  const srtContent = lines.join("\n");

  const quantizedTotal = useFrameSnap ? currentTime : intendedTotal;
  const frameDrift = useFrameSnap ? quantizedTotal - intendedTotal : 0;

  return {
    clipCount: pairs.length,
    originalTotal,
    adjustment,
    targetTotal,
    intendedTotal,
    quantizedTotal,
    frameRate: useFrameSnap ? frameRate : null,
    frameDrift,
    srtContent,
    log,
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

  if (result.frameRate) {
    frameOnlyElements.forEach((el) => (el.style.display = ""));
    const formattedFps = formatFps(result.frameRate);
    frameRateInfoEl.textContent = `${formattedFps} fps`;
    quantizedTotalEl.textContent = `${result.quantizedTotal.toFixed(3)} 秒`;
    const drift = result.frameDrift ?? 0;
    const driftText = `${drift >= 0 ? "+" : ""}${drift.toFixed(3)} 秒`;
    frameDriftEl.textContent = driftText;
  } else {
    frameOnlyElements.forEach((el) => (el.style.display = "none"));
    frameRateInfoEl.textContent = "未使用";
    quantizedTotalEl.textContent = "-";
    frameDriftEl.textContent = "-";
  }

  const messages = [...result.log];
  if (result.frameRate) {
    const drift = result.frameDrift ?? 0;
    const formattedFps = formatFps(result.frameRate);
    const driftText = `${drift >= 0 ? "+" : ""}${drift.toFixed(3)} 秒`;
    messages.unshift(`▶ フレーム補正 ${formattedFps} fps（差分 ${driftText}）`);
  }
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
