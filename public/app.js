'use strict';

(function () {
  var srtInput = document.getElementById('srtInput');
  var fileInput = document.getElementById('fileInput');
  var anchorBody = document.getElementById('anchorBody');
  var addAnchorBtn = document.getElementById('addAnchorBtn');
  var convertBtn = document.getElementById('convertBtn');
  var downloadBtn = document.getElementById('downloadBtn');
  var loadSampleBtn = document.getElementById('loadSampleBtn');
  var clearBtn = document.getElementById('clearBtn');
  var messageBox = document.getElementById('message');
  var resultCard = document.getElementById('resultCard');
  var resultBody = document.getElementById('resultBody');
  var entryCount = document.getElementById('entryCount');

  var correctedSrt = null;

  // ---------- 锚点行 ----------

  function addAnchorRow(src, dst) {
    var tr = document.createElement('tr');

    var tdNo = document.createElement('td');
    var tdSrc = document.createElement('td');
    var tdDst = document.createElement('td');
    var tdOp = document.createElement('td');

    var srcInput = document.createElement('input');
    srcInput.type = 'text';
    srcInput.placeholder = '00:00:00,000';
    srcInput.className = 'anchor-src';
    if (src) srcInput.value = src;

    var dstInput = document.createElement('input');
    dstInput.type = 'text';
    dstInput.placeholder = '00:00:00,000';
    dstInput.className = 'anchor-dst';
    if (dst) dstInput.value = dst;

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'danger';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', function () {
      tr.remove();
      renumber();
    });

    tdSrc.appendChild(srcInput);
    tdDst.appendChild(dstInput);
    tdOp.appendChild(delBtn);
    tr.appendChild(tdNo);
    tr.appendChild(tdSrc);
    tr.appendChild(tdDst);
    tr.appendChild(tdOp);
    anchorBody.appendChild(tr);
    renumber();
  }

  function renumber() {
    var rows = anchorBody.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      rows[i].firstChild.textContent = String(i + 1);
    }
  }

  function collectAnchors() {
    var anchors = [];
    var rows = anchorBody.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      anchors.push({
        src: rows[i].querySelector('.anchor-src').value.trim(),
        dst: rows[i].querySelector('.anchor-dst').value.trim()
      });
    }
    return anchors;
  }

  // ---------- 消息 ----------

  function showMessage(kind, lines) {
    messageBox.hidden = false;
    messageBox.className = 'message ' + kind;
    messageBox.textContent = Array.isArray(lines) ? lines.join('\n') : String(lines);
  }

  function hideMessage() {
    messageBox.hidden = true;
    messageBox.textContent = '';
  }

  // ---------- 结果表 ----------

  function renderEntries(entries, errors) {
    resultBody.innerHTML = '';
    entryCount.textContent = String(entries.length);
    entries.forEach(function (e) {
      var tr = document.createElement('tr');
      if (errors && errors.length && errors.some(function (msg) {
        return msg.indexOf('字幕 ' + e.index + '：') === 0 || msg.indexOf('字幕 ' + e.index + '（') !== -1;
      })) {
        tr.className = 'problem';
      }
      ['index', 'oldStart', 'oldEnd', 'newStart', 'newEnd'].forEach(function (k) {
        var td = document.createElement('td');
        td.textContent = String(e[k]);
        if (k !== 'index') td.className = 'time';
        tr.appendChild(td);
      });
      var tdText = document.createElement('td');
      tdText.className = 'text';
      tdText.textContent = e.text;
      tr.appendChild(tdText);
      resultBody.appendChild(tr);
    });
    resultCard.hidden = entries.length === 0;
  }

  // ---------- 校正请求 ----------

  function convert() {
    hideMessage();
    correctedSrt = null;
    downloadBtn.disabled = true;

    var payload = { srt: srtInput.value, anchors: collectAnchors() };
    fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.anchorErrors) {
          resultCard.hidden = true;
          showMessage('error', ['锚点设置有误：'].concat(data.anchorErrors));
          return;
        }
        if (data.parseErrors) {
          resultCard.hidden = true;
          showMessage('error', ['SRT 解析失败：'].concat(data.parseErrors));
          return;
        }
        renderEntries(data.entries || [], data.errors);
        if (data.errors && data.errors.length) {
          showMessage('error', ['校正结果存在问题，已阻止导出：'].concat(data.errors));
          return;
        }
        correctedSrt = data.srt;
        downloadBtn.disabled = false;
        showMessage('ok', '校正完成，共 ' + (data.entries ? data.entries.length : 0) + ' 条字幕，可下载导出。');
      })
      .catch(function (err) {
        showMessage('error', '请求失败：' + err.message);
      });
  }

  // ---------- 下载 ----------

  function download() {
    if (!correctedSrt) return;
    var blob = new Blob([correctedSrt], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'corrected.srt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- 事件绑定 ----------

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { srtInput.value = String(reader.result || ''); };
    reader.readAsText(file, 'utf-8');
  });

  loadSampleBtn.addEventListener('click', function () {
    srtInput.value = [
      '1',
      '00:00:01,000 --> 00:00:03,500',
      '第一行字幕',
      '跨两行显示',
      '',
      '2',
      '00:00:05,000 --> 00:00:07,000',
      '第二段对白',
      '',
      '3',
      '00:00:12,000 --> 00:00:14,500',
      '第三段对白'
    ].join('\n');
  });

  clearBtn.addEventListener('click', function () {
    srtInput.value = '';
    fileInput.value = '';
    resultCard.hidden = true;
    correctedSrt = null;
    downloadBtn.disabled = true;
    hideMessage();
  });

  addAnchorBtn.addEventListener('click', function () { addAnchorRow(); });
  convertBtn.addEventListener('click', convert);
  downloadBtn.addEventListener('click', download);

  // 默认两个锚点行
  addAnchorRow('00:00:01,000', '00:00:02,000');
  addAnchorRow('00:00:12,000', '00:00:15,000');
})();
