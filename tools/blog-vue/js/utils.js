/* ============================================================================
   utils.js —— 字符串工具（转义 + 高亮）
   ============================================================================
   【这个模块负责什么】
     · escapeHtml：把 < > & " ' 变成 HTML 实体，防止内容破坏页面结构（防 XSS）
     · highlight：搜索关键词高亮，把命中的部分包上 <mark>

   【从原 app.js 搬来的哪些函数】
     escapeHtml（原 810 行）
     highlight （原 819 行，原名叫 highlight）

   【为什么这两个放一起】
     因为它们有强依赖关系：highlight 必须先调 escapeHtml，顺序不能反。
     放同一个文件里，读的人一眼能看到这个顺序要求。
   ========================================================================== */

/**
 * HTML 转义。
 *
 * 【为什么必须转义】
 *   你的笔记正文和标题是用户输入的。如果标题里写了 <script>alert(1)</script>，
 *   直接塞进 innerHTML / v-html 就会被浏览器当代码执行 —— 这就是 XSS。
 *   转义之后它变成 &lt;script&gt;，浏览器只当成普通文字显示。
 *
 * 【为什么用函数而不是到处写 replace】
 *   原 app.js 里好多处都要转义，漏一处就有一个漏洞。
 *   统一成一个函数，改一次就全都生效。
 */
export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')      // ⚠ 必须第一个替换 &，否则会把后面替换出的实体再转一遍
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 把命中的关键词包上 <mark> 标签（返回 HTML 字符串）。
 *
 * 【⚠ 顺序陷阱：必须先转义，再找关键词】
 *   如果反过来（先高亮再转义），转义会把 <mark> 也变成 &lt;mark&gt;，
 *   高亮就失效了。
 *
 * 【为什么不用正则】
 *   关键词里可能带正则的特殊字符（如 . * ( )），用正则要先转义正则本身，
 *   反而更绕。用 indexOf 循环更直观，也更好调试。
 *
 * @param {string} text 原文（未转义）
 * @param {string} keyword 搜索关键词（可为空，为空时原样返回转义结果）
 * @returns {string} HTML 字符串，模板里要用 v-html 渲染
 */
export function highlightTitle(text, keyword) {
  const safe = escapeHtml(text);          // ← 第一步：先转义
  const kw = (keyword || '').trim();
  if (kw === '') return safe;             // 没在搜索，原样返回

  const lowerSafe = safe.toLowerCase();
  const lowerKey = kw.toLowerCase();
  let result = '';
  let pos = 0;                            // 下一次从哪里接着找

  while (true) {
    const hit = lowerSafe.indexOf(lowerKey, pos);
    if (hit === -1) break;                // 后面没有了，结束

    result += safe.slice(pos, hit);       // 命中之前的原文
    // 注意：从 safe（已转义）里切片，所以长度用 kw.length 是安全的
    result += '<mark>' + safe.slice(hit, hit + kw.length) + '</mark>';
    pos = hit + kw.length;
  }

  return result + safe.slice(pos);        // 拼上最后一段
}
