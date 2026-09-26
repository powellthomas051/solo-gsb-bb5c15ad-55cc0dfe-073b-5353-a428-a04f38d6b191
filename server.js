'use strict';

const express = require('express');
const path = require('path');
const { correctSrt } = require('./lib/srt');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/correct', (req, res) => {
  const { srt, anchors } = req.body || {};
  if (typeof srt !== 'string') {
    return res.status(400).json({ error: '缺少 srt 字段（字幕文本）。' });
  }
  try {
    const result = correctSrt(srt, Array.isArray(anchors) ? anchors : []);
    return res.json({
      srt: result.srt,
      entries: result.entries.map((e) => ({
        index: e.index,
        oldStart: e.start,
        oldEnd: e.end,
        newStart: e.newStart,
        newEnd: e.newEnd,
        text: e.text,
      })),
      anchors: result.anchors,
      errors: result.errors,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: '上传内容过大（上限 20MB）。' });
  }
  if (err instanceof SyntaxError) {
    return res.status(400).json({ error: '请求体不是合法的 JSON。' });
  }
  return res.status(500).json({ error: '服务器内部错误。' });
});

app.listen(PORT, () => {
  console.log(`SRT 锚点校正工具已启动： http://localhost:${PORT}`);
});
