'use strict';

const { parseTimeToMs, formatMs } = require('./time');

/**
 * 解析 SRT 文本为条目数组：{ index, startMs, endMs, text: string[] }。
 * 保留原序号与多行正文；返回 { entries, errors }。
 */
function parseSrt(text) {
  const normalized = String(text)
    .replace(/^\uFEFF/, '') // 去掉 BOM
    .replace(/\r\n?/g, '\n');
  const blocks = normalized
    .split(/\n[ \t]*\n/)
    .map((b) => b.replace(/^\n+|\n+$/g, ''))
    .filter((b) => b.trim() !== '');

  const entries = [];
  const errors = [];

  blocks.forEach((block, bi) => {
    const lines = block.split('\n');
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) {
      errors.push(`第 ${bi + 1} 个字幕块缺少时间行（-->）`);
      return;
    }

    // 序号：时间行之前的第一行；缺省时按顺序补一个
    let index;
    if (timeIdx === 0) {
      index = entries.length + 1;
    } else {
      const raw = lines[0].trim();
      const n = parseInt(raw, 10);
      index = Number.isNaN(n) ? raw : n;
    }

    const tm = lines[timeIdx].match(/^\s*(\S+)\s*-->\s*(\S+)/);
    if (!tm) {
      errors.push(`字幕 ${index}：时间行格式无效`);
      return;
    }
    const startMs = parseTimeToMs(tm[1]);
    const endMs = parseTimeToMs(tm[2]);
    if (startMs === null || endMs === null) {
      errors.push(`字幕 ${index}：时间戳无法解析（${lines[timeIdx].trim()}）`);
      return;
    }

    const textLines = lines.slice(timeIdx + 1);
    entries.push({ index, startMs, endMs, text: textLines });
  });

  return { entries, errors };
}

/** 由条目数组重建 SRT 文本，保留序号与多行正文。 */
function buildSrt(entries) {
  return (
    entries
      .map((e) => {
        const head = `${e.index}\n${formatMs(e.startMs)} --> ${formatMs(e.endMs)}`;
        return e.text && e.text.length ? `${head}\n${e.text.join('\n')}` : head;
      })
      .join('\n\n') + '\n'
  );
}

module.exports = { parseSrt, buildSrt };
