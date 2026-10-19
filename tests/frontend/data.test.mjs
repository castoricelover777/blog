/* ============================================================================
   test/data.test.mjs —— 模块化版的单元测试（用 node 直接跑，不需要浏览器）
   ============================================================================
   怎么跑：
     cd D:\JavaBlog\tools\blog-vue
     node test/data.test.mjs

   【为什么能这么测】
     因为 data.js / utils.js / dates.js 是**纯函数**：
     吃进数据、吐出数据，不碰 DOM、不碰浏览器 API。
     所以 node 里能直接跑 —— 这正是"把数据层拆出来"带来的好处。

   【对照一下】
     原版的 app.js 里，筛选逻辑和"拼 HTML"混在一起，
     想单独测 filterNotes() 是做不到的：一 import 就会去 getElementById，
     node 里没有 document，直接报错。
   ========================================================================== */

import { escapeHtml, highlightTitle } from '../../src/main/webapp/js/utils.js';
import { today, nowStamp, getMonthKey, getMonthName, getDayText, getMonthNum } from '../../src/main/webapp/js/dates.js';
import {
  filterNotes, sortNotes, groupByMonth, collectCats,
  looksLikeNotes, pickNewer, newestStamp, findById, isCurrent,
} from '../../src/main/webapp/js/data.js';

let pass = 0, fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('  PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else {
    fail++; failures.push(name);
    console.log('  FAIL | ' + name + (detail ? ' | ' + detail : ''));
  }
}
function section(t) { console.log('\n--- ' + t + ' ---'); }

// ============================================================================
console.log('=== blog-vue 模块单元测试 ===');

// ---- utils.js ----
section('utils.js（转义 + 高亮）');
check('escapeHtml 转义尖括号', escapeHtml('<b>') === '&lt;b&gt;', escapeHtml('<b>'));
check('escapeHtml 先转义 &（顺序正确）',
  escapeHtml('a & <b>') === 'a &amp; &lt;b&gt;', escapeHtml('a & <b>'));
check('escapeHtml 处理 null', escapeHtml(null) === '', '空');
check('escapeHtml 转义引号',
  escapeHtml('"x" \'y\'') === '&quot;x&quot; &#39;y&#39;', escapeHtml('"x"'));

{
  const hl = highlightTitle('Maven 与 <b>注入</b>', 'maven');
  check('高亮：命中处包 <mark>', hl.indexOf('<mark>Maven</mark>') === 0, hl);
  check('高亮：先转义再插 mark（<b> 已转义）', hl.indexOf('&lt;b&gt;') > -1, hl);
  check('高亮：空关键词原样返回', highlightTitle('普通标题', '') === '普通标题');
  check('高亮：多次命中',
    (highlightTitle('a-b-a-b', 'a').match(/<mark>/g) || []).length === 2,
    highlightTitle('a-b-a-b', 'a'));
  check('高亮：中文关键词', highlightTitle('重构博客', '重构').indexOf('<mark>重构</mark>') === 0);
}

// ---- dates.js ----
section('dates.js（日期格式化）');
check('getMonthKey', getMonthKey('2026-10-15') === '2026-10', getMonthKey('2026-10-15'));
check('getMonthNum 去前导零', getMonthNum('2026-07-01') === '7', getMonthNum('2026-07-01'));
check('getDayText', getDayText('2026-10-15') === '15', getDayText('2026-10-15'));
check('getMonthName 中文', getMonthName('2026-10-15') === '2026 年 10 月', getMonthName('2026-10-15'));
check('getMonthName 7 月不带前导零', getMonthName('2026-07-01') === '2026 年 7 月', getMonthName('2026-07-01'));
check('today 格式正确', /^\d{4}-\d{2}-\d{2}$/.test(today()), today());
check('nowStamp 格式正确', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(nowStamp()), nowStamp());
check('空日期不崩', getMonthKey('') === '' && getDayText('') === '', 'ok');

// ---- data.js ----
section('data.js（数据层）');
const notes = [
  { id: 3, date: '2026-10-15', created: '2026-10-15 21:20', title: 'Vue 重构', category: 'JavaWeb', content: '把博客重构了' },
  { id: 2, date: '2026-10-06', created: '2026-10-06 18:00', title: '第二条', category: 'Java', content: '内容 B' },
  { id: 1, date: '2026-10-06', created: '2026-10-06 10:29', title: '第一条', category: 'Java', content: '内容 A' },
  { id: 4, date: '2026-07-31', created: '2026-07-31 11:46', title: 'C语言 day3', category: 'C语言', content: '数组' },
];

check('filterNotes 不筛时返回全部', filterNotes(notes, '', '').length === 4);
check('filterNotes 按分类', filterNotes(notes, '', 'Java').length === 2, filterNotes(notes, '', 'Java').length + ' 条');
check('filterNotes 关键词命中标题', filterNotes(notes, 'Vue', '').length === 1);
check('filterNotes 关键词命中正文', filterNotes(notes, '数组', '').length === 1);
check('filterNotes 关键词命中分类', filterNotes(notes, 'C语言', '').length === 1);
check('filterNotes 大小写不敏感', filterNotes(notes, 'vue', '').length === 1);
check('filterNotes 搜索+分类叠加',
  filterNotes(notes, '第', 'Java').length === 2, filterNotes(notes, '第', 'Java').length + ' 条');
check('filterNotes 不修改原数组', filterNotes(notes, 'Vue', '').length === 1 && notes.length === 4);

{
  const sorted = sortNotes([...notes]);
  check('sortNotes 日期倒序', sorted[0].date === '2026-10-15' && sorted[3].date === '2026-07-31',
    sorted.map(n => n.date).join(' > '));
  check('sortNotes 同日按 created 倒序',
    sorted[1].created === '2026-10-06 18:00' && sorted[2].created === '2026-10-06 10:29',
    sorted[1].created + ' > ' + sorted[2].created);
}

{
  // 专门造一组跨 3 个月的数据来测分组
  // （上面那组 notes 里 3 条都在 10 月，只能分 2 组，不适合测多组）
  const multi = [
    { id: 1, date: '2026-10-15', created: '2026-10-15 21:20', title: 'A', category: 'X', content: '' },
    { id: 2, date: '2026-10-06', created: '2026-10-06 18:00', title: 'B', category: 'X', content: '' },
    { id: 3, date: '2026-09-12', created: '2026-09-12 10:00', title: 'C', category: 'X', content: '' },
    { id: 4, date: '2026-07-31', created: '2026-07-31 11:46', title: 'D', category: 'X', content: '' },
  ];
  const groups = groupByMonth(sortNotes(multi));
  check('groupByMonth 分组数', groups.length === 3, groups.length + ' 组：' + groups.map(g => g.key).join(', '));
  check('groupByMonth 分组名', groups[0].name === '2026 年 10 月', groups[0].name);
  check('groupByMonth 10 月有 2 条', groups[0].items.length === 2, groups[0].items.length + ' 条');
  check('groupByMonth 9 月有 1 条', groups[1].items.length === 1, groups[1].items.length + ' 条');
  check('groupByMonth 保持倒序', groups[0].key === '2026-10' && groups[2].key === '2026-07',
    groups.map(g => g.key).join(' > '));

  // 上面那组 notes（3 条 10 月 + 1 条 7 月）应该只有 2 组
  const g2 = groupByMonth(sortNotes([...notes]));
  check('groupByMonth 同月合并', g2.length === 2, g2.length + ' 组（10 月合并了 3 条）');
}

{
  const cats = collectCats(notes);
  check('collectCats 去重排序', cats.join(',') === 'C语言,Java,JavaWeb', cats.join(','));
}

check('findById 找得到', findById(notes, 2) && findById(notes, 2).title === '第二条');
check('findById 找不到返回 null', findById(notes, 999) === null);
check('isCurrent 判断正确', isCurrent(2, notes[1]) === true && isCurrent(3, notes[1]) === false);
check('newestStamp 取最新', newestStamp(notes) === '2026-10-15 21:20', newestStamp(notes));

check('looksLikeNotes 正确数据', looksLikeNotes(notes) === true);
check('looksLikeNotes 空数组', looksLikeNotes([]) === false);
check('looksLikeNotes 非数组', looksLikeNotes({ a: 1 }) === false);
check('looksLikeNotes 缺字段', looksLikeNotes([{ foo: 1 }]) === false);

{
  const older = JSON.parse(JSON.stringify(notes));
  older[0].created = '2000-01-01 00:00';
  check('pickNewer 文件更新时用文件', pickNewer(notes, older).reason === 'file-newer', pickNewer(notes, older).reason);
  const newer = JSON.parse(JSON.stringify(notes));
  newer[0].created = '2099-01-01 00:00';
  check('pickNewer 缓存更新时用缓存', pickNewer(notes, newer).reason === 'cache-newer', pickNewer(notes, newer).reason);
  check('pickNewer 缓存为空时用文件', pickNewer(notes, null).reason === 'cache-empty', pickNewer(notes, null).reason);
  check('pickNewer 文件非法时用缓存', pickNewer({ bad: 1 }, notes).reason === 'file-invalid', pickNewer({ bad: 1 }, notes).reason);
}

// ---- 边界情况 ----
section('边界情况（容易出 bug 的地方）');
check('空数组筛选不崩', filterNotes([], 'x', 'y').length === 0);
check('排序空数组不崩', sortNotes([]).length === 0);
check('分组空数组不崩', groupByMonth([]).length === 0);
check('缺字段的记录不崩', filterNotes([{ title: null, content: null, category: null }], 'x', '').length === 0);
check('内容含特殊字符能转义',
  escapeHtml('<img src=x onerror=alert(1)>').indexOf('<img') === -1,
  escapeHtml('<img src=x>'));

// ---- 汇总 ----
console.log('\n' + '='.repeat(52));
console.log('  结果：' + pass + ' 通过, ' + fail + ' 失败');
if (fail > 0) console.log('  失败项：' + failures.join('、'));
console.log('='.repeat(52));

process.exit(fail === 0 ? 0 : 1);
