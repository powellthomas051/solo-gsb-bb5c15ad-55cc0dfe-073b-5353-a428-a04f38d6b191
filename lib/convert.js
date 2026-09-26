'use strict';

const { parseTimeToMs, formatMs } = require('./time');
const { parseSrt, buildSrt } = require('./srt');

/**
 * 校验锚点：至少两个；原片时间与成片时间两组都必须严格递增。
 * 返回 { anchors } 或 { errors }。
 */
function validateAnchors(rawAnchors) {
  const errors = [];
  if (!Array.isArray(rawAnchors) || rawAnchors.length < 2) {
    return { errors: ['至少需要两个锚点（原片时间 → 成片时间）'] };
  }

  const anchors = [];
  rawAnchors.forEach((a, i) => {
    const src = parseTimeToMs(a && a.src);
    const dst = parseTimeToMs(a && a.dst);
    if (src === null) errors.push(`锚点 ${i + 1}：原片时间格式无效（应为 HH:MM:SS,mmm）`);
    if (dst === null) errors.push(`锚点 ${i + 1}：成片时间格式无效（应为 HH:MM:SS,mmm）`);
    if (src !== null && dst !== null) anchors.push({ src, dst, row: i + 1 });
  });
  if (errors.length) return { errors };

  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i].src <= anchors[i - 1].src) {
      errors.push(
        `原片时间未严格递增：锚点 ${anchors[i - 1].row}（${formatMs(anchors[i - 1].src)}）` +
        ` ≥ 锚点 ${anchors[i].row}（${formatMs(anchors[i].src)}）`
      );
    }
    if (anchors[i].dst <= anchors[i - 1].dst) {
      errors.push(
        `成片时间未严格递增：锚点 ${anchors[i - 1].row}（${formatMs(anchors[i - 1].dst)}）` +
        ` ≥ 锚点 ${anchors[i].row}（${formatMs(anchors[i].dst)}）`
      );
    }
  }
  if (errors.length) return { errors };
  return { anchors };
}

/**
 * 生成分段线性映射函数：
 * - 相邻锚点之间线性插值；
 * - 锚点范围之外沿用最近锚点的固定偏移。
 */
function makeMapper(anchors) {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  return function mapTime(t) {
    if (t <= first.src) return t + (first.dst - first.src);
    if (t >= last.src) return t + (last.dst - last.src);
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      if (t <= b.src) {
        const ratio = (t - a.src) / (b.src - a.src);
        return a.dst + ratio * (b.dst - a.dst);
      }
    }
    return t; // 不可达
  };
}

/**
 * 主入口：convertSrt(srtText, rawAnchors)
 * 返回：
 *  - { ok:false, anchorErrors } 锚点/输入问题
 *  - { ok:false, parseErrors }  SRT 解析问题
 *  - { ok, errors, entries, srt? } 映射结果；errors 非空时阻止导出（无 srt 字段）
 */
function convertSrt(srtText, rawAnchors) {
  const { anchors, errors: anchorErrors } = validateAnchors(rawAnchors);
  if (anchorErrors) return { ok: false, anchorErrors };

  if (typeof srtText !== 'string' || srtText.trim() === '') {
    return { ok: false, anchorErrors: ['SRT 内容为空，请粘贴或上传字幕文件'] };
  }

  const { entries, errors: parseErrors } = parseSrt(srtText);
  if (parseErrors.length) return { ok: false, parseErrors };
  if (!entries.length) return { ok: false, parseErrors: ['未解析到任何字幕条目'] };

  const mapTime = makeMapper(anchors);
  const mapped = entries.map((e) => ({
    ...e,
    newStartMs: Math.max(0, Math.round(mapTime(e.startMs))),
    newEndMs: Math.max(0, Math.round(mapTime(e.endMs))),
  }));

  // 导出前校验：起止倒置 / 顺序倒置
  const errors = [];
  mapped.forEach((e, i) => {
    if (e.newEndMs < e.newStartMs) {
      errors.push(
        `字幕 ${e.index}：映射后起止倒置（${formatMs(e.newStartMs)} --> ${formatMs(e.newEndMs)}）`
      );
    }
    if (i > 0 && e.newStartMs < mapped[i - 1].newStartMs) {
      errors.push(
        `字幕顺序倒置：字幕 ${mapped[i - 1].index}（新开始 ${formatMs(mapped[i - 1].newStartMs)}）` +
        ` 排在字幕 ${e.index}（新开始 ${formatMs(e.newStartMs)}）之前`
      );
    }
  });

  const result = {
    ok: errors.length === 0,
    errors,
    entries: mapped.map((e) => ({
      index: e.index,
      oldStart: formatMs(e.startMs),
      oldEnd: formatMs(e.endMs),
      newStart: formatMs(e.newStartMs),
      newEnd: formatMs(e.newEndMs),
      text: e.text.join('\n'),
    })),
  };

  if (errors.length === 0) {
    result.srt = buildSrt(
      mapped.map((e) => ({ index: e.index, startMs: e.newStartMs, endMs: e.newEndMs, text: e.text }))
    );
  }
  return result;
}

module.exports = { convertSrt, validateAnchors, makeMapper };
