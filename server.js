'use strict';

const path = require('path');
const express = require('express');
const { convertSrt } = require('./lib/convert');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/convert', (req, res) => {
  const body = req.body || {};
  const result = convertSrt(body.srt, body.anchors);
  const status = result.anchorErrors || result.parseErrors ? 400 : 200;
  res.status(status).json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SRT 字幕校正工具已启动: http://localhost:${PORT}`);
});
