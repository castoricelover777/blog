/* ============================================================================
   storage.js —— 持久化（本地缓存 + 文件读写）
   ============================================================================
   【这个模块负责什么】
     · 把笔记存进浏览器 localStorage（刷新不丢）
     · 从 notes.json 文件读取
     · 保存回文件 / 下载备份

   【从原 app.js 搬来的函数】
     saveCache      （原 678 行）存 localStorage
     saveToFile     （原 593 行）用文件选择器写回文件
     downloadData   （原 630 行）下载一份备份
     reloadFromFile （原 711 行）重新从文件加载

   【⚠ 为什么这块不能交给框架】
     框架（Vue / React）只管"数据 → 页面"这一段。
     数据从哪来、存到哪去，是应用自己的事，永远得自己写。
     这就是"框架帮不上忙的那 256 行"里的一部分。
   ========================================================================== */

/** localStorage 的键名。带版本号，将来结构变了可以换新键，不会读到旧格式 */
const CACHE_KEY = 'javablog-notes-cache-v1';

/**
 * 存进 localStorage。
 *
 * 【为什么要 try/catch】
 *   localStorage 有容量限制（一般 5MB），写满会抛异常；
 *   浏览器隐私模式下也可能直接禁止写入。
 *   这里失败只警告，不能让整个页面崩掉。
 */
export function saveCache(notes) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(notes));
    return true;
  } catch (e) {
    console.warn('存缓存失败（可能是空间满了或隐私模式）', e);
    return false;
  }
}

/** 读 localStorage，返回数组；没有或格式不对时返回 null */
export function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('缓存解析失败，忽略', e);
    return null;
  }
}

/** 清掉缓存（一般不用，留着方便调试） */
export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (e) {
    // 忽略
  }
}

/**
 * 从 data/notes.json 读数据。
 *
 * 【为什么要加 ?ts=时间戳】
 *   浏览器会缓存 fetch 的结果。你改了 notes.json 再刷新，
 *   可能读到的还是旧数据。加一个每次都不同的时间戳参数，
 *   就相当于告诉浏览器"这是新地址，别用缓存"。
 *
 * 【为什么必须用 http 打开，不能双击 html】
 *   file:// 协议下浏览器禁止 JS 读取本地文件（跨域限制），
 *   所以要用 tools 里的小服务器打开。
 */
export async function loadNotesFile(url = 'data/notes.json') {
  const res = await fetch(url + '?ts=' + Date.now());
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}

/**
 * 把数据写回 notes.json 文件。
 * 用的是浏览器较新的 File System Access API（Edge / Chrome 支持）。
 */
export async function saveToFile(notes) {
  if (typeof window.showSaveFilePicker !== 'function') {
    throw new Error('这个浏览器不支持"保存到文件"，请用 Edge 或 Chrome');
  }
  const handle = await window.showSaveFilePicker({
    suggestedName: 'notes.json',
    types: [{ description: 'JSON 文件', accept: { 'application/json': ['.json'] } }],
  });
  const writable = await handle.createWritable();
  // 末尾补一个换行，让文件在编辑器里看着舒服
  await writable.write(JSON.stringify(notes, null, 2) + '\n');
  await writable.close();
}

/**
 * 下载一份 JSON 备份（不需要浏览器特殊权限，兼容性最好）。
 */
export function downloadData(notes, filename) {
  const blob = new Blob(
    [JSON.stringify(notes, null, 2) + '\n'],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename || 'notes-backup.json';
  a.click();
  // 用完释放掉，否则内存里的 blob 一直留着
  URL.revokeObjectURL(a.href);
}
