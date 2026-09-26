'use strict';

(function () {
  const anchorBody = document.getElementById('anchorBody');
  const srtInput = document.getElementById('srtInput');
  const srtFile = document.getElementById('srtFile');
  const fileName = document.getElementById('fileName');
  const addAnchorBtn = document.getElementById('addAnchor');
  const clearSrtBtn = document.getElementById('clearSrt');
  const runBtn = document.getElementById('runBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const statusText = document.getElementById('statusText');
  const errorBox = document.getElementById('errorBox');
  const resultPanel = document.getElementById('resultPanel');
  const cueBody = document.getElementById('cueBody');

  let lastResult = null;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTimecode(ms) {
    const negative = ms < 0;
    let value = Math.abs(ms);
    const hours = Math.floor(value / 3600000);
    value -= hours * 3600000;
    const minutes = Math.floor(value / 60000);
    value -= minutes * 60000;
    const seconds = Math.floor(value / 1000);
    const millis = value - seconds * 1000;
    const pad = (n, w) => String(n).padStart(w, '0');
    const body =
      pad(hours, 2) + ':' + pad(minutes, 2) + ':' + pad(seconds, 2) +
      ',' + pad(millis, 3);
    return negative ? '-' + body : body;
  }

  function addAnchorRow(original, corrected) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="anchor-idx"></td>' +
      '<td><input type="text" class="a-original" inputmode="numeric" placeholder="00:00:00,000"></td>' +
      '<td class="arrow-col">→</td>' +
      '<td><input type="text" class="a-corrected" inputmode="numeric" placeholder="00:00:00,000"></td>' +
      '<td><button type="button" class="del-btn">删除</button></td>';
    tr.querySelector('.a-original').value = original || '';
    tr.querySelector('.a-corrected').value = corrected || '';
    tr.querySelector('.del-btn').addEventListener('click', () => {
      if (anchorBody.querySelectorAll('tr').length <= 2) {
        tr.querySelector('input').focus();
        statusText.textContent = '至少需要保留两个锚点。';
        return;
      }
      tr.remove();
      refreshIndices();
    });
    anchorBody.appendChild(tr);
    refreshIndices();
    return tr;
  }

  function refreshIndices() {
    anchorBody.querySelectorAll('tr').forEach((tr, i) => {
      tr.querySelector('.anchor-idx').textContent = String(i + 1);
    });
  }

  function collectAnchors() {
    return Array.from(anchorBody.querySelectorAll('tr')).map((tr) => ({
      original: tr.querySelector('.a-original').value,
      corrected: tr.querySelector('.a-corrected').value,
    }));
  }

  function showError(message, list) {
    errorBox.hidden = false;
    errorBox.classList.remove('ok-box');
    let html = '<strong>' + escapeHtml(message) + '</strong>';
    if (list && list.length) {
      html += '<ul>' + list.map((m) => '<li>' + escapeHtml(m) + '</li>').join('') + '</ul>';
    }
    errorBox.innerHTML = html;
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.innerHTML = '';
    errorBox.classList.remove('ok-box');
  }

  function renderResult(result) {
    cueBody.innerHTML = '';
    const badIndices = new Set();
    result.errors.forEach((e) => {
      if (typeof e.index === 'number') badIndices.add(e.index);
    });

    result.entries.forEach((e) => {
      const tr = document.createElement('tr');
      if (badIndices.has(e.index)) tr.classList.add('row-error');
      const badStart = e.newStart < 0 || e.newStart > e.newEnd;
      const badEnd = e.newEnd < 0 || e.newStart > e.newEnd;
      tr.innerHTML =
        '<td>' + e.index + '</td>' +
        '<td class="tc">' +
          escapeHtml(formatTimecode(e.oldStart)) +
          '<span class="arrow">→</span>' +
          escapeHtml(formatTimecode(e.newStart)) +
          (badStart ? '<span class="badge badge-bad">异常</span>' : '') +
        '</td>' +
        '<td class="tc">' +
          escapeHtml(formatTimecode(e.oldEnd)) +
          '<span class="arrow">→</span>' +
          escapeHtml(formatTimecode(e.newEnd)) +
          (badEnd ? '<span class="badge badge-bad">异常</span>' : '') +
        '</td>' +
        '<td class="cue-text">' + escapeHtml(e.text) + '</td>';
      cueBody.appendChild(tr);
    });
    resultPanel.hidden = false;
  }

  async function runCorrection() {
    clearError();
    statusText.textContent = '';
    downloadBtn.disabled = true;
    lastResult = null;

    const srt = srtInput.value;
    if (!srt.trim()) {
      showError('请先粘贴或上传 SRT 字幕内容。');
      return;
    }

    let payload;
    try {
      payload = { srt, anchors: collectAnchors() };
    } catch (err) {
      showError(err.message);
      return;
    }

    runBtn.disabled = true;
    runBtn.textContent = '计算中…';
    try {
      const resp = await fetch('/api/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) {
        resultPanel.hidden = true;
        showError(data.error || '校正失败。');
        return;
      }

      lastResult = data;
      renderResult(data);

      if (data.errors && data.errors.length) {
        showError(
          '检测到 ' + data.errors.length + ' 处问题，已阻止导出，请修正锚点或字幕后重试：',
          data.errors.map((e) => e.message)
        );
        statusText.textContent = '存在倒置/负时间问题，无法导出。';
        downloadBtn.disabled = true;
      } else {
        clearError();
        errorBox.hidden = false;
        errorBox.classList.add('ok-box');
        errorBox.innerHTML =
          '<strong>校正完成：</strong>共 ' + data.entries.length +
          ' 条字幕，未发现起止或顺序倒置，可以导出。';
        statusText.textContent = '';
        downloadBtn.disabled = false;
      }
    } catch (err) {
      showError('请求失败：' + err.message);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = '计算校正预览';
    }
  }

  function downloadSrt() {
    if (!lastResult || !lastResult.srt) return;
    const blob = new Blob([lastResult.srt], { type: 'application/x-subrip;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'corrected.srt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---- 事件绑定 ----
  addAnchorBtn.addEventListener('click', () => addAnchorRow());
  clearSrtBtn.addEventListener('click', () => {
    srtInput.value = '';
    srtFile.value = '';
    fileName.textContent = '';
    resultPanel.hidden = true;
    clearError();
    downloadBtn.disabled = true;
    lastResult = null;
  });
  runBtn.addEventListener('click', runCorrection);
  downloadBtn.addEventListener('click', downloadSrt);

  srtFile.addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      showError('文件过大（上限 20MB）。');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      srtInput.value = String(reader.result || '');
      fileName.textContent = '已载入：' + file.name;
      clearError();
    };
    reader.onerror = () => showError('读取文件失败。');
    reader.readAsText(file, 'utf-8');
  });

  // 初始两个空锚点
  addAnchorRow();
  addAnchorRow();
})();
