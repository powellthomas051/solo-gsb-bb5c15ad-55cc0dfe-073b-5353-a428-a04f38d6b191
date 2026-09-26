'use strict';

const assert = require('assert');
const { convertSrt, makeMapper, validateAnchors } = require('../lib/convert');
const { parseTimeToMs, formatMs } = require('../lib/time');

// 时间解析/格式化
assert.strictEqual(parseTimeToMs('01:02:03,456'), 3723456);
assert.strictEqual(parseTimeToMs('00:00:01.5'), 1500);
assert.strictEqual(parseTimeToMs('bad'), null);
assert.strictEqual(formatMs(3723456), '01:02:03,456');

// 锚点校验：少于两个
assert.ok(validateAnchors([{ src: '00:00:01,000', dst: '00:00:02,000' }]).errors);

// 锚点校验：原片时间未严格递增
{
  const { errors } = validateAnchors([
    { src: '00:00:10,000', dst: '00:00:10,000' },
    { src: '00:00:10,000', dst: '00:00:20,000' },
  ]);
  assert.ok(errors && errors.some((e) => e.includes('原片时间未严格递增')));
}

// 锚点校验：成片时间未严格递增
{
  const { errors } = validateAnchors([
    { src: '00:00:01,000', dst: '00:00:20,000' },
    { src: '00:00:02,000', dst: '00:00:10,000' },
  ]);
  assert.ok(errors && errors.some((e) => e.includes('成片时间未严格递增')));
}

// 分段线性映射 + 范围外固定偏移
{
  const map = makeMapper([
    { src: 1000, dst: 2000 },
    { src: 11000, dst: 17000 },
  ]);
  assert.strictEqual(map(0), 1000);          // 范围外：沿用首锚点偏移 +1000
  assert.strictEqual(map(6000), 9500);       // 区间中点线性插值
  assert.strictEqual(map(20000), 26000);     // 范围外：沿用末锚点偏移 +6000
}

const sample = [
  '1',
  '00:00:01,000 --> 00:00:03,500',
  '第一行',
  '第二行',
  '',
  '2',
  '00:00:05,000 --> 00:00:07,000',
  '对白',
  '',
  '3',
  '00:00:12,000 --> 00:00:14,500',
  '结尾',
].join('\n');

const anchors = [
  { src: '00:00:01,000', dst: '00:00:02,000' },
  { src: '00:00:12,000', dst: '00:00:15,000' },
];

// 正常映射：保留序号与多行正文，毫秒取整
{
  const r = convertSrt(sample, anchors);
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  assert.strictEqual(r.entries.length, 3);
  // 斜率 = 13000/11000 = 13/11；字幕 3 结束时间在末锚点之后，用固定偏移 +3000
  assert.deepStrictEqual(
    r.entries.map((e) => [e.newStart, e.newEnd]),
    [
      ['00:00:02,000', '00:00:04,955'], // 2000 + 2500*13/11 = 4954.54… → 取整 4955
      ['00:00:06,727', '00:00:09,091'],
      ['00:00:15,000', '00:00:17,500'],
    ]
  );
  assert.ok(r.srt.includes('第一行\n第二行'), '多行正文应保留');
  assert.ok(r.srt.startsWith('1\n00:00:02,000 --> 00:00:04,955'));
}

// 毫秒取整验证（独立核算中点）
{
  const map = makeMapper([
    { src: 1000, dst: 2000 },
    { src: 12000, dst: 15000 },
  ]);
  // 3500 -> 2000 + 2500 * 13000/11000 = 4954.5454... -> 4955
  assert.strictEqual(Math.round(map(3500)), 4955);
}

// 起止倒置（源字幕本身结束早于开始，映射后仍倒置）：阻止导出
{
  const srt = '1\n00:00:06,000 --> 00:00:05,000\n字幕\n';
  const r = convertSrt(srt, anchors);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('起止倒置')), JSON.stringify(r.errors));
  assert.strictEqual(r.srt, undefined, '出错时不应生成可导出的 SRT');
}

// 顺序倒置（源字幕顺序错乱，映射后仍倒置）：阻止导出
{
  const srt = [
    '1',
    '00:00:09,000 --> 00:00:09,800',
    '甲',
    '',
    '2',
    '00:00:01,500 --> 00:00:02,000',
    '乙',
  ].join('\n');
  const r = convertSrt(srt, anchors);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('顺序倒置')), JSON.stringify(r.errors));
  assert.strictEqual(r.srt, undefined);
}

console.log('全部测试通过 ✔');
