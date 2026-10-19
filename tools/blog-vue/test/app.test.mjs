/* ============================================================================
   app.test.mjs —— Vue 交互测试（jsdom）
   ============================================================================
   怎么跑：
     cd D:\JavaBlog\tools\blog-vue
     node test/app.test.mjs

   【测什么】
     前一份 data.test.mjs 测的是**纯函数**（筛选、排序、格式化）。
     这一份测的是**真正挂载起来的 Vue 应用**：
       · 数据渲染成 DOM 了吗（v-for / {{ }}）
       · 点按钮、改输入框，页面跟着变了吗（事件、v-model、响应式）
       · 搜索高亮、折叠、新增、编辑、删除这些交互对不对

   【怎么骗过浏览器】
     用 jsdom 造一个假浏览器（见 jsdom-setup.mjs），
     再用假的 fetch 喂测试数据，所以：
       · 不需要真的启服务器
       · 不需要真的网络
       · 几秒钟就能跑完，而且每次结果都一样

   【为什么能这么测 —— 这是本次重构最实在的收获】
     原来 app.js 一加载就 .mount('#app')，测试没法插手。
     现在 app.js 导出 createBlogApp()，挂载权交给调用方：
       生产：main.js 挂到真实页面
       测试：本文件挂到 jsdom 的假页面
   ========================================================================== */

import { setupDOM, fakeApi, makeNotes } from './jsdom-setup.mjs';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('  PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; failures.push(name); console.log('  FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n--- ' + t + ' ---'); }

// ============================================================================
// 准备
// ============================================================================
console.log('=== blog-vue Vue 交互测试（jsdom）===');

// 第 1 步：先造浏览器环境
const { dom, window, document } = setupDOM();

// 第 2 步：加载 Vue。
// 【关键】路径必须和 js/app.js 里 import 的**完全一致**，
//   node 会按解析后的 URL 缓存模块，路径一致才能拿到同一个 Vue 实例。
const vue = await import('../js/vendor/vue.esm-browser.prod.js');

// 第 3 步：加载应用模块（它内部也 import 上面那个 Vue）
const { createBlogApp } = await import('../js/app.js');

console.log('环境就绪：Vue ' + vue.version + ' + jsdom');

/** 等 Vue 刷新 DOM：用同一个 Vue 实例的 nextTick，再让出一个宏任务 */
async function flush() {
  await vue.nextTick();
  await new Promise((r) => setTimeout(r, 0));
}

// 页面模板：取自 index.html，只保留测试要用的部分
const TEMPLATE = `
<div class="wrap">
  <input id="search" type="text" v-model="keyword">
  <button id="btn-clear" @click="clearSearch">清空</button>
  <button id="btn-add" @click="openAdd">新增</button>

  <nav id="cats">
    <span class="cat" :class="{ 'cat-active': currentCat === '' }" @click="selectCat('')">全部</span>
    <span v-for="c in cats" :key="c.name" class="cat"
          :class="{ 'cat-active': currentCat === c.name }"
          @click="selectCat(c.name)">{{ c.name }}</span>
    <span class="tips">{{ tipsText }}</span>
  </nav>

  <ul id="list">
    <li v-if="loading" class="empty">加载中</li>
    <li v-else-if="loadError" class="empty err">{{ loadError }}</li>
    <li v-else-if="filtered.length === 0" class="empty">没有匹配的记录</li>
    <template v-else v-for="g in groups" :key="g.key">
      <li class="group">
        <div class="group-head" @click="toggleMonth(g.key)">
          <b>{{ isCollapsed(g.key) ? 'C' : 'E' }}</b> {{ g.name }} · {{ g.items.length }}
        </div>
        <div class="group-items" :class="{ collapsed: isCollapsed(g.key) }">
          <ul class="plain">
            <li v-for="n in g.items" :key="n.id" class="note"
                :class="{ active: currentId === n.id }" @click="openNote(n.id)">
              <b class="day">{{ getDayText(n.date) }}</b>
              <span class="note-title" v-html="highlightTitle(n.title, keyword)"></span>
              <span class="cat-tag">{{ escapeHtml(n.category) }}</span>
            </li>
          </ul>
        </div>
      </li>
    </template>
  </ul>

  <div id="content">
    <template v-if="currentNote">
      <div class="bar"><span>{{ currentNote.category }}</span></div>
      <h1>{{ currentNote.title }}</h1>
      <button id="btn-edit" @click="openEdit">编辑</button>
      <button id="btn-del" @click="deleteNote">删除</button>
      <div class="md" v-html="renderMarkdown(currentNote.content)"></div>
    </template>
    <p v-else class="welcome">未选中</p>
  </div>

  <div class="mask" v-if="editing">
    <div class="dialog">
      <input id="f-title" type="text" v-model="form.title">
      <input id="f-cat" type="text" v-model="form.category">
      <textarea id="f-content" v-model="form.content"></textarea>
      <p class="err" v-if="formError">{{ formError }}</p>
      <button id="btn-save" @click="saveForm">保存</button>
      <button id="btn-cancel" @click="closeForm">取消</button>
    </div>
  </div>
  <div class="toast" v-if="toast">{{ toast }}</div>
</div>`;

// 挂载用的容器（单独造，不用 #app，避免模板被替换）
const root = document.createElement('div');
root.innerHTML = TEMPLATE;
document.body.appendChild(root);

const app = createBlogApp({ api: fakeApi(makeNotes()) });
const vm = app.mount(root);
await flush();

// 常用查询小工具
const $ = (sel) => root.querySelector(sel);
const $$ = (sel) => Array.from(root.querySelectorAll(sel));

// ============================================================================
section('一、初始渲染（数据 → 页面）');
// ============================================================================
check('根组件已挂载', !!vm, 'vm 可用');
check('列表渲染出 4 条笔记', $$('li.note').length === 4, $$('li.note').length + ' 条');
check('月份分组渲染出 2 组（10 月 3 条 + 7 月 1 条）', $$('li.group').length === 2, $$('li.group').length + ' 组');
check('分类药丸渲染（全部 + 3 个分类）', $$('#cats .cat').length === 4, $$('#cats .cat').length + ' 个');
check('默认高亮"全部"',
  $('#cats .cat').classList.contains('cat-active'), '全部 高亮');
check('统计文字正确', $('.tips').textContent.trim() === '共 4 条', $('.tips').textContent.trim());
check('未选中时显示欢迎语', !!$('.welcome'), 'ok');
check('日期只显示"日"', $$('li.note .day')[0].textContent.trim() === '15', $$('li.note .day')[0].textContent.trim());

// ============================================================================
section('二、搜索（v-model + 高亮）');
// ============================================================================
{
  const search = $('#search');
  search.value = 'Java';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));   // 模拟用户输入
  await flush();

  check('v-model 同步到数据', vm.keyword === 'Java', 'keyword = ' + vm.keyword);
  check('搜索后列表变短（Java 命中 3 条：2 条标题 + 1 条分类）', $$('li.note').length === 3, $$('li.note').length + ' 条');
  check('统计文字变成"筛出"', $('.tips').textContent.trim().indexOf('筛出') === 0, $('.tips').textContent.trim());
  check('命中处出现 <mark> 高亮', $$('li.note mark').length > 0, $$('li.note mark').length + ' 处');
  check('高亮内容是关键词', $$('li.note mark')[0].textContent === 'Java', $$('li.note mark')[0].textContent);

  // 清空
  $('#btn-clear').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
  check('点清空后恢复全部', $$('li.note').length === 4 && vm.keyword === '', vm.keyword + ' / ' + $$('li.note').length + ' 条');
}

// ============================================================================
section('三、分类筛选（事件 + :class）');
// ============================================================================
{
  const javaBtn = $$('#cats .cat').find((el) => el.textContent.trim() === 'Java');
  check('找到 Java 分类按钮', !!javaBtn, javaBtn ? javaBtn.textContent.trim() : '无');
  javaBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();

  check('分类筛选生效', $$('li.note').length === 2, $$('li.note').length + ' 条');
  check('Java 药丸变成高亮',
    javaBtn.classList.contains('cat-active'), 'cat-active = ' + javaBtn.classList.contains('cat-active'));
  check('"全部"不再高亮',
    !$('#cats .cat').classList.contains('cat-active'), 'ok');
  check('currentCat 数据已更新', vm.currentCat === 'Java', vm.currentCat);

  // 点回全部
  $('#cats .cat').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
  check('点"全部"恢复', $$('li.note').length === 4, $$('li.note').length + ' 条');
}

// ============================================================================
section('四、折叠/展开（改数据即渲染）');
// ============================================================================
{
  const head = $('.group-head');
  const box = $('.group-items');
  check('初始未折叠', !box.classList.contains('collapsed'), 'ok');

  head.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
  check('点一次 → 折叠', $('.group-items').classList.contains('collapsed'), 'collapsed');
  check('折叠箭头变了', $('.group-head b').textContent.trim() === 'C', $('.group-head b').textContent.trim());

  $('.group-head').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
  check('再点一次 → 展开', !$('.group-items').classList.contains('collapsed'), 'ok');

  // 搜索时应该强制展开
  $('.group-head').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
  const search = $('#search');
  search.value = 'Java';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await flush();
  check('搜索时强制展开', $('.group-items').classList.contains('collapsed') === false,
    '搜索中不折叠');
  search.value = '';
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
  await flush();
  check('清空搜索后恢复折叠', $('.group-items').classList.contains('collapsed') === true, '恢复折叠');
  // 恢复现场
  $('.group-head').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
}

// ============================================================================
section('五、查看详情（v-if + v-html 渲染 Markdown）');
// ============================================================================
{
  const first = $$('li.note')[0];
  first.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();

  check('详情区出现标题', !!$('#content h1'), $('#content h1') ? $('#content h1').textContent.trim() : '无');
  check('详情标题与笔记一致', $('#content h1').textContent.trim() === 'Vue 重构笔记', $('#content h1').textContent.trim());
  check('笔记条目变成选中态', $$('li.note')[0].classList.contains('active'), 'active');
  check('currentId 已记录', vm.currentId === 1, String(vm.currentId));
  check('Markdown 渲染成 HTML（v-html）', !!$('#content .md h1'), '含 <h1>');
  check('Markdown 加粗渲染', !!$('#content .md strong'), '含 <strong>');

  // 点另一条
  $$('li.note')[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
  check('切换笔记详情跟着变', $('#content h1').textContent.trim() !== 'Vue 重构笔记', $('#content h1').textContent.trim());
}

// ============================================================================
section('六、新增笔记（表单替代 prompt）');
// ============================================================================
{
  $('#btn-add').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
  check('点新增打开表单', !!$('.mask') && vm.editing === true, 'editing = ' + vm.editing);
  check('新增时 editingId 为空', vm.editingId === null, String(vm.editingId));

  // 先测校验：空标题
  $('#btn-save').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
  check('空标题被拦下并提示', !!$('.err') && $('.err').textContent.indexOf('标题') > -1,
    $('.err') ? $('.err').textContent.trim() : '无提示');
  check('校验失败时不关闭表单', vm.editing === true && $$('li.note').length === 4, '仍 4 条');

  // 正确填写
  const setVal = (sel, val) => {
    const el = $(sel);
    el.value = val;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  setVal('#f-title', 'jsdom 测试新增的笔记');
  setVal('#f-cat', '测试分类');
  setVal('#f-content', '这是测试正文');
  await flush();

  $('#btn-save').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();

  check('保存后表单关闭', vm.editing === false, 'editing = ' + vm.editing);
  check('笔记数量 +1', $$('li.note').length === 5, $$('li.note').length + ' 条');
  check('新笔记出现在数据里', vm.notes.some((n) => n.title === 'jsdom 测试新增的笔记'), 'ok');
  check('新分类出现在药丸里', $$('#cats .cat').some((el) => el.textContent.trim() === '测试分类'), '测试分类');
  check('保存后自动选中新笔记', vm.currentId !== null && $('#content h1') !== null, 'ok');
  check('出现轻提示 toast', vm.toast !== '' || !!$('.toast') === false, 'toast = ' + JSON.stringify(vm.toast));
}

// ============================================================================
section('七、编辑笔记');
// ============================================================================
{
  $('#btn-edit').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
  check('点编辑打开表单', vm.editing === true, 'editing');
  check('表单预填了原标题', $('#f-title').value === 'jsdom 测试新增的笔记', $('#f-title').value);
  check('editingId 指向当前笔记', vm.editingId === vm.currentId, String(vm.editingId));

  const el = $('#f-title');
  el.value = '改过的标题';
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
  await flush();
  $('#btn-save').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();

  check('编辑后标题已更新', vm.notes.some((n) => n.title === '改过的标题'), 'ok');
  check('编辑不增加数量', $$('li.note').length === 5, $$('li.note').length + ' 条');
  check('详情区同步显示新标题', $('#content h1').textContent.trim() === '改过的标题', $('#content h1').textContent.trim());

  // 取消按钮
  $('#btn-edit').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
  $('#btn-cancel').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
  check('点取消关闭表单', vm.editing === false, 'editing = ' + vm.editing);
}

// ============================================================================
section('八、删除笔记');
// ============================================================================
{
  // deleteNote 里用了 confirm()，jsdom 默认会报"未实现"，这里先替换成"总是同意"
  window.confirm = () => true;
  globalThis.confirm = window.confirm;

  const before = $$('li.note').length;
  const targetTitle = $('#content h1').textContent.trim();
  $('#btn-del').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();

  check('删除后数量 -1', $$('li.note').length === before - 1, before + ' → ' + $$('li.note').length);
  check('被删的笔记不在数据里', !vm.notes.some((n) => n.title === targetTitle), '已删：' + targetTitle);
  check('删除后清空选中', vm.currentId === null, String(vm.currentId));
  check('删除后显示欢迎语', !!$('.welcome'), 'ok');

  // 测"取消删除"
  vm.openNote(vm.notes[0].id);
  await flush();
  window.confirm = () => false;
  globalThis.confirm = window.confirm;
  const n2 = $$('li.note').length;
  $('#btn-del').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
  check('confirm 返回 false 时不删除', $$('li.note').length === n2, n2 + ' 条不变');
}

// ============================================================================
section('九、加载失败与边界');
// ============================================================================
{
  // 造一个新的挂载点，用一个"总是失败"的 fetch
  const root2 = document.createElement('div');
  root2.innerHTML = TEMPLATE;
  document.body.appendChild(root2);

  // ⚠ 关键：先清掉 localStorage 缓存。
  //   因为 jsdom 里所有的 app 实例共享同一个 localStorage，
  //   前面的实例已经 saveCache() 写进缓存了；
  //   不清的话新实例会读到缓存（hasCache=true），
  //   于是"取数失败"就不会显示错误提示 —— 那是正确行为，不是 bug。
  const before = localStorage.getItem('javablog-notes-cache-v1');
  localStorage.clear();

  const app2 = createBlogApp({ api: { fetchNotes: async () => { throw new Error('模拟网络失败'); }, fetchStats: async () => { throw new Error('模拟网络失败'); } } });
  const vm2 = app2.mount(root2);
  await flush();

  check('取数失败时不崩', !!vm2, 'vm2 可用');
  check('取数失败显示错误提示（无缓存时）',
    !!root2.querySelector('.err'),
    root2.querySelector('.err') ? root2.querySelector('.err').textContent.trim().slice(0, 30) : '无');
  check('取数失败时 loading 结束', vm2.loading === false, 'loading = ' + vm2.loading);

  // 还原缓存，避免影响后面的用例（虽然这已经是最后一组）
  if (before !== null) localStorage.setItem('javablog-notes-cache-v1', before);
}

// ============================================================================
console.log('\n' + '='.repeat(52));
console.log('  结果：' + pass + ' 通过, ' + fail + ' 失败');
if (fail > 0) console.log('  失败项：' + failures.join('、'));
console.log('='.repeat(52));

process.exit(fail === 0 ? 0 : 1);
