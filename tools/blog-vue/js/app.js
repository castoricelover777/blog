/* ============================================================================
   app.js —— Vue 应用（组件定义，可被测试）· 全栈版
   ============================================================================
   【这一版和上一版（纯静态）的区别】
     上一版：数据从 data/notes.json 文件读，改完靠「保存到文件」写回去。
     这一版：数据从 Spring Boot 后端（/api/notes）读，增删改都直接落库（MySQL）。

   变化点其实只有「数据从哪来、往哪去」，也就是下面这个 api 对象：
     上一版  storage.loadNotesFile()          → 现在 api.fetchNotes()
     上一版  storage.saveToFile(notes)        → 现在 api.createNote / updateNote / deleteNote
     页面渲染、筛选、分组、Markdown —— 一行都没动。
   这就是「分层」的价值：换掉存储方式，界面逻辑几乎不用改。

   【可测试性继续保留】
     createBlogApp({ api }) —— 测试里传入假的 api 对象，
     不联网、不启后端，就能测新增/编辑/删除/搜索这些交互。
   ========================================================================== */

// 相对路径而不是裸名 'vue'：浏览器和 node 都能直接解析（理由见旧版注释）
import { createApp as _createApp, ref as _ref, computed as _computed, onMounted as _onMounted } from './vendor/vue.esm-browser.prod.js';
import { marked } from './vendor/marked.esm.js';
import { escapeHtml, highlightTitle } from './utils.js';
import { getDayText } from './dates.js';
import {
  filterNotes, sortNotes, groupByMonth, collectCats,
  findById, looksLikeNotes,
} from './data.js';
import { saveCache, readCache, downloadData } from './storage.js';
import * as defaultApi from './api.js';

/**
 * 创建知识库应用（只创建，不挂载）。
 *
 * @param {object}   [options]
 * @param {object}   [options.api]  接口客户端（默认用 js/api.js 里那套真实现）
 * @param {object}   [options.vue]  Vue API 集合（测试用 jsdom 时注入）
 * @returns Vue 应用实例，调用方自己 .mount()
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
    const notes = ref([]);          // 全部笔记（来自后端）
    const keyword = ref('');
    const currentCat = ref('');
    const currentId = ref(null);
    const collapsed = ref({});

    const loading = ref(true);
    const loadError = ref('');
    const toast = ref('');
    const saving = ref(false);      // 保存中（用来禁用按钮，防重复提交）

    // 和后端的连接状态：online / offline / unknown
    const serverStatus = ref('unknown');
    // 后端统计（总数、分类数、字数、时间跨度）
    const stats = ref(null);

    // 表单
    const editing = ref(false);
    const editingId = ref(null);
    const form = ref({ title: '', category: '', content: '' });
    const formError = ref('');

    // ======================================================================
    // 二、计算属性
    // ======================================================================
    const filtered = computed(() => filterNotes(notes.value, keyword.value, currentCat.value));
    const groups = computed(() => groupByMonth(filtered.value));

    /**
     * 分类列表：
     *   优先用后端返回的统计（带数量），后端不可用时退回本地 collectCats。
     *   这样即使后端挂了、只读到缓存，页面也还能正常展示。
     */
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

    /** 页头那行统计文字 */
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

    /** 把后端返回的列表装进页面（排序 + 写缓存） */
    function applyNotes(list) {
      notes.value = list;
      sortNotes(notes.value);
      saveCache(notes.value);
    }

    /** 刷新统计（失败不影响主流程，只是数字不更新） */
    async function refreshStats() {
      try {
        stats.value = await api.fetchStats();
        serverStatus.value = 'online';
      } catch (e) {
        serverStatus.value = 'offline';
      }
    }

    // ======================================================================
    // 四、启动：从后端读数据
    // ======================================================================
    async function init() {
      loading.value = true;
      loadError.value = '';

      // 先用 localStorage 缓存把页面点亮（秒开，不用等网络）
      const cache = readCache();
      const hasCache = looksLikeNotes(cache);
      if (hasCache) {
        applyNotes(cache);
      }

      try {
        const list = await api.fetchNotes();
        applyNotes(list);
        serverStatus.value = 'online';
        await refreshStats();
      } catch (e) {
        serverStatus.value = 'offline';
        if (!hasCache) {
          loadError.value = '连不上后端（' + (e && e.message ? e.message : e) + '）。'
            + '请先双击 JavaBlog 目录下的「启动知识库.bat」，再刷新页面。';
        } else {
          showToast('后端未连接，当前显示的是本地缓存');
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
      form.value = { title: '', category: currentCat.value || '', content: '' };
      editingId.value = null;
      formError.value = '';
      editing.value = true;
    }

    function openEdit() {
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

    /**
     * 保存（新增或编辑）—— 现在是真的写到后端数据库。
     *
     * 【和上一版的关键区别】
     *   上一版：本地 push 一条就完事，数据只在内存/缓存/文件里。
     *   这一版：等后端返回成功才更新页面。失败就提示，页面不会出现
     *           「界面显示保存成功、其实数据库没写进去」的假象。
     */
    async function saveForm() {
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
        // 后端的校验信息（400）或网络错误都会走到这里
        formError.value = '保存失败：' + (e && e.message ? e.message : e);
      } finally {
        saving.value = false;
      }
    }

    /** 删除：同样以后端结果为准 */
    async function deleteNote() {
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

    /** 下载一份 JSON 备份（后端数据可以随时导出成文件，反向迁移也不怕） */
    function doDownload() {
      const date = new Date();
      const stamp = date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
      downloadData(notes.value, `notes-${stamp}.json`);
      showToast('已下载备份');
    }

    /** 重新从后端加载（数据在别的设备/窗口改过时用） */
    async function doReload() {
      try {
        const list = await api.fetchNotes();
        applyNotes(list);
        serverStatus.value = 'online';
        await refreshStats();
        showToast(`已从后端重新加载（${list.length} 条）`);
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
      saving, serverStatus, stats, statsText,
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
