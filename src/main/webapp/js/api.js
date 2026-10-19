/* ============================================================================
   api.js —— 数据来源层（同时支持「有后端」和「纯静态」两种模式）
   ============================================================================
   【为什么要两种模式】
     同一份前端代码要跑在两个地方：
       ① 本地全栈版：Spring Boot 提供 /api/*，可以增删改（写进 MySQL）
       ② GitHub Pages：纯静态托管，没有后端，只能读 data/notes.json（只读）

   【怎么自动识别】
     启动时先探一下 GET /api/health：
       · 通了  → mode = 'api'    （全功能，编辑按钮可用）
       · 不通  → mode = 'static' （只读，页面顶部显示横幅）
     这样同一份代码不用改配置、不用打包两个版本，放到哪都能用。

   【为什么"降级"比"报错"好】
     线上页面如果一进来说"连不上后端"会很吓人；
     自动切到只读模式、并明确告诉用户"线上只读，编辑请用本地全栈版"，
     体验上就是"少了个功能"，而不是"页面坏了"。
   ========================================================================== */

const BASE = '/api';

/** 当前模式：'api'（有后端）| 'static'（纯静态只读） */
let mode = 'unknown';

export function getMode() {
  return mode;
}

/** 只读判断：静态模式下不允许增删改 */
export function isReadOnly() {
  return mode === 'static';
}

/**
 * 带超时的 signal：探测后端时不能等太久。
 * 优先用 AbortSignal.timeout（现代浏览器原生），不支持就手动造一个。
 */
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

/**
 * 统一请求函数：所有 API 调用都从这里走。
 * 负责：JSON 解析、错误信息、204 处理。
 */
async function request(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const msg = (data && data.error) ? data.error : ('HTTP ' + res.status);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * 探测运行环境：有后端就是 api 模式，否则静态只读模式。
 * 只探一次，结果缓存在 mode 里。
 */
export async function detectMode() {
  if (mode !== 'unknown') return mode;
  try {
    const res = await fetch(BASE + '/health', { signal: timeoutSignal(1500) });
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'ok') {
        mode = 'api';
        return mode;
      }
    }
  } catch (e) {
    // 连不上（Pages / 静态服务器 / 后端没启动）——都按只读处理
  }
  mode = 'static';
  return mode;
}

/** 静态模式：直接读站点目录下的 data/notes.json（和旧静态版同一个数据文件） */
export async function fetchStaticNotes() {
  const res = await fetch('data/notes.json?ts=' + Date.now());
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/** 查列表：按模式自动选择数据来源 */
export async function fetchNotes() {
  if (mode === 'static') return fetchStaticNotes();
  return request('/notes');
}

/** 统计：只在 api 模式用；静态模式下由前端 computeStats() 自己算 */
export function fetchStats() {
  return request('/stats');
}

/** 分类列表（api 模式的轻量接口；静态模式用本地 collectCats） */
export function fetchCategories() {
  return request('/categories');
}

function ensureWritable() {
  if (mode !== 'api') {
    const err = new Error('当前是静态只读模式（线上页面），不能修改。请用本地全栈版编辑。');
    err.readOnly = true;
    throw err;
  }
}

export function createNote(note) {
  ensureWritable();
  return request('/notes', { method: 'POST', body: JSON.stringify(note) });
}

export function updateNote(id, note) {
  ensureWritable();
  return request('/notes/' + id, { method: 'PUT', body: JSON.stringify(note) });
}

export function deleteNote(id) {
  ensureWritable();
  return request('/notes/' + id, { method: 'DELETE' });
}

/** 健康检查（给外部调用/调试用） */
export function checkHealth() {
  return request('/health');
}
