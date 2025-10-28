const directoryInput = document.getElementById('directoryInput');
const fileInput = document.getElementById('fileInput');
const modeRadios = document.querySelectorAll('input[name="mode"]');
const manualField = document.querySelector('.mode-fields[data-mode="manual"]');
const autoField = document.querySelector('.mode-fields[data-mode="auto"]');
const manualAdjustmentInput = document.getElementById('manualAdjustment');
const targetTimeInput = document.getElementById('targetTime');
const generateBtn = document.getElementById('generateBtn');
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');

modeRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    updateModeFields(radio.value);
  });
});

function updateModeFields(activeMode) {
  manualField.classList.toggle('active', activeMode === 'manual');
  autoField.classList.toggle('active', activeMode === 'auto');
}

updateModeFields('none');

generateBtn.addEventListener('click', async () => {
  summaryEl.hidden = true;
  summaryEl.innerHTML = '';
  const files = collectFiles();

  if (files.length === 0) {
    statusEl.textContent = '処理するWAV/TXTファイルを選択してください。';
    return;
  }

  statusEl.textContent = 'ファイルを解析しています…';

  try {
    const { pairs, missing, duplicates } = preparePairs(files);

    if (pairs.length === 0) {
      statusEl.textContent = '対応するWAVとTXTのペアが見つかりませんでした。';
      showSummary(null, { missing, duplicates });
      return;
    }

    const mode = getSelectedMode();
    const options = getModeOptions(mode);

    const result = await createSrt(pairs, options);

    downloadSrt(result.content);
    statusEl.textContent = 'SRTファイルを生成し、ダウンロードを開始しました。';
    showSummary(result.stats, { missing, duplicates });
  } catch (error) {
    console.error(error);
    statusEl.textContent = '処理中にエラーが発生しました。ブラウザのコンソールを確認してください。';
  }
});

function collectFiles() {
  const selected = [];
  const seen = new Set();

  const add = (fileList) => {
    Array.from(fileList || []).forEach((file) => {
      const key = file.webkitRelativePath || file.name;
      if (seen.has(key)) return;
      seen.add(key);
      selected.push(file);
    });
  };

  add(directoryInput.files);
  add(fileInput.files);
  return selected;
}

function preparePairs(files) {
  const entries = new Map();
  const duplicates = [];

  for (const file of files) {
    const name = file.name.toLowerCase();
    if (!(name.endsWith('.wav') || name.endsWith('.txt'))) {
      continue;
    }

    const relativePath = file.webkitRelativePath || file.name;
    const baseKey = relativePath.replace(/\.[^/.]+$/, '');
    const displayName = baseKey.split(/[\\/]/).pop();

    if (!entries.has(baseKey)) {
      entries.set(baseKey, { baseKey, displayName, wav: null, txt: null });
    }

    const entry = entries.get(baseKey);

    if (name.endsWith('.wav')) {
      if (entry.wav) {
        duplicates.push(`${relativePath}（WAVが重複）`);
      }
      entry.wav = file;
    } else if (name.endsWith('.txt')) {
      if (entry.txt) {
        duplicates.push(`${relativePath}（TXTが重複）`);
      }
      entry.txt = file;
    }
  }

  const pairs = [];
  const missing = [];

  entries.forEach((entry) => {
    if (entry.wav && entry.txt) {
      pairs.push(entry);
    } else {
      const missingTypes = [!entry.wav && 'WAV', !entry.txt && 'TXT']
        .filter(Boolean)
        .join(' / ');
      missing.push(`${entry.displayName}: ${missingTypes} が不足`);
    }
  });

  pairs.sort((a, b) => a.baseKey.localeCompare(b.baseKey, 'ja'));

  return { pairs, missing, duplicates };
}

function getSelectedMode() {
  const checked = Array.from(modeRadios).find((radio) => radio.checked);
  return checked ? checked.value : 'none';
}

function getModeOptions(mode) {
  if (mode === 'manual') {
    const value = Number.parseFloat(manualAdjustmentInput.value);
    if (Number.isNaN(value)) {
      throw new Error('手動調整値が数値として認識できません。');
    }
    return { mode, manualAdjustment: value };
  }

  if (mode === 'auto') {
    const value = Number.parseFloat(targetTimeInput.value);
    if (Number.isNaN(value) || value <= 0) {
      throw new Error('目標合計時間は0より大きい数値で指定してください。');
    }
    return { mode, targetTotal: value };
  }

  return { mode: 'none' };
}

async function createSrt(pairs, options) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('このブラウザはAudioContextに対応していません。最新のブラウザをご利用ください。');
  }

  const audioCtx = new AudioCtx();
  await audioCtx.resume().catch(() => {});

  const entries = [];

  try {
    for (const pair of pairs) {
      const [dialogue, duration] = await Promise.all([
        pair.txt.text(),
        decodeWavDuration(audioCtx, pair.wav),
      ]);

      entries.push({
        displayName: pair.displayName,
        dialogue: dialogue.trim(),
        duration,
      });
    }
  } finally {
    await audioCtx.close();
  }

  const durations = entries.map((entry) => entry.duration);
  const originalTotal = durations.reduce((sum, value) => sum + value, 0);

  let perClipAdjustment = 0;
  let targetTotal = null;

  if (options.mode === 'manual') {
    perClipAdjustment = options.manualAdjustment;
  } else if (options.mode === 'auto') {
    targetTotal = options.targetTotal;
    perClipAdjustment = (targetTotal - originalTotal) / entries.length;
  }

  let currentTime = 0;
  let finalTotal = 0;
  const lines = [];
  const appliedAdjustments = [];

  entries.forEach((entry, index) => {
    const adjustedDuration = entry.duration + perClipAdjustment;
    const safeDuration = Math.max(0.01, adjustedDuration);
    const start = formatTime(currentTime);
    const end = formatTime(currentTime + safeDuration);

    lines.push(String(index + 1));
    lines.push(`${start} --> ${end}`);
    lines.push(entry.dialogue || '[空行]');
    lines.push('');

    appliedAdjustments.push(safeDuration - entry.duration);
    currentTime += safeDuration;
    finalTotal += safeDuration;
  });

  const content = lines.join('\n');

  return {
    content,
    stats: {
      count: entries.length,
      originalTotal,
      finalTotal,
      perClipAdjustment,
      targetTotal,
      appliedAdjustments,
      entries,
    },
  };
}

function decodeWavDuration(audioCtx, file) {
  return file
    .arrayBuffer()
    .then((buffer) => audioCtx.decodeAudioData(buffer))
    .then((audioBuffer) => audioBuffer.duration);
}

function formatTime(seconds) {
  const totalMilliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function downloadSrt(content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'output.srt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function showSummary(stats, issues) {
  const { missing = [], duplicates = [] } = issues;

  if (!stats || !stats.count) {
    if (missing.length === 0 && duplicates.length === 0) {
      summaryEl.hidden = true;
      summaryEl.innerHTML = '';
      return;
    }
    summaryEl.hidden = false;
    summaryEl.innerHTML = createIssuesList(missing, duplicates);
    return;
  }

  const { count, originalTotal, finalTotal, perClipAdjustment, targetTotal } = stats;

  const lines = [];
  lines.push('<strong>生成結果のサマリー</strong>');
  lines.push(`<div>字幕数: <span>${count}</span></div>`);
  lines.push(`<div>元の合計時間: <span>${originalTotal.toFixed(2)} 秒</span></div>`);
  lines.push(`<div>最終的な合計時間: <span>${finalTotal.toFixed(2)} 秒</span></div>`);
  lines.push(`<div>1クリップあたりの調整: <span>${perClipAdjustment.toFixed(4)} 秒</span></div>`);
  if (targetTotal != null) {
    lines.push(`<div>目標合計時間: <span>${targetTotal.toFixed(2)} 秒</span></div>`);
  }

  if (missing.length > 0 || duplicates.length > 0) {
    lines.push(createIssuesList(missing, duplicates));
  }

  summaryEl.innerHTML = lines.join('');
  summaryEl.hidden = false;
}

function createIssuesList(missing, duplicates) {
  const parts = [];
  if (missing.length > 0) {
    parts.push(
      `<div><strong>不足しているペア</strong><ul>${missing
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul></div>`
    );
  }
  if (duplicates.length > 0) {
    parts.push(
      `<div><strong>重複しているファイル</strong><ul>${duplicates
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul></div>`
    );
  }
  return parts.join('');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
