const fileInput = document.getElementById("file-input");
const dropZone = document.getElementById("drop-zone");
const fileSummary = document.getElementById("file-summary");
const generateBtn = document.getElementById("generate-btn");
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const downloadLink = document.getElementById("download-link");
const manualInput = document.getElementById("manual-adjustment");
const targetInput = document.getElementById("target-total-time");
const optionsForm = document.getElementById("options-form");

const fileGroups = new Map();
let currentDownloadUrl = null;

const resetOutput = () => {
  if (currentDownloadUrl) {
    URL.revokeObjectURL(currentDownloadUrl);
    currentDownloadUrl = null;
  }

  statusEl.textContent = "";
  statusEl.classList.remove("error");
  previewEl.hidden = true;
  previewEl.value = "";
  downloadLink.hidden = true;
  downloadLink.removeAttribute("href");
};

const normalizeName = (file) => {
  const { name } = file;
  const dotIndex = name.lastIndexOf(".");
  const base = dotIndex === -1 ? name : name.slice(0, dotIndex);
  return base.trim();
};

const groupFiles = (files) => {
  let added = 0;
  for (const file of files) {
    if (!file?.name) continue;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "txt" && ext !== "wav") continue;

    const baseName = normalizeName(file);
    if (!fileGroups.has(baseName)) {
      fileGroups.set(baseName, { text: null, audio: null });
    }

    const entry = fileGroups.get(baseName);
    if (ext === "txt") {
      entry.text = file;
      added += 1;
    } else if (ext === "wav") {
      entry.audio = file;
      added += 1;
    }
  }

  if (added > 0) {
    renderSummary();
  }
};

const renderSummary = () => {
  resetOutput();

  if (fileGroups.size === 0) {
    fileSummary.hidden = true;
    generateBtn.disabled = true;
    return;
  }

  const lines = [];
  let complete = 0;
  let missingText = 0;
  let missingAudio = 0;

  const sortedEntries = Array.from(fileGroups.entries()).sort(([a], [b]) =>
    a.localeCompare(b, "ja")
  );

  for (const [name, entry] of sortedEntries) {
    if (entry.text && entry.audio) {
      complete += 1;
      lines.push(`✅ ${name}: txt & wav`);
    } else if (entry.text && !entry.audio) {
      missingAudio += 1;
      lines.push(`⚠️ ${name}: wav が見つかりません`);
    } else if (!entry.text && entry.audio) {
      missingText += 1;
      lines.push(`⚠️ ${name}: txt が見つかりません`);
    }
  }

  const header = [`読み込んだペア数: ${complete}`, `txtのみ: ${missingText}`, `wavのみ: ${missingAudio}`];

  fileSummary.hidden = false;
  fileSummary.textContent = `${header.join(" / ")}` + (lines.length ? `\n\n${lines.join("\n")}` : "");
  generateBtn.disabled = complete === 0;
};

fileInput.addEventListener("change", (event) => {
  if (!event.target.files) return;
  groupFiles(event.target.files);
  fileInput.value = ""; // allow re-selection of same files
});

const preventDefaults = (event) => {
  event.preventDefault();
  event.stopPropagation();
};

["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, preventDefaults, false);
});

dropZone.addEventListener("dragover", () => dropZone.classList.add("dragover"));
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));

dropZone.addEventListener("drop", async (event) => {
  dropZone.classList.remove("dragover");
  const items = event.dataTransfer?.items;

  try {
    if (items) {
      const files = await getFilesFromItems(items);
      groupFiles(files);
    } else if (event.dataTransfer?.files) {
      groupFiles(event.dataTransfer.files);
    }
  } catch (error) {
    console.error(error);
    statusEl.textContent = "ファイルの読み込みに失敗しました";
    statusEl.classList.add("error");
  }
});

dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

optionsForm.addEventListener("change", () => {
  const mode = optionsForm.elements.namedItem("mode").value;
  manualInput.disabled = mode !== "manual";
  targetInput.disabled = mode !== "auto";
  resetOutput();
});

const getFilesFromItems = async (items) => {
  const directFiles = [];
  const pending = [];

  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      pending.push(getFilesFromEntry(entry));
    } else {
      const file = item.getAsFile?.();
      if (file) {
        directFiles.push(file);
      }
    }
  }

  const nested = await Promise.all(pending);
  return directFiles.concat(...nested);
};

const getFilesFromEntry = (entry) => {
  return new Promise((resolve, reject) => {
    if (entry.isFile) {
      entry.file((file) => resolve([file]), reject);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const files = [];

      const readEntries = () => {
        reader.readEntries((entries) => {
          if (!entries.length) {
            resolve(files);
            return;
          }

          Promise.all(entries.map(getFilesFromEntry))
            .then((results) => {
              results.forEach((inner) => files.push(...inner));
              readEntries();
            })
            .catch(reject);
        }, reject);
      };

      readEntries();
    } else {
      resolve([]);
    }
  });
};

const formatTime = (seconds) => {
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const pad = (value, digits) => String(value).padStart(digits, "0");
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(milliseconds, 3)}`;
};

const readText = (file) => file.text().then((text) => text.trim());

const decodeDuration = async (audioContext, file) => {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return audioBuffer.duration;
};

const createSrt = (entries, adjustment) => {
  let index = 1;
  let currentTime = 0;
  const chunks = [];

  for (const entry of entries) {
    const start = formatTime(currentTime);
    const endTime = currentTime + entry.duration + adjustment;

    if (endTime <= currentTime) {
      throw new Error(
        `${entry.name} の調整後の長さが0秒以下になりました。調整値を見直してください。`
      );
    }

    const end = formatTime(endTime);

    chunks.push(`${index}`);
    chunks.push(`${start} --> ${end}`);
    chunks.push(`${entry.dialogue}`);
    chunks.push("");

    currentTime = endTime;
    index += 1;
  }

  return chunks.join("\n");
};

const formatNumber = (value, decimals = 2) => {
  return Number.parseFloat(value.toFixed(decimals)).toString();
};

const generateSrt = async () => {
  resetOutput();

  const mode = optionsForm.elements.namedItem("mode").value;
  const sortedEntries = Array.from(fileGroups.entries())
    .filter(([, entry]) => entry.text && entry.audio)
    .sort(([a], [b]) => a.localeCompare(b, "ja"));

  if (sortedEntries.length === 0) {
    statusEl.textContent = "有効なペアがありません。txtとwavの両方を読み込んでください。";
    statusEl.classList.add("error");
    return;
  }

  generateBtn.disabled = true;
  statusEl.textContent = "解析中…音声をデコードしています";

  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const entries = [];

    for (const [name, entry] of sortedEntries) {
      const [dialogue, duration] = await Promise.all([
        readText(entry.text),
        decodeDuration(audioContext, entry.audio),
      ]);
      entries.push({ name, dialogue, duration });
    }

    const totalDuration = entries.reduce((acc, item) => acc + item.duration, 0);
    let adjustment = 0;
    const notes = [`原音声の合計: ${formatNumber(totalDuration)} 秒`];

    if (mode === "manual") {
      const manualValue = Number.parseFloat(manualInput.value);
      if (Number.isNaN(manualValue)) {
        throw new Error("手動調整値を入力してください。");
      }
      adjustment = manualValue;
      notes.push(`手動調整: 各クリップに ${manualValue} 秒を加算`);
    } else if (mode === "auto") {
      const targetValue = Number.parseFloat(targetInput.value);
      if (Number.isNaN(targetValue)) {
        throw new Error("目標の全体時間を入力してください。");
      }
      if (entries.length === 0) {
        throw new Error("有効なクリップがありません。");
      }
      const difference = targetValue - totalDuration;
      adjustment = difference / entries.length;
      notes.push(
        `自動調整: 目標 ${targetValue} 秒 / 1クリップあたり ${formatNumber(adjustment, 4)} 秒`
      );
    }

    const srt = createSrt(entries, adjustment);

    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    currentDownloadUrl = URL.createObjectURL(blob);

    downloadLink.href = currentDownloadUrl;
    downloadLink.hidden = false;

    previewEl.hidden = false;
    previewEl.value = srt;

    statusEl.textContent = notes.join("\n");

    await audioContext.close();
  } catch (error) {
    console.error(error);
    statusEl.textContent = error.message || "予期しないエラーが発生しました";
    statusEl.classList.add("error");
  } finally {
    generateBtn.disabled = false;
  }
};

generateBtn.addEventListener("click", () => {
  generateSrt();
});
