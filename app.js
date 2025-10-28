const folderInput = document.getElementById("folderInput");
const fileInput = document.getElementById("fileInput");
const fileStatus = document.getElementById("fileStatus");
const settingsForm = document.getElementById("settingsForm");
const generateBtn = document.getElementById("generateBtn");
const summaryCard = document.getElementById("summaryCard");
const summaryEl = document.getElementById("summary");
const downloadBtn = document.getElementById("downloadBtn");
const manualAdjustmentInput = document.getElementById("manualAdjustment");
const targetTotalTimeInput = document.getElementById("targetTotalTime");

let clips = [];
let currentSrtBlobUrl = null;

folderInput.addEventListener("change", (event) => {
  handleFileSelection(event.target.files);
  event.target.value = "";
});

fileInput.addEventListener("change", (event) => {
  handleFileSelection(event.target.files);
  event.target.value = "";
});

settingsForm.addEventListener("change", (event) => {
  if (event.target.name === "mode") {
    toggleSettingGroups(event.target.value);
  }
});

downloadBtn.addEventListener("click", () => {
  if (!downloadBtn.disabled) {
    triggerDownload();
  }
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!clips.length || generateBtn.disabled) {
    return;
  }
  await generateSrt();
});

function toggleSettingGroups(activeMode) {
  document
    .querySelectorAll(".setting-group")
    .forEach((group) => group.classList.remove("active"));
  const activeGroup = document.querySelector(
    `.setting-group[data-setting="${activeMode}"]`
  );
  if (activeGroup) {
    activeGroup.classList.add("active");
  }
}

function handleFileSelection(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) {
    return;
  }

  const pairs = new Map();
  const skipped = [];

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "wav" && extension !== "txt") {
      continue;
    }

    const baseName = file.name.slice(0, file.name.length - (extension.length + 1));
    if (!baseName) {
      skipped.push(file.name);
      continue;
    }

    const existing = pairs.get(baseName) ?? { baseName };
    if (extension === "wav") {
      existing.wav = file;
    } else {
      existing.txt = file;
    }
    pairs.set(baseName, existing);
  }

  const completePairs = Array.from(pairs.values()).filter(
    (item) => item.wav && item.txt
  );

  completePairs.sort((a, b) =>
    a.baseName.localeCompare(b.baseName, "ja", { numeric: true, sensitivity: "base" })
  );

  clips = completePairs;
  updateGenerateButton();
  updateFileStatus({
    totalFiles: files.length,
    pairCount: completePairs.length,
    skipped,
    incomplete: Array.from(pairs.values())
      .filter((item) => !(item.wav && item.txt))
      .map((item) => item.baseName),
  });

  summaryCard.hidden = true;
  summaryEl.innerHTML = "";
  downloadBtn.disabled = true;
  revokeSrtUrl();
}

function updateGenerateButton() {
  const count = clips.length;
  generateBtn.disabled = count === 0;
  generateBtn.textContent = count
    ? `SRTを生成する（${count}クリップ）`
    : "SRTを生成する";
}

function updateFileStatus({ totalFiles, pairCount, skipped, incomplete }) {
  if (!totalFiles) {
    fileStatus.textContent = "";
    return;
  }

  const statusParts = [
    `<strong>${pairCount}</strong> 件の字幕ペアを検出しました。`,
    `読み込んだファイル数：${totalFiles}`,
  ];

  if (incomplete.length) {
    statusParts.push(
      `ペアが揃わなかったファイル：${incomplete
        .map((name) => `<code>${name}</code>`)
        .join(", ")}`
    );
  }

  if (skipped.length) {
    statusParts.push(
      `対応していない形式のファイル：${skipped
        .map((name) => `<code>${name}</code>`)
        .join(", ")}`
    );
  }

  fileStatus.innerHTML = statusParts.join("<br>");
}

async function generateSrt() {
  generateBtn.disabled = true;
  const originalBtnText = generateBtn.textContent;
  generateBtn.textContent = "解析中...";

  let audioContext;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const subtitles = [];
    const durations = [];

    for (const clip of clips) {
      const [dialogue, duration] = await Promise.all([
        clip.txt.text(),
        decodeWavDuration(audioContext, clip.wav),
      ]);
      subtitles.push({ ...clip, dialogue: dialogue.trim() });
      durations.push(duration);
    }

    const totalOriginal = durations.reduce((sum, value) => sum + value, 0);
    const mode = new FormData(settingsForm).get("mode") || "auto";

    let perClipAdjustment = 0;
    let targetTotal = totalOriginal;
    let appliedModeLabel = "自動調整";
    let autoFallback = false;

    if (mode === "manual") {
      perClipAdjustment = Number.parseFloat(manualAdjustmentInput.value || "0") || 0;
      appliedModeLabel = "手動調整";
    } else {
      const inputTarget = Number.parseFloat(targetTotalTimeInput.value);
      if (Number.isFinite(inputTarget) && inputTarget > 0) {
        targetTotal = inputTarget;
      } else {
        autoFallback = true;
      }
      perClipAdjustment = (targetTotal - totalOriginal) / subtitles.length;
    }

    const { srtText, finalTotal } = buildSrt(subtitles, durations, perClipAdjustment);

    showSummary({
      clipCount: subtitles.length,
      totalOriginal,
      finalTotal,
      perClipAdjustment,
      modeLabel: appliedModeLabel,
      autoFallback,
      targetTotal,
    });

    prepareDownload(srtText);
  } catch (error) {
    console.error(error);
    alert("SRT生成中にエラーが発生しました。ブラウザがwavファイルを読み込めない可能性があります。");
  } finally {
    if (
      audioContext &&
      audioContext.state !== "closed" &&
      typeof audioContext.close === "function"
    ) {
      try {
        await audioContext.close();
      } catch (closeError) {
        console.warn("AudioContextを閉じる際に問題が発生しました", closeError);
      }
    }

    generateBtn.disabled = false;
    generateBtn.textContent = originalBtnText;
  }
}

async function decodeWavDuration(audioContext, file) {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return audioBuffer.duration;
}

function buildSrt(subtitles, durations, perClipAdjustment) {
  let currentTime = 0;
  let srtLines = [];

  subtitles.forEach((subtitle, index) => {
    const originalDuration = durations[index];
    const adjustedDuration = Math.max(originalDuration + perClipAdjustment, 0.01);
    const startTime = formatTime(currentTime);
    const endTime = formatTime(currentTime + adjustedDuration);

    srtLines.push(`${index + 1}`);
    srtLines.push(`${startTime} --> ${endTime}`);
    srtLines.push(subtitle.dialogue || "");
    srtLines.push("");

    currentTime = Number.parseFloat((currentTime + adjustedDuration).toFixed(6));
  });

  const finalTotal = currentTime;
  return { srtText: srtLines.join("\r\n"), finalTotal };
}

function formatTime(seconds) {
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function showSummary({
  clipCount,
  totalOriginal,
  finalTotal,
  perClipAdjustment,
  modeLabel,
  autoFallback,
  targetTotal,
}) {
  summaryCard.hidden = false;
  downloadBtn.disabled = false;

  const rows = [
    `<dt>クリップ数</dt><dd>${clipCount}</dd>`,
    `<dt>元の合計時間</dt><dd>${totalOriginal.toFixed(2)} 秒</dd>`,
    `<dt>調整後の合計時間</dt><dd>${finalTotal.toFixed(2)} 秒</dd>`,
    `<dt>モード</dt><dd>${modeLabel}</dd>`,
    `<dt>クリップあたりの調整値</dt><dd>${perClipAdjustment.toFixed(4)} 秒</dd>`,
  ];

  if (modeLabel === "自動調整") {
    rows.splice(4, 0, `<dt>目標合計時間</dt><dd>${targetTotal.toFixed(2)} 秒</dd>`);
  }

  summaryEl.innerHTML = `<dl>${rows.join("")}</dl>`;

  if (autoFallback) {
    summaryEl.innerHTML +=
      '<p class="hint">目標合計時間が未入力だったため、元の合計時間を基準に計算しました。</p>';
  }
}

function prepareDownload(srtText) {
  revokeSrtUrl();
  const blob = new Blob([srtText], { type: "text/plain;charset=utf-8" });
  currentSrtBlobUrl = URL.createObjectURL(blob);
  downloadBtn.dataset.url = currentSrtBlobUrl;
}

function triggerDownload() {
  const url = downloadBtn.dataset.url;
  if (!url) {
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "output.srt";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function revokeSrtUrl() {
  if (currentSrtBlobUrl) {
    URL.revokeObjectURL(currentSrtBlobUrl);
    currentSrtBlobUrl = null;
    delete downloadBtn.dataset.url;
  }
}

window.addEventListener("beforeunload", () => {
  revokeSrtUrl();
});
