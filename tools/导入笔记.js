/* ============================================================================
   导入笔记.js —— 把草稿文件里的文章，追加进 data/notes.json
   ============================================================================
   【怎么用】
     在项目目录打开 PowerShell，执行：
         node tools/导入笔记.js data/_待导入_第二批_C语言day4-5.md
     不加参数时，默认处理 data/_待导入_第一批_C语言day1-3.md

   【它做四件事，顺序很重要】
     1) 读现有 notes.json，先把整份文件备份成 notes.json.bak（防止改坏）
     2) 解析草稿文件，取出每篇的 日期 / 标题 / 分类 / 正文
     3) 检查每一篇的字段是否完整、日期格式对不对（不合格就拒绝写入）
     4) 按 (日期 + 标题) 查重，只把没导入过的追加进去，然后按日期从新到旧排序后写回

   【为什么是"追加"而不是"覆盖"】
     第一批导入时我用的是覆盖，把老的三条删掉了。那一次是用户明确要求删。
     但从现在起默认必须是追加 —— 否则每导入一批新的，就会把之前导入的全冲掉。

   【草稿文件的格式要求】
     用 80 个等号把每篇隔开，日期和标题可以分在相邻两块里（写成下面这样就一定能解析）：

         ================================================================
         第四篇：2026-08-01
         ================================================================

         【title】   标题写在这里
         【category】C语言
         【正文开始（= content 字段）】

         📝 今日复盘：
         ...

         【正文结束】
   ========================================================================== */

const fs = require('fs');
const path = require('path');

// ---- 项目路径（用脚本自己的位置推算，这样从哪儿运行都不会错）----
const ROOT = path.resolve(__dirname, '..');
const NOTES = path.join(ROOT, 'data', 'notes.json');
const BACKUP = path.join(ROOT, 'data', 'notes.json.bak');

// ---- 要处理哪个草稿文件：用命令行参数，没给就用默认 ----
let draftPath = process.argv[2];
if (!draftPath) {
  draftPath = path.join(ROOT, 'data', '_待导入_第一批_C语言day1-3.md');
} else if (!path.isAbsolute(draftPath)) {
  draftPath = path.join(ROOT, draftPath);
}

console.log('== 导入笔记 ==');
console.log('项目目录: ' + ROOT);
console.log('草稿文件: ' + draftPath);

if (!fs.existsSync(draftPath)) {
  console.log('错误：找不到草稿文件。');
  process.exit(1);
}

// ---- 第 1 步：读现有数据，并先备份 ----
let existing = [];
if (fs.existsSync(NOTES)) {
  const text = fs.readFileSync(NOTES, 'utf8');
  existing = JSON.parse(text);
  fs.writeFileSync(BACKUP, text, 'utf8');
  console.log('已备份现有 ' + existing.length + ' 条到 notes.json.bak');
} else {
  console.log('notes.json 不存在，将新建一个。');
}

// ---- 第 2 步：解析草稿 ----
const draft = fs.readFileSync(draftPath, 'utf8');
const blocks = draft.split(/={80}/);

const articles = [];
let pendingDate = '';      // 日期可能出现在"上一块"里，所以先记住它
let pendingTime = '';      // 时间也是（可选），形如 '21:11'

for (let i = 0; i < blocks.length; i++) {
  const b = blocks[i];

  // 日期块：能找出日期、且这一块里没有 【title】
  // 日期后面可以跟一个时间，写成 "第三十篇：2026-09-17 21:11" 就会被识别出来。
  // 为什么需要时间：date 只精确到天，同一天如果有两条笔记，
  //   排序时它们"相等"，顺序就不确定——会出现进度看起来倒退的情况。
  //   有了 created（日期 + 时间）就能定死先后。
  const mDate = b.match(/(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/);
  const hasTitle = b.indexOf('【title】') >= 0;
  if (mDate && !hasTitle) {
    pendingDate = mDate[1];
    pendingTime = mDate[2] ? mDate[2] : '';
    continue;
  }

  // 文章块：有 【title】
  if (!hasTitle) { continue; }

  const mTitle = b.match(/【title】\s*(.+)/);
  const mCat = b.match(/【category】\s*(.+)/);
  const mBody = b.match(/【正文开始（= content 字段）】([\s\S]*?)【正文结束】/);

  const title = mTitle ? mTitle[1].trim() : '';
  let category = mCat ? mCat[1].trim() : '';

  // ---- 自动分类：按标题里的关键字覆盖草稿里写的分类 ----
  // 为什么需要：学习是分阶段的（理论课 → 刷题 → 数据结构 → 项目），
  // 如果所有笔记都挤在同一个分类里，顶部的分类药丸就失去意义了。
  // 这里按标题关键字自动分流，草稿里就不用每次手写分类。
  //
  // 三条要注意的规则（都是踩过坑总结的）：
  //   ① 越"具体"的判断越要写在前面。例如"Java 项目实战"同时含"项目实战"和"Java"，
  //      先判 Java 就会被归错类。
  //   ② 关键字要写到"不会误伤"为止。我一开始把项目类的关键字写成"项目"两个字，
  //      结果"Java day1：项目导向开新坑"也被归成了项目类——因为它正文里有"项目"。
  //      所以现在写成"项目实战"，精确得多。
  //   ③ 先把标题转成小写（t）再比英文关键字，这样 Java / java / JAVA 都能认。
  //      我最初忘了转小写，导致"jawaweb(18/200)"这种标题一个关键字都匹配不上，
  //      直接被判成"没有分类"。
  //   ④ 一条都没匹配上时，**保留草稿里写的分类**（category 不清空），
  //      避免把原来正确的分类覆盖成空。
  const t = title.toLowerCase();
  if (title.indexOf('阶段总结') >= 0) {
    category = '项目复盘';
  } else if (title.indexOf('项目实战') >= 0) {
    category = '项目';
  } else if (title.indexOf('牛客刷题') >= 0) {
    category = 'C语言刷题';
  } else if (title.indexOf('数据结构') >= 0) {
    category = '数据结构';
  } else if (t.indexOf('javaweb') >= 0 || t.indexOf('jawaweb') >= 0) {
    // ⚠️ 写在 Java 前面：javaweb 里也含 java。
    //    "jawaweb" 是手误拼法，但既然标题里真的出现过，就一起兼容掉。
    category = 'JavaWeb';
  } else if (title.indexOf('C语言') >= 0 || title.indexOf('c语言') >= 0) {
    category = 'C语言';
  } else if (t.indexOf('java') >= 0) {
    category = 'Java';
  }

  if (!mBody) {
    // 这是草稿末尾的"字段对应说明"之类的块，跳过就行，不用报错
    continue;
  }

  // 正文：去掉首尾多余空行，末尾统一补一个换行
  const content = mBody[1].replace(/^\s*\n/, '').replace(/\s+$/, '') + '\n';

  articles.push({
    date: pendingDate,
    created: pendingDate + ' ' + (pendingTime == '' ? '12:00' : padTime(pendingTime)),
    title: title,
    category: category,
    content: content
  });
  pendingDate = '';   // 用掉就清空，避免下一篇误用上一个日期
  pendingTime = '';
}

// 把 '9:05' 这种写法补成 '09:05'，保证 created 的格式统一（固定宽度才能直接比字符串）
function padTime(t) {
  const p = t.split(':');
  let h = p[0];
  let m = p[1];
  if (h.length < 2) { h = '0' + h; }
  return h + ':' + m;
}

console.log('\n从草稿解析出 ' + articles.length + ' 篇');

// ---- 第 3 步：校验，有问题就不写文件 ----
let bad = 0;
for (let i = 0; i < articles.length; i++) {
  const a = articles[i];
  const problems = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.date)) { problems.push('日期缺失或格式不对: "' + a.date + '"'); }
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(a.created)) { problems.push('created 格式不对: "' + a.created + '"'); }
  if (a.title === '') { problems.push('缺标题'); }
  if (a.category === '') { problems.push('缺分类'); }
  if (a.content.length < 20) { problems.push('正文太短'); }
  if (problems.length > 0) {
    console.log('  第 ' + (i + 1) + ' 篇有问题：' + problems.join('；'));
    bad++;
  }
}
if (bad > 0) {
  console.log('\n共 ' + bad + ' 篇不合格，为了安全没有写入任何文件。请修好草稿再跑一次。');
  process.exit(1);
}

// ---- 第 4 步：查重 + 追加 + 排序 + 写入 ----
function makeId(dateStr, seq) {
  // id = 那天上午 9 点的毫秒数 + 序号，保证唯一且数值和日期大致对应
  const p = dateStr.split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 9, 0, 0);
  return d.getTime() + seq;
}

let added = 0;
let skipped = 0;
for (let i = 0; i < articles.length; i++) {
  const a = articles[i];

  // 查重：同一天、同一个标题，就认为已经导入过了
  let dup = false;
  for (let j = 0; j < existing.length; j++) {
    if (existing[j].date === a.date && existing[j].title === a.title) { dup = true; }
  }
  if (dup) {
    console.log('  跳过（已存在）: ' + a.date + '  ' + a.title);
    skipped++;
    continue;
  }

  existing.push({
    id: makeId(a.date, existing.length + added),
    date: a.date,
    created: a.created,
    title: a.title,
    category: a.category,
    content: a.content
  });
  added++;
  console.log('  新增: ' + a.date + ' ' + a.created.slice(11) + '  [' + a.category + ']  ' + a.title + '  (正文 ' + a.content.length + ' 字符)');
}

// 排序：不同日期按日期从新到旧；同一天按 created 从早到晚
// （和 app.js 里的 sortNotes() 保持一致，这样文件和页面看起来是同一个顺序）
existing.sort(function (a, b) {
  if (a.date != b.date) { return a.date < b.date ? 1 : -1; }
  if (a.created == null || b.created == null) { return 0; }
  return a.created < b.created ? -1 : 1;
});

// 写入前最后一道检查：每条都必须有 created，否则同一天多条时顺序会不确定
let missingCreated = 0;
for (let i = 0; i < existing.length; i++) {
  if (!existing[i].created) {
    console.log('  ⚠️ ' + existing[i].date + ' 缺 created 字段: ' + existing[i].title.slice(0, 26));
    missingCreated++;
  }
}
if (missingCreated > 0) {
  console.log('\n有 ' + missingCreated + ' 条缺 created，为了安全没有写文件。');
  process.exit(1);
}

fs.writeFileSync(NOTES, JSON.stringify(existing, null, 2) + '\n', 'utf8');

console.log('\n结果：新增 ' + added + ' 条，跳过 ' + skipped + ' 条');
console.log('notes.json 现在共 ' + existing.length + ' 条：');
for (let i = 0; i < existing.length; i++) {
  console.log('   ' + existing[i].date + '  [' + existing[i].category + ']  ' + existing[i].title);
}
