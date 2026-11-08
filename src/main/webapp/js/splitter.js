/* ============================================================================
   splitter.js —— 左右分栏之间的「拖动条」
   ============================================================================
   想解决的问题：
     左右两栏现在各自独立滚动，但左栏宽度是写死的 340px。
     想看长标题的列表就想宽一点，想读正文就想窄一点 —— 干脆让用户自己拖。

   怎么做的：
     1. index.html 里 <main> 中间放了一个 #splitter（一条 16px 宽的竖条）
     2. 这里用 Pointer Events 监听拖动：pointerdown 记下起点，
        pointermove 算位移 → 实时改 #list 的 flex-basis
     3. 松手把宽度存进 localStorage，下次打开还是这个宽度
     4. 双击复位；键盘 ← → 微调（无障碍也能用）；
        窗口变窄时自动收一收，保证右栏不会被挤没

   为什么用 Pointer Events 而不是 mousemove：
     mousedown/mousemove 只认鼠标。pointerdown/pointermove 鼠标、触屏、手写笔
     都能触发，而且 setPointerCapture 能让"鼠标甩到窗口外也不丢事件"。
   ========================================================================== */

const STORAGE_KEY = 'kb.listWidth';  // 记住用户拖出来的宽度
const DEFAULT_WIDTH = 340;           // 初始/复位宽度（跟 CSS 里一致）
const MIN_WIDTH = 220;               // 再窄就放不下"日期 + 标题"了
const MAX_RATIO = 0.62;              // 最多占可用宽度的 62%，别把右栏挤死
const MIN_CONTENT = 300;             // 右栏至少留 300px

/**
 * 绑定分栏拖动条。DOM 里没有 #splitter 时安静返回（比如测试环境）。
 * @returns {{ apply: (w:number)=>number } | null}
 */
export function initSplitter() {
  const main = document.querySelector('main');
  const handle = document.getElementById('splitter');
  const list = document.getElementById('list');
  if (!main || !handle || !list) return null;

  /** 夹取到合理区间 */
  function clamp(w) {
    const usable = main.clientWidth;
    const max = Math.max(MIN_WIDTH, Math.min(usable * MAX_RATIO, usable - MIN_CONTENT));
    return Math.round(Math.max(MIN_WIDTH, Math.min(w, max)));
  }

  /** 应用宽度（同时更新 aria 数值，读屏软件能播报） */
  function apply(w) {
    // 窄屏（上下排列）不锁宽度，交回给 CSS 的 flex: 1 1 auto
    if (isNarrow()) {
      list.style.flex = '';
      return 0;
    }
    const width = clamp(w);
    list.style.flex = '0 0 ' + width + 'px';
    handle.setAttribute('aria-valuenow', String(width));
    handle.setAttribute('aria-valuemin', String(MIN_WIDTH));
    handle.setAttribute('aria-valuemax', String(Math.round(main.clientWidth * MAX_RATIO)));
    return width;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Math.round(list.getBoundingClientRect().width)));
    } catch (e) {
      /* 隐私模式下 localStorage 可能不可用，忽略即可 */
    }
  }

  const currentWidth = () => list.getBoundingClientRect().width;

  // 小于 900px 时页面改成上下排列（见 style.css 的媒体查询），
  // 这时没有"左右分栏"，拖动条被隐藏，也不该再给 #list 写死宽度。
  const isNarrow = () => window.innerWidth <= 900;

  // ---- 恢复上次拖动的位置 ----
  try {
    const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    if (!isNarrow() && Number.isFinite(saved) && saved > 0) apply(saved);
  } catch (e) { /* 忽略 */ }

  // ---- 拖动状态 ----
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  function onDown(e) {
    // 只响应主键 / 触摸
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startWidth = currentWidth();
    handle.classList.add('dragging');
    document.body.classList.add('resizing');
    // 指针捕获：鼠标甩到窗口外也能继续收到 move 事件
    if (handle.setPointerCapture) {
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    }
    e.preventDefault();
  }

  function onMove(e) {
    if (!dragging) return;
    apply(startWidth + (e.clientX - startX));
  }

  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.classList.remove('resizing');
    if (handle.releasePointerCapture && e.pointerId != null) {
      try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    }
    save();
  }

  handle.addEventListener('pointerdown', onDown);
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);

  // ---- 双击复位 ----
  handle.addEventListener('dblclick', () => {
    apply(DEFAULT_WIDTH);
    save();
  });

  // ---- 键盘操作：← → 每次 20px，Shift+← → 每次 60px，Home/End 到两端 ----
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 60 : 20;
    const w = currentWidth();
    if (e.key === 'ArrowLeft') { apply(w - step); save(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { apply(w + step); save(); e.preventDefault(); }
    else if (e.key === 'Home') { apply(MIN_WIDTH); save(); e.preventDefault(); }
    else if (e.key === 'End') { apply(main.clientWidth * MAX_RATIO); save(); e.preventDefault(); }
  });

  // ---- 窗口尺寸变化：重新夹一次，避免窄屏下右栏被挤没 ----
  let rafId = 0;
  window.addEventListener('resize', () => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
    const rerun = () => apply(currentWidth());
    if (typeof requestAnimationFrame === 'function') rafId = requestAnimationFrame(rerun);
    else setTimeout(rerun, 0);
  });

  return { apply };
}
