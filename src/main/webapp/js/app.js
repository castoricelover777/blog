/* ============================================================================
   app.js —— Vue 应用（组件定义，可被测试）
   ============================================================================
   【这一版的核心变化：同一份代码，两种运行模式】

     ① 本地全栈版（有 Spring Boot）
          detectMode() → 'api'    → 走 /api/*，可增删改，写进 MySQL
     ② GitHub Pages（纯静态）
          detectMode() → 'static' → 读 data/notes.json，只读展示

   两种模式下，列表 / 搜索 / 分类 / 折叠 / Markdown / 高亮
   这些渲染逻辑完全一样，只有"数据从哪来、能不能写"不同。

   【可测试性依然保留】
     createBlogApp({ api }) —— 测试传入假的 api 对象，
     不联网、不起后端就能测交互。
   ========================================================================== */

import { createApp as _createApp, ref as _ref, computed as _computed, onMounted as _onMounted } from './vendor/vue.esm-browser.prod.js';
import { marked } from './vendor/marked.esm.js';
import { escapeHtml, highlightTitle } from './utils.js';
import { getDayText } from './dates.js';
import {
  filterNotes, sortNotes, groupByMonth, collectCats,
  findById, looksLikeNotes, computeStats,
} from './data.js';
import { saveCache, readCache, downloadData } from './storage.js';
import * as defaultApi from './api.js';

/**
 * 创建知识库应用（只创建，不挂载）。
 *
 * @param {object} [options]
 * @param {object} [options.api] 接口客户端（默认 js/api.js）
 * @param {object} [options.vue] Vue API 集合（测试注入）
 */
export function createBlogApp(options = {}) {
  const vue = options.vue || { ref: _ref, computed: _computed, onMounted: _onMounted };
  const { ref, computed, onMounted } = vue;
  const api = options.api || defaultApi;

  const appConfig = {
    setup() {

    // ======================================================================
    // 一、响应式数据
    // ======================================================================
    const notes = ref([]);
    const keyword = ref('');
    const currentCat = ref('');
    const currentId = ref(null);
    const collapsed = ref({});

    const loading = ref(true);
    const loadError = ref('');
    const toast = ref('');
    const saving = ref(false);

    /** 运行模式：'unknown' | 'api' | 'static' */
    const mode = ref('unknown');
    /** 'online' | 'offline' | 'static' | 'unknown'（给徽标用） */
    const serverStatus = ref('unknown');
    const stats = ref(null);

    const editing = ref(false);
    const editingId = ref(null);
    const form = ref({ title: '', category: '', content: '' });
    const formError = ref('');

    // ======================================================================
    // 二、计算属性
    // ======================================================================
    const filtered = computed(() => filterNotes(notes.value, keyword.value, currentCat.value));
    const groups = computed(() => groupByMonth(filtered.value));

    /** 只有 api 模式才能编辑（静态托管时按钮会隐藏） */
    const canEdit = computed(() => mode.value === 'api');

    const catList = computed(() => {
      if (stats.value && Array.isArray(stats.value.categories) && stats.value.categories.length) {
        return stats.value.categories.map((c) => ({ name: c.name, count: c.count }));
      }
      return collectCats(notes.value).map((name) => ({ name, count: 0 }));
    });

    const tipsText = computed(() => {
      const shown = filtered.value.length;
      const total = notes.value.length;
      return shown === total ? `共 ${total} 条` : `筛出 ${shown} 条 / 共 ${total} 条`;
    });

    const statsText = computed(() => {
      const s = stats.value;
      if (!s || !s.total) return '';
      const wan = s.totalChars >= 10000
        ? (s.totalChars / 10000).toFixed(1) + ' 万字'
        : s.totalChars + ' 字';
      const span = (s.firstDate && s.lastDate) ? `${s.firstDate} ~ ${s.lastDate}` : '';
      return `${s.total} 篇 · ${s.categoryCount} 个分类 · ${wan}${span ? ' · ' + span : ''}`;
    });

    const currentNote = computed(() => findById(notes.value, currentId.value));

    const statusText = computed(() => {
      if (serverStatus.value === 'online') return '● 后端已连接';
      if (serverStatus.value === 'static') return '● 只读模式';
      if (serverStatus.value === 'offline') return '● 后端未连接';
      return '● 连接中…';
    });

    function isCollapsed(key) {
      if (keyword.value !== '' || currentCat.value !== '') return false;
      return collapsed.value[key] === true;
    }

    // ======================================================================
    // 三、小工具
    // ======================================================================
    function showToast(msg) {
      toast.value = msg;
      setTimeout(() => { if (toast.value === msg) toast.value = ''; }, 2500);
    }

    function renderMarkdown(text) {
      if (typeof marked === 'undefined' || !marked.parse) {
        return '<pre style="white-space:pre-wrap">' + escapeHtml(text) + '</pre>';
      }
      return marked.parse(text || '');
    }

    function applyNotes(list) {
      notes.value = list;
      sortNotes(notes.value);
      saveCache(notes.value);
    }

    /** 刷新统计：api 模式问后端；static 模式前端自己算 */
    async function refreshStats() {
      if (mode.value === 'static') {
        stats.value = computeStats(notes.value);
        return;
      }
      try {
        stats.value = await api.fetchStats();
        serverStatus.value = 'online';
      } catch (e) {
        // 统计失败不影响页面，后端状态保持原样
      }
    }

    // ======================================================================
    // 四、启动：先探测模式，再取数据
    // ======================================================================
    async function init() {
      loading.value = true;
      loadError.value = '';

      const cache = readCache();
      const hasCache = looksLikeNotes(cache);
      if (hasCache) applyNotes(cache);

      try {
        // ① 探测有没有后端
        if (typeof api.detectMode === 'function') {
          mode.value = await api.detectMode();
        } else {
          mode.value = 'api';   // 测试里注入的假 api 默认当作有后端
        }

        // ② 取数据（api 模式拿 /api/notes，静态模式拿 data/notes.json）
        const list = await api.fetchNotes();
        applyNotes(list);
        serverStatus.value = mode.value === 'api' ? 'online' : 'static';
        await refreshStats();
      } catch (e) {
        serverStatus.value = 'offline';
        if (!hasCache) {
          loadError.value = '读不到数据（' + (e && e.message ? e.message : e) + '）。'
            + '本地使用时请先双击「启动全栈知识库.bat」。';
        } else {
          showToast('加载失败，当前显示本地缓存');
        }
      } finally {
        loading.value = false;
      }
    }

    // ======================================================================
    // 五、交互方法
    // ======================================================================
    function selectCat(cat) { currentCat.value = cat; }

    function clearSearch() {
      keyword.value = '';
      currentCat.value = '';
    }

    function toggleMonth(key) {
      collapsed.value = { ...collapsed.value, [key]: !collapsed.value[key] };
    }

    function openNote(id) { currentId.value = id; }

    function openAdd() {
      if (!canEdit.value) {
        showToast('线上只读模式：请用本地全栈版编辑');
        return;
      }
      form.value = { title: '', category: currentCat.value || '', content: '' };
      editingId.value = null;
      formError.value = '';
      editing.value = true;
    }

    function openEdit() {
      if (!canEdit.value) {
        showToast('线上只读模式：请用本地全栈版编辑');
        return;
      }
      const n = currentNote.value;
      if (!n) return;
      form.value = { title: n.title, category: n.category, content: n.content };
      editingId.value = n.id;
      formError.value = '';
      editing.value = true;
    }

    function closeForm() {
      editing.value = false;
      formError.value = '';
    }

    async function saveForm() {
      if (!canEdit.value) { formError.value = '当前是只读模式，不能保存'; return; }

      const title = form.value.title.trim();
      const category = form.value.category.trim();
      const content = form.value.content;

      if (title === '') { formError.value = '标题不能为空'; return; }
      if (category === '') { formError.value = '分类不能为空'; return; }
      if (content.trim() === '') { formError.value = '正文不能为空'; return; }

      saving.value = true;
      formError.value = '';
      try {
        let saved;
        if (editingId.value == null) {
          saved = await api.createNote({ title, category, content });
          notes.value.push(saved);
          showToast('已新增一条（已存入数据库）');
        } else {
          saved = await api.updateNote(editingId.value, { title, category, content });
          const n = findById(notes.value, editingId.value);
          if (n) {
            n.title = saved.title;
            n.category = saved.category;
            n.content = saved.content;
            n.date = saved.date;
            n.created = saved.created;
          }
          showToast('已保存修改（已存入数据库）');
        }
        sortNotes(notes.value);
        saveCache(notes.value);
        currentId.value = saved.id;
        editing.value = false;
        await refreshStats();
      } catch (e) {
        formError.value = '保存失败：' + (e && e.message ? e.message : e);
      } finally {
        saving.value = false;
      }
    }

    async function deleteNote() {
      if (!canEdit.value) { showToast('线上只读模式：请用本地全栈版编辑'); return; }
      const n = currentNote.value;
      if (!n) return;
      if (!confirm(`确定删除《${n.title}》吗？\n（会从数据库里真正删掉）`)) return;

      try {
        await api.deleteNote(n.id);
        notes.value = notes.value.filter((x) => x.id !== n.id);
        currentId.value = null;
        saveCache(notes.value);
        showToast('已删除');
        await refreshStats();
      } catch (e) {
        showToast('删除失败：' + (e && e.message ? e.message : e));
      }
    }

    function doDownload() {
      const d = new Date();
      const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      downloadData(notes.value, `notes-${stamp}.json`);
      showToast('已下载备份');
    }

    async function doReload() {
      try {
        const list = await api.fetchNotes();
        applyNotes(list);
        serverStatus.value = mode.value === 'api' ? 'online' : 'static';
        await refreshStats();
        showToast(`已重新加载（${list.length} 条）`);
      } catch (e) {
        serverStatus.value = 'offline';
        showToast('重新加载失败：' + (e && e.message ? e.message : e));
      }
    }

    // ======================================================================
    // 六、生命周期
    // ======================================================================
    onMounted(init);

    // ======================================================================
    // 七、交给模板
    // ======================================================================
    return {
      notes, keyword, currentCat, currentId, loading, loadError, toast,
      saving, serverStatus, stats, statsText, mode, canEdit, statusText,
      editing, editingId, form, formError,
      filtered, groups, cats: catList, tipsText, currentNote,
      isCollapsed, selectCat, clearSearch, toggleMonth, openNote,
      openAdd, openEdit, closeForm, saveForm, deleteNote,
      doDownload, doReload,
      highlightTitle, renderMarkdown, escapeHtml, getDayText,
    };
  },
  };

  const createApp = options.createApp || _createApp;
  if (typeof createApp !== 'function') {
    throw new Error('createBlogApp 拿不到 createApp：请检查 app.js 顶部的 import。');
  }
  return createApp(appConfig);
}
