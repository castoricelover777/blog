/* ============================================================================
 * app.js —— 极简版个人全科知识库的全部逻辑
 * ============================================================================
 *
 * 【一、这个文件干什么】
 *   左边按"年月归档"显示记录列表（可折叠），右边显示某一条的正文。
 *   能新增、编辑、删除、搜索、按分类筛选、保存数据。
 *   全部用原生 JavaScript 写，唯一用到的外部库是 marked.js（把 Markdown 变成 HTML）。
 *
 * 【二、数据存在哪里】—— 这是理解本项目最关键的一点
 *   数据同时存在于两个地方，规则很简单：
 *
 *     1) localStorage —— 浏览器自己的小仓库（在硬盘上，但由浏览器管理，你平时看不到）。
 *        每次增删改都会立刻存进去，所以刷新页面、关掉浏览器再打开，东西都还在。
 *
 *     2) data/notes.json —— 一个真真正正的文本文件，就在项目目录里。
 *        它有两个用途：
 *          · 第一次打开页面时（浏览器仓库还是空的），读它当初始数据；
 *          · 点【💾 保存到文件】时，通过本地小服务器把当前数据写回它；
 *            或者点【⬇ 下载数据】导出一个新的 notes.json，自己拿它覆盖原文件。
 *
 *     打开页面时的判断顺序（代码在 start() 里）：
 *        localStorage 里有数据吗？ ──有──> 直接用缓存
 *                                  └─没有──> 去读 data/notes.json，读完再存进缓存
 *
 *   ⚠️ 两个地方的数据不会自动同步，这是最容易搞混的地方：
 *        · 你在网页上改了东西  -> localStorage 立刻变，data/notes.json 不变
 *        · 你手改了 notes.json -> 网页上看不到，除非清掉缓存（方法见 README）
 *
 * 【三、四个操作分别怎么实现】（都是最基础的办法，没有弹窗组件、没有表单）
 *     新增：连续弹 4 个 prompt() 问你 日期 → 标题 → 分类 → 正文，然后 notes.push()
 *     编辑：弹 2 个 prompt() 改标题和正文，直接改数组里那个对象的字段
 *     删除：弹一个 confirm() 问你确定吗，然后 notes.splice() 把它从数组里拿掉
 *     搜索：输入框里每松一次键，就重新筛一遍、重新画一遍列表（见 searchNotes）
 *
 * 【四、建议的阅读顺序】
 *     start()  →  showList()  →  showNote()  →  addNote()  →  editNote()  →  deleteNote()
 *     →  saveToFile()  →  downloadData()  →  最后看最下面那几个小工具函数
 *
 * 【五、几个名词，先认识一下】
 *     · 数组        —— notes 就是一个数组，里面装着一条条记录，用 notes[0]、notes[1] 取
 *     · 对象        —— 每一条记录是一个对象，形如 {id: 1, date: '2026-07-10', ...}
 *     · DOM         —— 浏览器把 HTML 变成的一棵"元素树"，JS 通过它来改页面内容
 *     · localStorage—— 浏览器提供的本地存储，只能存字符串，所以对象要先 JSON.stringify
 *     · JSON        —— 一种文本格式，用来表示对象和数组；JSON.stringify(转成文本) / JSON.parse(转回对象)
 *     · fetch       —— 浏览器提供的"发请求"的函数，拿结果是异步的（要等），
 *                      所以用 .then() 接"拿到之后要做什么"
 *     · Markdown    —— 一种用纯文本写排版的语法（# 是标题，** 是加粗），marked.js 负责转成 HTML
 *     · 闭包        —— 函数里面再定义函数，里面的函数能用外面的变量。详见 makeMonthKey 的注释
 * ========================================================================== */

// ============================================================================
// 一、全局变量
//     "全局"的意思是：下面的每个函数都能直接用这些变量，不用一层层往下传。
// ============================================================================

// 所有记录都存在这个数组里。每一项的形状是：
//   { id: 1783612800000, date: '2026-07-10', title: '标题', category: 'Java', content: 'Markdown 正文' }
// 页面上显示的所有内容，都是从它算出来的。想改数据，就改它。
let notes = [];

// 当前正在看哪一条 —— 存的是这条记录的 id，不是数组下标。
// ⚠️ 为什么不用下标？因为列表会分组、会筛选，下标随时会变；
//    而 id 是这条记录永远不变的名字，用它来找一定不会找错。
// 用 -1 表示"还没选中任何一条"——因为 id 都是正数，用 -1 当"空"很方便判断。
let currentId = -1;

// 搜索框里的关键词（小写，方便比较）。空字符串表示"没在搜索"。
let keyword = '';

// 当前选中的分类。空字符串表示"全部分类"。
let currentCat = '';

// 存进浏览器 localStorage 时用的名字（相当于一个抽屉的标签）。
// localStorage 是按"名字"存东西的，同一个名字再存一次会覆盖旧内容。
let KEY = 'notes';

// 所有分类的名字，由 collectCats() 自动从数据里收集出来。
let cats = [];

// 哪些月份被折叠起来了（收起了内容，只看得到月份标题）。
// 它是一张"对照表"（这种结构叫对象/字典），形如：
//   { '2026-07': true, '2026-06': true }
// 判断某个月是否折叠：collapsed[key] == true
let collapsed = {};

// 先把页面上三个容器取出来存好。
// document.getElementById('list') 的意思是：去 HTML 里找 id="list" 的那个元素。
// 提前取一次，后面反复用，比每次都去查一遍快，也更省事。
let listBox = document.getElementById('list');       // 左边那个 <ul>
let contentBox = document.getElementById('content');  // 右边那个 <div>
let searchBox = document.getElementById('search');    // 顶部的搜索框
let catsBox = document.getElementById('cats');        // 顶部那一行分类药丸

// ============================================================================
// 二、页面启动
//     这个函数在文件最下面被调用了一次（start();），也就是"打开页面就跑"。
// ============================================================================

function start() {
  // localStorage.getItem(KEY) 是"按名字取东西"。
  // 注意：取到的是**字符串**（当初存进去的 JSON 文本）；如果这个名字从来没存过，会返回 null。
  let cache = localStorage.getItem(KEY);

  // 判断"是不是 null"要用 != null，不能写 ==""，
  // 因为空字符串 '' 和 null 不是一回事（虽然这里不会出现空字符串）。
  if (cache != null) {
    // 有缓存 —— 把 JSON 文本还原成数组。JSON.parse 就是 JSON.stringify 的逆操作。
    notes = JSON.parse(cache);

    // 排一下序，把左边列表和分类药丸画出来，然后 return（直接结束这个函数，不再往下走）。
    sortNotes();
    showCats();
    showList();
    return;
  }

  // 走到这里说明缓存是空的：要么是你第一次打开，要么是换了电脑/清了浏览器数据。
  // 那就去读磁盘上的文件。fetch 是"发一个请求把文件取过来"，
  // 它是**异步**的（要等一会儿），所以不能写 "let data = fetch(...)" 直接拿结果，
  // 而是用 .then(...) 告诉它："等你取回来了，再执行这里的代码"。
  fetch('data/notes.json')
    // 第一个 .then：请求成功了，res 是"响应对象"。res.json() 表示把响应体按 JSON 解析，
    // 它返回的还是"等待中的结果"，所以下面还要再来一个 .then 去接。
    .then(function (res) { return res.json(); })
    // 第二个 .then：这时候 data 才是真正的数组了。
    .then(function (data) {
      notes = data;      // 放进全局数组
      sortNotes();       // 按日期从新到旧排
      saveCache();       // 顺手存一份到浏览器缓存，下次打开就不用再读文件了
      showCats();        // 收集分类，画顶部的分类药丸
      showList();        // 画左边列表
    })
    // .catch 是"上面任何一步出错了就执行这里"。
    // 最常见的出错原因：直接双击 index.html 打开（file:// 协议），
    // 浏览器出于安全策略不允许 JS 读本地文件，fetch 会被拦下来。详见 README。
    .catch(function () {
      contentBox.innerHTML = '<p>读不到 data/notes.json。请用「启动知识库.bat」' +
        '打开本页面，而不是直接双击 index.html。</p>';
    });
}

// ============================================================================
// 三、刷新左边的归档列表
//     每次数据变了（新增/编辑/删除/搜索/切换分类/折叠），都调用这个函数重画一遍。
//     它一共做四步：筛选 -> 分组 -> 拼 HTML -> 塞进页面。
// ============================================================================

function showList() {
  // ---- 第 1 步：按搜索词和分类筛出"这次要显示的"记录 ----
  let shown = filterNotes();

  // ---- 第 2 步：把这些记录按"年-月"分组 ----
  // groups 的形状是： [ { key:'2026-07', name:'2026 年 7 月', items:[...] }, ... ]
  // 用数组而不是对象，是为了保证顺序 —— 数组的顺序就是我们 push 进去的顺序，
  // 而对象的属性顺序在初学者看来不好掌握，所以这里不用对象。
  let groups = [];
  for (let i = 0; i < shown.length; i++) {
    let n = shown[i];
    let key = getMonthKey(n.date);         // 例如 '2026-07'
    let name = getMonthName(n.date);       // 例如 '2026 年 7 月'

    // 先在这一堆组里找找"有没有已经建好的 2026-07 组"
    let group = null;
    for (let j = 0; j < groups.length; j++) {
      if (groups[j].key == key) {
        group = groups[j];
      }
    }

    // 没找到就新建一个组，然后放进 groups 里
    if (group == null) {
      group = { key: key, name: name, items: [] };
      groups.push(group);
    }

    // 把这天记录放进这个月
    group.items.push(n);
  }

  // ---- 第 3 步：拼 HTML 字符串 ----
  let html = '';

  if (shown.length == 0) {
    // 数据是空的，或者搜索没搜到东西 —— 两种情况的提示不一样
    if (notes.length == 0) {
      html = '<li class="empty">还没有记录，点上面的【＋ 新增】</li>';
    } else {
      html = '<li class="empty">没有匹配的记录，换个关键词或点【全部】试试</li>';
    }
  }

  for (let i = 0; i < groups.length; i++) {
    let g = groups[i];

    // 这个月现在是不是收起来的？要点：搜索和筛选时一律展开，
    // 不然搜到了东西却看不见，会以为搜坏了。
    let isCollapsed = false;
    if (keyword == '' && currentCat == '' && collapsed[g.key] == true) {
      isCollapsed = true;
    }

    // 收起来时显示 ▶，展开时显示 ▼
    let arrow = isCollapsed ? '▶' : '▼';

    // 月份标题那一行。
    // onclick 里传的是 '2026-07' 这样的字符串，所以要用单引号包起来，
    // 拼进双引号的 onclick="..." 里刚好不冲突。
    html += '<li class="group">';
    html += '<div class="group-head" onclick="toggleMonth(\'' + g.key + '\')">' +
              '<b>' + arrow + '</b> ' + g.name +
              ' <span class="group-count">· ' + g.items.length + ' 条</span>' +
            '</div>';

    // 如果是收起来的，就给装笔记的那个盒子加上 collapsed 这个 class，
    // 样式里写了 .collapsed { display:none }，于是整块就不显示了。
    let boxClass = 'group-items';
    if (isCollapsed) {
      boxClass = boxClass + ' collapsed';
    }
    html += '<div class="' + boxClass + '">';

    // 这个月里的每一条笔记
    for (let j = 0; j < g.items.length; j++) {
      let n = g.items[j];

      // 当前正在看的那一条，加一个 active 的 class（左边会有一条蓝线）
      let itemClass = 'note';
      if (isCurrent(n)) {
        itemClass = itemClass + ' active';
      }

      // onclick 传的是 **id**，不是下标 —— 这样哪怕列表被筛过、被分组过也不会点错。
      html += '<li class="' + itemClass + '" onclick="showNote(' + n.id + ')">';
      html += '<b class="day">' + getDayText(n.date) + '</b>';        // 只显示"日"，前面有月份标题了
      html += highlight(n.title);                                     // 标题（命中的关键词标黄）
      html += ' <span class="cat-tag">' + escapeHtml(n.category) + '</span>';
      html += '</li>';
    }

    html += '</div>';   // 结束 group-items
    html += '</li>';    // 结束 group
  }

  // ---- 第 4 步：交给浏览器去解析成真正的元素，替换掉原来的内容 ----
  listBox.innerHTML = html;

  // 顺手更新一下最右边那句"共几条 / 筛出几条"，让你知道筛选有没有生效
  updateTips(shown.length);
}

// ============================================================================
// 四、在右边显示某一条记录的正文
//     id 是这条记录的编号（由上面 onclick 传进来）
// ============================================================================

function showNote(id) {
  // 按 id 在数组里找它是第几个。找不到会返回 -1。
  let index = findIndexById(id);
  if (index < 0) {
    // 理论上不会走到这里（除非数据被别的地方改了），加一层保险总没错
    contentBox.innerHTML = '<p>这条记录已经不存在了，可能刚被删掉。</p>';
    return;
  }

  currentId = id;            // 记下来"现在正在看哪一条"，编辑和删除都要用它
  let n = notes[index];      // 取出这条记录

  let html = '';
  // ---- 上半部分：一条操作栏，放分类、日期和两个按钮 ----
  html += '<div class="bar">';
  html += '<span>' + escapeHtml(n.category) + '</span>';
  html += '<span>' + n.date + '</span>';
  html += '<span class="grow"></span>';   // 一个空的占位元素，靠 CSS 的 flex:1 把后面两个按钮挤到最右边
  html += '<button onclick="editNote()">编辑</button>';
  html += '<button onclick="deleteNote()">删除</button>';
  html += '</div>';

  // ---- 中间：大标题 ----
  html += '<h1>' + escapeHtml(n.title) + '</h1>';

  // ---- 下面：正文。marked.parse() 把 Markdown 文本转成 HTML 字符串。
  // 比如 '# 你好' 会被转成 '<h1>你好</h1>'，'**粗体**' 会变成 '<strong>粗体</strong>'。
  // 转出来的 HTML 直接塞进页面，表格、代码块、列表就都有了。
  html += '<div class="md">' + marked.parse(n.content) + '</div>';

  contentBox.innerHTML = html;

  // 左边列表里也要把"当前这条"高亮出来，所以重画一次列表
  showList();
}

// ============================================================================
// 五、新增：连续用 prompt() 问四个问题
//     prompt(提示文字, 默认值) 会弹出一个输入框：
//       · 你输入内容点确定  -> 返回你输入的字符串
//       · 你点取消          -> 返回 null
//     所以每一步都要判断"是不是 null"或者"是不是空字符串"，是的话就放弃整个新增。
// ============================================================================

function addNote() {
  // 第 1 问：日期。默认值给今天，直接回车就行。
  let date = prompt('请输入日期，例如 2026-07-10', today());
  if (date == null || date == '') return;   // return 在这里的作用是"立刻结束函数"

  // 第 2 问：标题
  let title = prompt('请输入标题');
  if (title == null || title == '') return;

  // 第 3 问：分类。默认值给 "Java"，也可以自己改成 C语言 / 数据结构 / 算法 / 高数 ……
  let category = prompt('请输入分类，例如 C语言 / 数据结构 / Java / 算法', 'Java');
  if (category == null || category == '') return;

  // 第 4 问：正文。用 Markdown 写，# 是标题，``` 是代码块。
  let content = prompt('请输入正文（Markdown 格式）');
  if (content == null || content == '') return;

  // 四样都拿到了，组装成一条记录。
  // Date.now() 返回"当前时间距离 1970 年的毫秒数"，是一个很大的整数，
  // 用它当编号，几乎不可能重复。
  let note = {
    id: Date.now(),
    date: date,
    title: title,
    category: category,
    content: content
  };

  notes.push(note);    // push：把这条记录追加到数组末尾
  sortNotes();         // 按日期从新到旧重新排一下（新写的排到最前面）

  // 新增之后要把搜索清掉，否则刚写的东西可能被筛没了，看着像"没存上"
  keyword = '';
  currentCat = '';
  searchBox.value = '';

  saveCache();         // 存进浏览器缓存，这样刷新也不会丢
  showCats();          // 如果写了新的分类名字，药丸要多一颗
  showList();          // 重画左边列表

  // 最后把刚新增的这条显示出来。因为用的是 id，不用担心排序后下标变了。
  showNote(note.id);
}

// ============================================================================
// 六、编辑：用 prompt() 改标题和正文
// ============================================================================

function editNote() {
  // 如果还没点过左边的记录，就不知道要改哪条，提醒一下
  if (currentId < 0) { alert('请先在左边点一条记录'); return; }

  let index = findIndexById(currentId);
  if (index < 0) { alert('这条记录已经不存在了'); return; }

  let n = notes[index];   // 取出正在看的那条

  // prompt 的第二个参数是"输入框里的默认内容"，填上原来的标题，改起来方便
  let title = prompt('修改标题', n.title);
  if (title == null || title == '') return;

  let content = prompt('修改正文', n.content);
  if (content == null || content == '') return;

  // 直接把数组里这个对象的字段改掉。
  // 这一步没有"新建对象"，改的就是原对象，所以数组内容立刻就变了。
  n.title = title;
  n.content = content;

  saveCache();              // 存缓存
  showList();               // 左边标题可能变了，重画
  showNote(currentId);      // 右边重画，就能看到改完的样子
}

// ============================================================================
// 七、删除：先 confirm() 问一句，再从数组里拿掉
// ============================================================================

function deleteNote() {
  if (currentId < 0) { alert('请先在左边点一条记录'); return; }

  // confirm() 弹出"确定/取消"两个按钮：点确定返回 true，点取消返回 false。
  // 前面加 ! 表示"如果不是确定，就直接结束"。
  if (!confirm('确定删除吗？')) return;

  let index = findIndexById(currentId);
  if (index < 0) { alert('这条记录已经不存在了'); return; }

  // splice(从哪里开始, 删几个)：从 index 这个位置开始，删掉 1 个。
  // 删完之后，它后面的元素会自动往前补位，数组长度也自动减 1。
  notes.splice(index, 1);

  currentId = -1;      // 已经删掉了，"当前选中的"没有了，重置回 -1
  saveCache();
  showCats();          // 有可能某个分类最后一条被删了，药丸要少一颗
  showList();

  // 删完之后自动打开第一条，别让右边空着（还有记录的话）
  if (notes.length > 0) {
    showNote(notes[0].id);
  } else {
    contentBox.innerHTML = '<p>已删除，现在一条记录都没有了。点上面【＋ 新增】写第一条。</p>';
  }
}

// ============================================================================
// 八、搜索和分类筛选
// ============================================================================

// 搜索框每松开一次按键就执行一次（HTML 里写的 onkeyup）。
// event 是"事件对象"，浏览器自动传进来的，里面有这次按键的信息。
function searchNotes(event) {
  // 把输入框里的内容读出来，去掉首尾空格，再全部转成小写。
  // 转小写是为了让 "java" 和 "Java" 都能搜到（大小写不敏感）。
  keyword = searchBox.value.trim().toLowerCase();

  // 画列表时 highlight() 会用到 keyword，所以要先设好 keyword 再画
  showList();

  // 如果按的是回车，而且刚好有一条结果，就直接把它打开。
  // event.key == 'Enter' 判断"这次按的是不是回车键"。
  if (event != null && event.key == 'Enter') {
    let shown = filterNotes();
    if (shown.length > 0) {
      showNote(shown[0].id);
    }
  }
}

// 点分类药丸时执行。传进来的是"第几颗药丸"：
//   传 -1 表示点了【全部】，也就是取消分类筛选；
//   传 0、1、2…… 表示点了第几颗，去 cats 数组里把分类名取出来。
function selectCat(index) {
  if (index < 0) {
    currentCat = '';            // 空字符串 = 全部分类
  } else {
    currentCat = cats[index];
  }

  showCats();     // 重画药丸，让选中的那颗变蓝
  showList();     // 重画列表
}

// 点头部搜索框右边的 ✕ 时执行：清空关键词。
function clearSearch() {
  keyword = '';
  searchBox.value = '';
  showList();
}

// 按关键词 + 分类筛出这次要显示的记录，返回一个新数组。
// 注意：它不改 notes 本身，只是"挑出符合条件的那些"，所以不会影响你的数据。
function filterNotes() {
  let result = [];
  for (let i = 0; i < notes.length; i++) {
    let n = notes[i];

    // ---- 条件一：分类要对得上 ----
    // currentCat 是空字符串时表示"全部分类"，谁都能通过。
    if (currentCat != '' && n.category != currentCat) {
      continue;   // continue 的意思是"跳过这一轮，直接看下一条"
    }

    // ---- 条件二：关键词要在标题、分类或正文里出现过 ----
    if (keyword != '') {
      // 把三个字段拼成一大段文字，再转小写，然后看关键词在不在里面。
      // indexOf 返回关键词所在的位置，找不到会返回 -1，所以 != -1 就是"找到了"。
      let big = (n.title + ' ' + n.category + ' ' + n.content).toLowerCase();
      if (big.indexOf(keyword) == -1) {
        continue;
      }
    }

    // 两个条件都过了，就留下它
    result.push(n);
  }
  return result;
}

// 收集数据里出现过的所有分类，并画成顶部那一排药丸。
// 数据一变（新增/删除/改分类）就调用一次，保证药丸列表和实际数据一致。
function collectCats() {
  let list = [];
  for (let i = 0; i < notes.length; i++) {
    let c = notes[i].category;

    // 看看这个分类是不是已经收过了
    let found = false;
    for (let j = 0; j < list.length; j++) {
      if (list[j] == c) {
        found = true;
      }
    }

    // 没收到过才放进去，这样就不会重复
    if (found == false) {
      list.push(c);
    }
  }
  cats = list;
}

// 把分类药丸画到页面上
function showCats() {
  collectCats();

  // 第一颗永远是"全部"，点它等于取消分类筛选。
  // 当前选中的那颗加 cat-active 这个 class（蓝底），没选中的是 cat。
  let html = '分类：';
  if (currentCat == '') {
    html += '<span class="cat-active" onclick="selectCat(-1)">全部</span>';
  } else {
    html += '<span class="cat" onclick="selectCat(-1)">全部</span>';
  }

  // ⚠️ 注意这里传的是"第几颗药丸"（下标 i），不是分类名字本身。
  //    为什么不直接传名字？因为名字里万一有英文单引号，会把 onclick 的引号弄乱。
  //    传下标就绝对安全：传进去的一定是个数字，分类名让 selectCat 自己去数组里取。
  for (let i = 0; i < cats.length; i++) {
    if (cats[i] == currentCat) {
      html += '<span class="cat-active" onclick="selectCat(' + i + ')">' +
                escapeHtml(cats[i]) + '</span>';
    } else {
      html += '<span class="cat" onclick="selectCat(' + i + ')">' +
                escapeHtml(cats[i]) + '</span>';
    }
  }

  catsBox.innerHTML = html;
}

// 更新最右边那句"共几条 / 筛出几条"
function updateTips(count) {
  let tips = document.getElementById('tips');
  if (tips == null) {
    // 页面上还没有这句提示，就造一个加进分类条里
    tips = document.createElement('span');
    tips.id = 'tips';
    catsBox.appendChild(tips);
  }

  if (count == notes.length) {
    tips.innerHTML = '共 ' + notes.length + ' 条';
  } else {
    tips.innerHTML = '筛出 ' + count + ' 条 / 共 ' + notes.length + ' 条';
  }
}

// ============================================================================
// 九、保存数据：两个按钮，分别对应"写回文件"和"下载文件"
// ============================================================================

// 【💾 保存到文件】：直接把当前数据写回 data/notes.json。
// 它靠的是本地小服务器 tools/server.ps1 提供的一个接口 POST /api/save。
// 所以：只有用「启动知识库.bat」打开时才有用；
//       在 GitHub Pages 上（没有后端）会失败，那时就提示你用【下载数据】。
function saveToFile() {
  // fetch 的第二个参数是"这次请求怎么发"。这里是一个对象（一堆设置）：
  //   method  —— POST 表示"我要提交数据给你"，不是"我要取文件"
  //   headers —— 请求头，告诉服务器"我发的是 JSON 文本"
  //   body    —— 要发的正文，也就是把数组转成的 JSON 字符串
  fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notes, null, 2)
  })
    // 第一个 .then：拿到了响应对象，把它按 JSON 解析
    .then(function (res) { return res.json(); })
    // 第二个 .then：data 是服务器回给我们的结果，形如 {"ok":true,"count":3,"bytes":1234}
    .then(function (data) {
      if (data.ok) {
        alert('已保存到 data/notes.json，共 ' + data.count + ' 条。\n' +
              '（服务器还自动备份了上一版到 data/notes.json.bak）\n\n' +
              '别忘了 git add / commit / push，线上才是最新版。');
      } else {
        alert('保存失败：' + data.error + '\n\n' +
              '如果是在 GitHub Pages 上，点【⬇ 下载数据】再自己覆盖文件。');
      }
    })
    // 走到 .catch 最常见的两种情况：
    //   1) 没有本地服务器（比如线上，或者直接用 file:// 打开）—— 请求根本发不出去
    //   2) 服务器返回了错误状态码
    // 这两种情况下都自动退回"下载文件"这条路，不让你的改动卡在这里。
    .catch(function () {
      alert('连不上本地保存接口（多半是没通过「启动知识库.bat」打开）。\n\n' +
            '现在改成"下载数据"：浏览器会下载一个 notes.json，\n' +
            '把它复制到项目里的 data/ 目录覆盖原文件即可。');
      downloadData();
    });
}

// 【⬇ 下载数据】：把内存里的数组变成一个 notes.json 文件
// 这几行是"浏览器里造个文件让它下载"的标准套路，记住顺序就行。
function downloadData() {
  // 第 1 步：把数组转成 JSON 文本。
  //   第二个参数 null 表示"不做特殊替换"；
  //   第三个参数 2 表示"缩进 2 个空格"，这样生成的文件有换行有缩进，用记事本打开也能看懂。
  let text = JSON.stringify(notes, null, 2);

  // 第 2 步：把这段文本包成一个"二进制大对象"（Blob），并说明它是 JSON 类型
  let blob = new Blob([text], { type: 'application/json' });

  // 第 3 步：造一个不可见的 <a> 标签，让它指向这个 Blob，并给它起个文件名
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);   // 给 Blob 生成一个临时网址
  a.download = 'notes.json';            // 有 download 属性，浏览器就会"下载"而不是"打开"

  // 第 4 步：假装点一下这个链接，浏览器就开始下载了（这一步是真正触发下载的）
  a.click();

  // 第 5 步：临时网址用完就释放掉，避免一直占着内存
  URL.revokeObjectURL(a.href);

  alert('已下载 notes.json。把它复制到 data/ 目录覆盖原文件，' +
        '再 git add / commit / push，线上就是最新版了。');
}

// ============================================================================
// 十、折叠 / 展开某个月份
// ============================================================================

// 点月份标题时执行（HTML 里 onclick="toggleMonth('2026-07')"）。
// 逻辑很简单：现在是展开的就折叠，现在是折叠的就展开。
function toggleMonth(key) {
  if (collapsed[key] == true) {
    collapsed[key] = false;    // 原来折叠着 -> 改回展开
  } else {
    collapsed[key] = true;     // 原来展开着 -> 收起来
  }

  // 只重画列表就够了。注意 collapsed 不影响数据，纯属"看的时候怎么摆"，所以不用存缓存。
  showList();
}

// ============================================================================
// 十一、几个小工具函数
// ============================================================================

// 把整个数组存进浏览器缓存。
// localStorage 只能存字符串，所以必须先用 JSON.stringify 转成文本。
// 每次增删改之后都会调用它——这就是"刷新不丢数据"的全部秘密。
function saveCache() {
  localStorage.setItem(KEY, JSON.stringify(notes));
}

// 按日期从新到旧排序。
// sort 需要一个"比较函数"来告诉它谁前谁后：
//   返回负数 -> a 排前面；返回正数 -> b 排前面。
// 这里 a.date < b.date 说明 a 更早，那就返回 1（让 b 排前面），于是就成了"新的在前"。
// 日期写成 2026-07-10 这种格式有个好处：直接比字符串大小，结果和比日期是一样的。
function sortNotes() {
  notes.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
}

// 按 id 找这条记录在数组里是第几个，找不到返回 -1。
function findIndexById(id) {
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].id == id) {
      return i;
    }
  }
  return -1;
}

// 判断"这条是不是当前正在看的那条"，是就返回 true。
function isCurrent(n) {
  return n.id == currentId;
}

// 从日期 '2026-07-10' 里取出 '2026-07'，用来当分组的编号。
// 这里用了"字符串切片"：slice(0, 7) 表示"从第 0 个字符开始，取 7 个字符"。
// ⚠️ 前提是日期必须写成 2026-07-10 这种标准格式，位数固定才能这样切。
function getMonthKey(date) {
  return String(date).slice(0, 7);
}

// 从日期 '2026-07-10' 里取出 '07'（月份），返回数字 7。
function getMonthNum(date) {
  return Number(String(date).slice(5, 7));
}

// 从日期 '2026-07-10' 里取出 '10'（哪一天），用来在列表里显示。
function getDayText(date) {
  return String(date).slice(8, 10);
}

// 把 '2026-07-10' 变成给人看的 '2026 年 7 月'。
// 用的办法很朴素：把字符串按 '-' 切开成三段，再把月份前面的 0 去掉。
function getMonthName(date) {
  let parts = String(date).split('-');   // split('-') 把 '2026-07-10' 切成 ['2026','07','10']
  let year = parts[0];
  let month = Number(parts[1]);          // Number('07') 得到数字 7，前面的 0 就没了
  return year + ' 年 ' + month + ' 月';
}

// 把 & < > 这三个符号换成"实体"（&amp; &lt; &gt;）。
// 为什么必须做：如果标题是 "<script>" 这样的内容，直接塞进 HTML 会被浏览器当成标签，
// 轻则显示错乱，重则执行恶意代码。转义之后它就是一串普通文字了。
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 把文字里命中搜索词的部分套上 <mark> 标签，显示成黄底（样式里定义的）。
// 例：关键词是 java，标题是 'Java 基础' -> 返回 '<mark>Java</mark> 基础'
function highlight(text) {
  let safe = escapeHtml(text);      // 先转义，再找关键词，顺序不能反
  if (keyword == '') {
    return safe;                    // 没在搜索，原样返回
  }

  let lowerSafe = safe.toLowerCase();
  let lowerKey = keyword.toLowerCase();

  let result = '';
  let pos = 0;                      // 下一次从哪里开始接着找

  while (true) {
    // indexOf(要找的东西, 从第几个字符开始找)，找不到返回 -1
    let hit = lowerSafe.indexOf(lowerKey, pos);
    if (hit == -1) {
      break;                        // 后面没有了，跳出循环
    }

    // 把"命中位置之前"的一段原样接上
    result = result + safe.slice(pos, hit);
    // 再把命中的那几个字用 <mark> 包起来（从原来大小写正确的 safe 里取，别用小写的）
    result = result + '<mark>' + safe.slice(hit, hit + keyword.length) + '</mark>';

    // 下次从命中部分的后面继续找
    pos = hit + keyword.length;
  }

  // 把最后剩下的一段接上
  result = result + safe.slice(pos);
  return result;
}

// 算出今天的日期，格式 2026-07-10，用作新增时的默认值。
// 注意 getMonth() 返回 0~11（0 表示一月），所以要 +1；
// 月和日小于 10 时要补一个 0，保证格式整齐（也保证排序和分组切片的正确）。
function today() {
  let d = new Date();
  let m = d.getMonth() + 1;
  let day = d.getDate();
  if (m < 10) m = '0' + m;
  if (day < 10) day = '0' + day;
  return d.getFullYear() + '-' + m + '-' + day;
}

// ============================================================================
// 启动！文件从上往下执行到这里时，就叫一次 start()，页面就活了。
// ============================================================================
start();

/* ============================================================================
 * 附：调试小技巧（不用改代码，按 F12 打开浏览器控制台就能试）
 * ============================================================================
 *
 *   notes                            查看内存里的全部数据
 *   notes.length                     看有多少条
 *   keyword                          看当前搜索词是什么
 *   filterNotes().length             看当前筛出来几条
 *   localStorage.getItem('notes')    看浏览器缓存里存的是什么
 *   localStorage.removeItem('notes') 清掉缓存，再刷新页面就会重新去读 notes.json
 *                                    （想用文件里的内容覆盖浏览器时，就用这一句）
 *
 * 常见现象的原因：
 *   · 刷新后改动没了        -> 不可能，代码里每次改动都存了缓存；除非你用的是无痕窗口
 *   · 页面上什么都没有      -> 多半是直接双击 index.html 打开的，改用 启动知识库.bat
 *   · 搜不到明明有的内容    -> 关键词是按"包含"匹配的，别写整句；也可能是分类筛选还开着
 *   · 点了保存说连不上      -> 没通过 启动知识库.bat 打开，或者线上版本（没后端）
 *   · 想让代码块有颜色      -> 需要再引入 highlight.js，会打破"只有一个第三方库"的约定
 * ========================================================================== */
