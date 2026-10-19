/* ============================================================================
   data.js —— 数据层（纯计算，完全不碰页面）
   ============================================================================
   【这个模块的定位：最值得你花时间看的一块】

     它是整个应用里唯一"就算换成 React、换成 Vue、换成任何框架都不用改"的部分。
     因为这些函数只做一件事：**吃进数据，吐出数据**，不碰 DOM、不碰 Vue。

   【从原 app.js 搬来的函数】
     filterNotes    （原 489 行）关键词 + 分类 叠加筛选
     sortNotes      （原 752 行）日期倒序
     collectCats    （原 518 行）收集去重分类
     findIndexById  （原 767 行）按 id 找下标
     isCurrent      （原 777 行）判断是不是当前选中
     newestStamp    （原 685 行）取最新时间戳（判断文件新还是缓存新）
     looksLikeNotes （原 698 行）数据格式校验

   【⚠ 注意这些函数全是"纯函数"】
     同样的输入 → 同样的输出，不改外部状态，不产生副作用。
     好处：**可以单独测试**，出 bug 好定位，也好复用。
   ========================================================================== */

import { getMonthKey, getMonthName } from './dates.js';

/**
 * 筛选：关键词 + 分类可以叠加。
 *
 * 规则（和原版完全一致）：
 *   1. 分类不为空时，分类必须完全相等
 *   2. 关键词不为空时，标题/分类/正文 任意一处包含就算命中
 *   3. 两者是"且"的关系
 *
 * @param {Array} notes 全部笔记
 * @param {string} keyword 关键词（空字符串表示不筛）
 * @param {string} category 分类（空字符串表示全部）
 * @returns {Array} 筛选后的新数组（不改原数组）
 */
export function filterNotes(notes, keyword, category) {
  const kw = (keyword || '').trim().toLowerCase();
  const cat = category || '';

  return notes.filter((n) => {
    // 条件 1：分类
    if (cat !== '' && n.category !== cat) return false;

    // 条件 2：关键词
    if (kw !== '') {
      const big = ((n.title || '') + ' ' + (n.category || '') + ' ' + (n.content || '')).toLowerCase();
      if (big.indexOf(kw) === -1) return false;
    }

    return true;
  });
}

/**
 * 排序：日期倒序（新的在前）；同一天按 created 倒序。
 *
 * 【为什么要管 created】
 *   你 2026-10-06 那天记了两条，date 相同。如果只按 date 排，
 *   谁在前谁在后是不确定的 —— 页面顺序会看起来"跳来跳去"。
 *   加上 created（精确到分钟）就能定死顺序。
 *
 * 【注意】这个函数会就地修改数组（和原版一致），所以传进来的数组会被改。
 */
export function sortNotes(notes) {
  notes.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;   // 日期倒序
    const ca = a.created || '';
    const cb = b.created || '';
    if (ca === cb) return 0;
    return ca < cb ? 1 : -1;                                   // 同日按 created 倒序
  });
  return notes;
}

/**
 * 按月份分组，返回 [{ key, name, items }, ...]
 *
 * 【这个函数替代了原来 showList 里的分组循环】
 *   原来那段循环混在"拼 HTML"里（原 193~215 行），
 *   现在单独抽出来 —— 因为它其实是"数据整理"，不是"渲染"。
 */
export function groupByMonth(notes) {
  const groups = [];
  const index = {};                    // 用对象做索引，避免每次都遍历 groups 找

  notes.forEach((n) => {
    const key = getMonthKey(n.date);
    if (!index[key]) {
      index[key] = { key, name: getMonthName(n.date), items: [] };
      groups.push(index[key]);
    }
    index[key].items.push(n);
  });

  return groups;
}

/**
 * 收集所有分类（去重 + 排序）。
 * 原来叫 collectCats，里面有"先 push 再 indexOf 检查"的循环。
 */
export function collectCats(notes) {
  const cats = [];
  notes.forEach((n) => {
    if (n.category && cats.indexOf(n.category) === -1) {
      cats.push(n.category);
    }
  });
  return cats.sort();
}

/** 按 id 找下标，找不到返回 -1 */
export function findIndexById(notes, id) {
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].id === id) return i;
  }
  return -1;
}

/** 按 id 找记录，找不到返回 null */
export function findById(notes, id) {
  const i = findIndexById(notes, id);
  return i < 0 ? null : notes[i];
}

/** 判断某条记录是不是"当前正在看的" */
export function isCurrent(currentId, note) {
  return currentId != null && note && note.id === currentId;
}

/**
 * 取一组笔记里最新的 created 时间戳（字符串比较即可，格式固定）。
 * 用途：判断"文件里的数据"和"本地缓存"哪个更新。
 */
export function newestStamp(notes) {
  let max = '';
  (notes || []).forEach((n) => {
    const s = n.created || n.date || '';
    if (s > max) max = s;
  });
  return max;
}

/**
 * 粗略校验：这个数组像不像笔记数据？
 * 用途：防止把格式不对的 JSON（比如对象、或空数组）当成笔记读进来。
 */
export function looksLikeNotes(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  const first = arr[0];
  return !!first && typeof first === 'object'
    && ('title' in first) && ('date' in first);
}

/**
 * 在文件数据与本地缓存之间做决策：用哪个、要不要提示。
 * 把原先散在 start() 里的那段比较逻辑抽出来，方便单独测试。
 *
 * @returns {{ use: Array, reason: string }}
 */
export function pickNewer(fileNotes, cacheNotes) {
  if (!looksLikeNotes(cacheNotes)) {
    return { use: fileNotes, reason: 'cache-empty' };
  }
  if (!looksLikeNotes(fileNotes)) {
    return { use: cacheNotes, reason: 'file-invalid' };
  }
  if (newestStamp(fileNotes) > newestStamp(cacheNotes)) {
    return { use: fileNotes, reason: 'file-newer' };
  }
  return { use: cacheNotes, reason: 'cache-newer' };
}

/**
 * 在本地根据笔记数组算统计数据（纯函数）。
 *
 * 【为什么需要它】
 *   有后端时，统计由 SQL 聚合（GROUP BY / COUNT / SUM）算好返回；
 *   但在 GitHub Pages 这种纯静态环境里没有后端，
 *   前端就只能自己算——同样是"数据整理"，放数据层最合适。
 *
 * @param {Array} notes
 * @returns {{total:number, categoryCount:number, totalChars:number,
 *            firstDate:?string, lastDate:?string,
 *            categories:Array<{name:string,count:number}>}}
 */
export function computeStats(notes) {
  const list = notes || [];
  const map = new Map();
  let totalChars = 0;

  list.forEach((n) => {
    if (n.category) map.set(n.category, (map.get(n.category) || 0) + 1);
    totalChars += (n.content || '').length;
  });

  const categories = Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));

  const dates = list.map((n) => n.date).filter(Boolean).sort();

  return {
    total: list.length,
    categoryCount: categories.length,
    totalChars,
    firstDate: dates.length ? dates[0] : null,
    lastDate: dates.length ? dates[dates.length - 1] : null,
    categories,
  };
}