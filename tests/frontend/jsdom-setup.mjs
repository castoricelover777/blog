/* ============================================================================
   jsdom-setup.mjs —— 给测试用的"假浏览器"环境
   ============================================================================
   【为什么需要它】
     Vue 的运行时代码会访问一堆浏览器全局对象（document、window、SVGElement…）。
     node 里默认没有这些，所以要在测试开始前先把它们"造"出来。
     jsdom 就是干这个的：它用纯 JS 实现了一套浏览器 DOM。

   【⚠ 一个必须记住的顺序问题】
     Vue 的 ESM 构建在**加载的那一刻**就会去摸这些全局对象。
     所以必须：先造环境 → 再 import Vue。
     这就是为什么测试里用 `await import(...)` 而不用顶部的静态 import
     （静态 import 会被提前到文件最前面执行，那时环境还没造好）。

   【导出什么】
     setupDOM()  造好 jsdom 并把全局对象挂到 globalThis，返回 dom 实例
     importVue() 动态加载 Vue（必须在上面的 setupDOM 之后调用）
   ========================================================================== */

import { JSDOM } from 'jsdom';

/**
 * 造一个假的浏览器环境。
 * @param {string} html body 里的初始 HTML（默认只有一个 #app 容器）
 * @returns {{ dom, window, document }}
 */
export function setupDOM(html = '<div id="app"></div>') {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>${html}</body></html>`,
    {
      url: 'http://localhost:8099/',   // 给个假地址，代码里用到 location 时不报错
      pretendToBeVisual: true,         // 提供 requestAnimationFrame
    }
  );

  const w = dom.window;

  // ---- 1) 把 DOM 相关的全局对象挂上去 ----
  globalThis.window = w;
  globalThis.document = w.document;

  // 这些"类"Vue 在挂载时会用到（SVGElement / MathMLElement 用于判断命名空间）
  const classes = [
    'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement',
    'Element', 'SVGElement', 'MathMLElement', 'Node', 'Document', 'DocumentFragment',
    'ShadowRoot', 'Text', 'Comment', 'Event', 'MouseEvent', 'KeyboardEvent',
    'CustomEvent', 'MutationObserver', 'ResizeObserver', 'getComputedStyle',
    'DOMParser', 'XMLSerializer',
  ];
  for (const name of classes) {
    if (w[name] !== undefined) {
      globalThis[name] = w[name];
    }
  }
  // MathMLElement 有些 jsdom 版本没有，补一个空类兜底（Vue 只用它做 instanceof 判断）
  if (globalThis.MathMLElement === undefined) {
    globalThis.MathMLElement = class MathMLElement extends w.HTMLElement {};
    w.MathMLElement = globalThis.MathMLElement;
  }
  // ResizeObserver 同理（Vue 的某些组件会用到）
  if (globalThis.ResizeObserver === undefined) {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.ResizeObserver = globalThis.ResizeObserver;
  }

  // ---- 2) 动画帧（Vue 的 nextTick 在部分路径会用到）----
  if (w.requestAnimationFrame) {
    globalThis.requestAnimationFrame = w.requestAnimationFrame.bind(w);
    globalThis.cancelAnimationFrame = w.cancelAnimationFrame.bind(w);
  }

  // ---- 3) navigator 在 node 21+ 是只读 getter，必须用 defineProperty ----
  Object.defineProperty(globalThis, 'navigator', {
    value: w.navigator, configurable: true, writable: true,
  });

  // ---- 4) 让 localStorage 全局可用（storage.js 会用它）----
  globalThis.localStorage = w.localStorage;

  return { dom, window: w, document: w.document };
}

/**
 * 动态加载 Vue。**必须在 setupDOM() 之后调用**。
 * @returns Vue 的模块导出（createApp / ref / computed / onMounted / nextTick / version…）
 */
export async function importVue() {
  return await import('../../src/main/webapp/js/vendor/vue.esm-browser.prod.js');
}

/**
 * 等 Vue 把 DOM 更新完（nextTick + 一个宏任务）。
 * 测试里改完数据、点完按钮，都要等一下再断言。
 */
export async function flush(vue) {
  if (vue && vue.nextTick) {
    await vue.nextTick();
  }
  await new Promise((r) => setTimeout(r, 0));
}

/**
 * 造一个假的 fetch（让测试不真的发请求）。
 * @param {any} data 想让 fetch 返回的数据
 * @returns {Function} 可直接传给 createBlogApp({ fetchNotes }) 的函数
 */
export function fakeFetch(data) {
  return async function fetchNotes() {
    // 模拟 storage.loadNotesFile() 的返回：直接给出 JSON 对象
    return JSON.parse(JSON.stringify(data));
  };
}

/** 造一批测试笔记数据 */
export function makeNotes() {
  return [
    { id: 1, date: '2026-10-15', created: '2026-10-15 21:20', title: 'Vue 重构笔记', category: 'JavaWeb', content: '# 标题\n\n正文 **加粗**' },
    { id: 2, date: '2026-10-06', created: '2026-10-06 18:00', title: '第二条 Java 笔记', category: 'Java', content: '内容 B' },
    { id: 3, date: '2026-10-06', created: '2026-10-06 10:29', title: '第一条 Java 笔记', category: 'Java', content: '内容 A' },
    { id: 4, date: '2026-07-31', created: '2026-07-31 11:46', title: 'C语言 day3 数组', category: 'C语言', content: '数组内容' },
  ];
}

/**
 * 造一个假的 API 客户端（模拟 Spring Boot 后端）。
 *
 * 【为什么测试要假 api 而不是真连后端】
 *   单元测试要快、要稳定、要能离线跑。真连数据库会让测试变慢、依赖环境、
 *   而且改一条数据就污染真实数据。假 api 把“后端行为”用内存模拟出来，
 *   业务逻辑（校验、渲染、状态更新）照样能测。
 *
 * 【它模拟了哪些接口】
 *   fetchNotes / fetchStats / createNote / updateNote / deleteNote
 *   行为与真实后端保持约定一致：新增返回带 id 的完整对象、修改返回新对象、
 *   删除返回 null、统计按分类聚合。
 *
 * @param {Array} initialNotes 初始数据（一般传 makeNotes()）
 */
export function fakeApi(initialNotes) {
  let notes = JSON.parse(JSON.stringify(initialNotes));
  let seq = 1000000;
  const counters = { create: 0, update: 0, delete: 0 };

  return {
    counters,
    async fetchNotes() {
      return JSON.parse(JSON.stringify(notes));
    },
    async fetchStats() {
      const map = new Map();
      notes.forEach((n) => map.set(n.category, (map.get(n.category) || 0) + 1));
      const categories = Array.from(map.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      const dates = notes.map((n) => n.date).sort();
      return {
        total: notes.length,
        categoryCount: categories.length,
        totalChars: notes.reduce((s, n) => s + (n.content || '').length, 0),
        firstDate: dates[0] || null,
        lastDate: dates[dates.length - 1] || null,
        categories,
      };
    },
    async createNote(payload) {
      counters.create++;
      seq++;
      const note = {
        id: seq,
        date: '2026-10-19',
        created: '2026-10-19 17:00',
        title: payload.title,
        category: payload.category,
        content: payload.content,
      };
      notes.push(note);
      return JSON.parse(JSON.stringify(note));
    },
    async updateNote(id, payload) {
      counters.update++;
      const n = notes.find((x) => x.id === id);
      Object.assign(n, payload);
      return JSON.parse(JSON.stringify(n));
    },
    async deleteNote(id) {
      counters.delete++;
      notes = notes.filter((x) => x.id !== id);
      return null;
    },
    /** 测试里查看“后端”最终存了什么 */
    stored() {
      return JSON.parse(JSON.stringify(notes));
    },
  };
}