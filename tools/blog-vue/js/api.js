/* ============================================================================
   api.js —— 后端接口层（前后端分离的那条“线”）
   ============================================================================
   【这个模块的定位】
     和原来的 storage.js 一样，是「跟外界打交道」的地方。
     区别是：storage.js 读写的是本地文件和 localStorage，
     现在换成真正的 HTTP 接口（Spring Boot 后端）。

   【为什么要把“发请求”单独抽一层，而不是在 app.js 里到处 fetch】
     1. 页面组件只管“拿到数据/保存成功”，不关心 URL 长什么样
     2. 统一处理：错误信息、JSON 解析、超时、响应码
     3. 以后接口加鉴权（token）、换域名、加日志，只改这一个文件
     这就是「API 客户端 / service 层」在真实项目里的位置。

   【对照你学过的 Ajax】
     浏览器里 fetch 就是现代版的 Ajax（底层还是 XMLHttpRequest 那一套）。
     GET 拿列表、POST 新增、PUT 修改、DELETE 删除 —— 正好对应后端那几个 @GetMapping 们。
   ========================================================================== */

/** 接口前缀：前后端同源部署时用相对路径；单独启动 8099 调前端时也一样能走通（后端配了 CORS） */
const BASE = '/api';

/**
 * 统一的请求函数：所有接口都从这里走。
 *
 * @param {string} path   如 '/notes'
 * @param {object} [opts] fetch 配置（method / body / headers）
 * @returns {Promise<any>} 解析后的 JSON；204 无内容时返回 null
 */
async function request(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });

  // 204 No Content（删除成功）没有响应体，直接返回 null
  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      // 后端返回的不是 JSON（比如 Tomcat 的错误页），保留原文方便排查
      data = { error: text };
    }
  }

  if (!res.ok) {
    // 后端统一返回 { status, error }，优先用里面的中文提示
    const msg = (data && data.error) ? data.error : ('HTTP ' + res.status);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  return data;
}

/** 查列表：keyword / category 都可以不传；两者可叠加 */
export function fetchNotes({ keyword = '', category = '' } = {}) {
  const params = new URLSearchParams();
  if (keyword) params.set('keyword', keyword);
  if (category) params.set('category', category);
  const qs = params.toString();
  return request('/notes' + (qs ? '?' + qs : ''));
}

/** 查单条 */
export function fetchNote(id) {
  return request('/notes/' + id);
}

/** 新增：后端会自动补 id / 日期 / 创建时间 */
export function createNote(note) {
  return request('/notes', { method: 'POST', body: JSON.stringify(note) });
}

/** 修改 */
export function updateNote(id, note) {
  return request('/notes/' + id, { method: 'PUT', body: JSON.stringify(note) });
}

/** 删除 */
export function deleteNote(id) {
  return request('/notes/' + id, { method: 'DELETE' });
}

/** 分类 + 每类数量 */
export function fetchCategories() {
  return request('/categories');
}

/** 统计信息 */
export function fetchStats() {
  return request('/stats');
}

/** 健康检查：用来在页面上显示“后端已连接/未连接” */
export function checkHealth() {
  return request('/health');
}
