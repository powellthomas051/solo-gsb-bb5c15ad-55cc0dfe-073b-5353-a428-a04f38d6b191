'use strict';

/**
 * SRT 解析与基于时间锚点的分段线性校正。
 *
 * 映射规则：
 *  - 位于相邻两个锚点之间的时间按线性插值映射；
 *  - 早于第一个锚点 / 晚于最后一个锚点的时间沿用最近锚点的固定偏移；
 *  - 映射结果按毫秒取整（Math.round）。
 */

const TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
const TIMING_LINE_RE =
  /(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})/;

/** 将 SRT 时间码解析为毫秒数，无法解析时返回 null。 */
function parseTimecode(str) {
  if (typeof str !== 'string') return null;
  const m = str.trim().match(TIME_RE);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  const frac = m[4].padEnd(3, '0');
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600000 + minutes * 60000 + seconds * 1000 + Number(frac);
}

/** 将毫秒数格式化为 SRT 时间码（hh:mm:ss,mmm）。负数格式为 -hh:mm:ss,mmm。 */
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
    `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
  return negative ? `-${body}` : body;
}

/**
 * 解析 SRT 文本。
 * 返回 { entries: [{ index, start, end, text, rawIndex }] }。
 * rawIndex 为文件中原本的序号文本（可能缺失或非数字），index 为按顺序生成的 1 基序号。
 */
function parseSrt(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('SRT 内容为空，请粘贴或上传字幕文件。');
  }
  // 去掉 UTF-8 BOM（若有）
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized
    .split(/\n[ \t]*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const entries = [];
  blocks.forEach((block, i) => {
    const lines = block.split('\n').map((l) => l.trimEnd());
    let cursor = 0;
    let rawIndex = null;

    // 可选的序号行
    if (lines.length > 0 && /^\d+$/.test(lines[0].trim())) {
      rawIndex = lines[0].trim();
      cursor = 1;
    }

    const timingLine = lines[cursor];
    const match = timingLine && timingLine.match(TIMING_LINE_RE);
    if (!match) {
      throw new Error(
        `第 ${i + 1} 个字幕块格式错误：找不到形如 00:00:00,000 --> 00:00:00,000 的时间轴行。`
      );
    }
    const start = parseTimecode(match[1]);
    const end = parseTimecode(match[2]);
    if (start === null || end === null) {
      throw new Error(`第 ${i + 1} 个字幕块的时间码无法解析。`);
    }
    cursor += 1;

    const bodyLines = lines.slice(cursor);
    const bodyText = bodyLines.join('\n').trim();
    if (bodyText === '') {
      throw new Error(`第 ${i + 1} 个字幕块缺少正文。`);
    }

    entries.push({
      index: i + 1,
      rawIndex,
      start,
      end,
      text: bodyLines.join('\n'),
    });
  });

  if (entries.length === 0) {
    throw new Error('没有解析出任何字幕条目。');
  }
  return { entries };
}

/**
 * 校验并规范化锚点。
 * 入参：[{ original: '...', corrected: '...' }]
 * 返回按原片时间排序的 [{ original: ms, corrected: ms }]。
 * 任何问题直接抛出带中文说明的 Error。
 */
function normalizeAnchors(rawAnchors) {
  if (!Array.isArray(rawAnchors)) {
    throw new Error('锚点数据格式不正确。');
  }
  const filled = rawAnchors.filter(
    (a) =>
      a &&
      ((a.original && String(a.original).trim() !== '') ||
        (a.corrected && String(a.corrected).trim() !== ''))
  );
  if (filled.length < 2) {
    throw new Error('请至少录入两个“原片时间 → 成片时间”锚点。');
  }

  const parsed = filled.map((a, i) => {
    const oStr = a.original == null ? '' : String(a.original).trim();
    const cStr = a.corrected == null ? '' : String(a.corrected).trim();
    if (oStr === '' || cStr === '') {
      throw new Error(`第 ${i + 1} 个已填写的锚点不完整：原片时间和成片时间都必须填写。`);
    }
    const original = parseTimecode(oStr);
    const corrected = parseTimecode(cStr);
    if (original === null) {
      throw new Error(`第 ${i + 1} 个锚点的原片时间无法解析：“${oStr}”。`);
    }
    if (corrected === null) {
      throw new Error(`第 ${i + 1} 个锚点的成片时间无法解析：“${cStr}”。`);
    }
    return { original, corrected };
  });

  // 按原片时间排序后校验严格递增（同时要求成片时间也严格递增）
  const sorted = parsed.slice().sort((a, b) => a.original - b.original);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].original <= sorted[i - 1].original) {
      throw new Error(
        `原片时间必须严格递增，但 ${formatTimecode(sorted[i - 1].original)} 之后又出现了 ` +
          `${formatTimecode(sorted[i].original)}。`
      );
    }
    if (sorted[i].corrected <= sorted[i - 1].corrected) {
      throw new Error(
        `成片时间必须严格递增，但 ${formatTimecode(sorted[i - 1].corrected)} 之后又出现了 ` +
          `${formatTimecode(sorted[i].corrected)}（对应原片时间 ` +
          `${formatTimecode(sorted[i - 1].original)} 与 ${formatTimecode(sorted[i].original)}）。`
      );
    }
  }
  return sorted;
}

/**
 * 构造时间映射函数。
 * 区间内线性插值；区间外沿用最近锚点的固定偏移；结果按毫秒取整。
 */
function createMapper(anchors) {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  return function map(timeMs) {
    if (timeMs <= first.original) {
      return Math.round(timeMs + (first.corrected - first.original));
    }
    if (timeMs >= last.original) {
      return Math.round(timeMs + (last.corrected - last.original));
    }
    for (let i = 1; i < anchors.length; i += 1) {
      const a = anchors[i - 1];
      const b = anchors[i];
      if (timeMs <= b.original) {
        const ratio = (timeMs - a.original) / (b.original - a.original);
        return Math.round(a.corrected + ratio * (b.corrected - a.corrected));
      }
    }
    return Math.round(timeMs + (last.corrected - last.original));
  };
}

/**
 * 校正整部字幕。
 * 返回 { entries, srt, errors: [{code, message}], warnings: [...] }。
 * errors 非空时调用方应阻止导出。
 */
function correctSrt(srtText, rawAnchors) {
  const { entries } = parseSrt(srtText);
  const anchors = normalizeAnchors(rawAnchors);
  const map = createMapper(anchors);

  const errors = [];
  const mapped = entries.map((e) => {
    const newStart = map(e.start);
    const newEnd = map(e.end);
    return { ...e, newStart, newEnd };
  });

  mapped.forEach((e) => {
    if (e.newStart < 0 || e.newEnd < 0) {
      errors.push({
        code: 'NEGATIVE_TIME',
        index: e.index,
        message: `第 ${e.index} 条字幕映射后出现负时间（${formatTimecode(
          e.newStart
        )} --> ${formatTimecode(e.newEnd)}），请调整第一个锚点。`,
      });
    }
    if (e.newStart > e.newEnd) {
      errors.push({
        code: 'REVERSED_CUE',
        index: e.index,
        message: `第 ${e.index} 条字幕起止时间映射后倒置：${formatTimecode(
          e.newStart
        )} --> ${formatTimecode(e.newEnd)}。`,
      });
    }
  });

  // 字幕顺序倒置（严格按文件中的相邻条目比较新开始时间）
  for (let i = 1; i < mapped.length; i += 1) {
    if (mapped[i].newStart < mapped[i - 1].newStart) {
      errors.push({
        code: 'REVERSED_ORDER',
        index: mapped[i].index,
        message:
          `字幕顺序映射后倒置：第 ${mapped[i - 1].index} 条开始于 ` +
          `${formatTimecode(mapped[i - 1].newStart)}，而第 ${mapped[i].index} 条开始于 ` +
          `${formatTimecode(mapped[i].newStart)}。`,
      });
    }
  }

  errors.sort((a, b) => (a.index || 0) - (b.index || 0));

  const srt = mapped
    .map(
      (e) =>
        `${e.index}\n${formatTimecode(e.newStart)} --> ${formatTimecode(
          e.newEnd
        )}\n${e.text}`
    )
    .join('\n\n')
    .concat('\n');

  return {
    entries: mapped,
    anchors: anchors.map((a) => ({
      original: a.original,
      corrected: a.corrected,
    })),
    srt,
    errors,
  };
}

module.exports = {
  parseTimecode,
  formatTimecode,
  parseSrt,
  normalizeAnchors,
  createMapper,
  correctSrt,
};
