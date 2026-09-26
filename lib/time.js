'use strict';

/**
 * 解析 "HH:MM:SS,mmm"（也兼容 "." 分隔与 1~3 位毫秒）为毫秒数。
 * 解析失败返回 null。
 */
function parseTimeToMs(str) {
  if (typeof str !== 'string') return null;
  const m = str.trim().match(/^(\d+):([0-5]?\d):([0-5]?\d)[,.](\d{1,3})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  const millis = Number(m[4].padEnd(3, '0'));
  return hours * 3600000 + minutes * 60000 + seconds * 1000 + millis;
}

/** 把毫秒数格式化为 SRT 时间 "HH:MM:SS,mmm"，负值按 0 处理。 */
function formatMs(total) {
  let t = Number(total);
  if (!Number.isFinite(t) || t < 0) t = 0;
  t = Math.round(t);
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const ms = t % 1000;
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

module.exports = { parseTimeToMs, formatMs };
