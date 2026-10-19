/* ============================================================================
   dates.js —— 日期格式化
   ============================================================================
   【这个模块负责什么】
     把 '2026-10-15' 这样的日期字符串，按页面需要切成各种样子。

   【从原 app.js 搬来的函数】
     today        （原 855 行）今天的日期字符串
     getMonthKey  （原 784 行）'2026-10'
     getMonthNum  （原 789 行）'10'
     getDayText   （原 794 行）'15'
     getMonthName （原 800 行）'2026 年 10 月'

   【⚠ 一个关键设计：为什么全用字符串切分，而不用 new Date()？】
     原代码注释里提过这个选择，这里保留同样做法：

       '2026-10-15'.slice(0, 7)  →  '2026-10'        直接切，绝不失真
       new Date('2026-10-15')     →  可能被转成 UTC   有掉一天的风险

     日期字符串本来就是固定格式（YYYY-MM-DD），切字符串最稳，
     也避开了时区转换的麻烦。这是个很实用的经验。
   ========================================================================== */

/** 取月份键，如 '2026-10'（用来做分组的主键） */
export function getMonthKey(dateStr) {
  return String(dateStr || '').slice(0, 7);
}

/** 取月份数字，如 '10'（去掉前导零） */
export function getMonthNum(dateStr) {
  const key = getMonthKey(dateStr);
  const parts = key.split('-');
  if (parts.length < 2) return '';
  return String(Number(parts[1]));
}

/** 取"日"的文字，如 '15'
 *  列表里前面已经有"2026 年 10 月"这个月份标题了，所以条目上只显示日 */
export function getDayText(dateStr) {
  const s = String(dateStr || '');
  const parts = s.split('-');
  return parts.length >= 3 ? parts[2] : s;
}

/** 取月份名，如 '2026 年 10 月' */
export function getMonthName(dateStr) {
  const key = getMonthKey(dateStr);
  const parts = key.split('-');
  if (parts.length < 2) return key;
  const year = parts[0];
  const month = Number(parts[1]);      // Number('07') = 7，自动去掉前导零
  return year + ' 年 ' + month + ' 月';
}

/** 今天的日期字符串，如 '2026-10-15'（新增笔记时用） */
export function today() {
  const d = new Date();
  const m = d.getMonth() + 1;          // getMonth() 返回 0~11，所以要 +1
  const day = d.getDate();
  return d.getFullYear() + '-'
    + (m < 10 ? '0' + m : m) + '-'      // 补零，保证格式固定为两位
    + (day < 10 ? '0' + day : day);
}

/** 当前日期+时间，如 '2026-10-15 21:30'（用作 created 字段） */
export function nowStamp() {
  const d = new Date();
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  return today() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
