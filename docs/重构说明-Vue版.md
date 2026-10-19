# 博客模块化重构说明

> 位置：`F:\myusb\JavaBlog\tools\blog-vue\`
> **原博客一个字都没动**，这是并排新建的对照版。
> 你说的是"源码太长" → 所以这次做的是**拆模块**，没有引入 Maven（原因见文末）。

---

## 一、怎么打开

```
双击 tools\blog-vue\启动.bat
```

浏览器打开 **http://127.0.0.1:8099/**

> 端口 8099，和你原来的 8080 不冲突，**两个版本可以同时开着对照**。

---

## 二、重构前后对比

### 2.1 文件结构

**重构前**（3 个文件，两个巨大）：

```
JavaBlog\
├── index.html          325 行（含 200+ 行 <style>，结构+样式混在一起）
├── js\app.js           887 行 / 452 行代码 / 30 个函数
└── data\notes.json
```

**重构后**（按职责分成 6 块）：

```
tools\blog-vue\
├── index.html                    156 行  只写结构（不再有 <style>）
├── css\
│   └── style.css                 244 行  全部样式，配色集中成 CSS 变量
├── js\
│   ├── vendor\                           第三方库（本地文件，离线可用）
│   │   ├── vue.esm-browser.prod.js       Vue 3.5.44（ESM 版）
│   │   └── marked.esm.js                 Markdown 渲染
│   ├── utils.js                   75 行  转义 + 高亮
│   ├── dates.js                   70 行  日期格式化
│   ├── data.js                   174 行  数据层：筛选/排序/分组
│   ├── storage.js                113 行  缓存 + 文件读写
│   ├── app.js                    345 行  Vue 应用定义（不挂载）
│   └── main.js                    22 行  挂载入口（就 1 行业务代码）
├── test\
│   ├── jsdom-setup.mjs           122 行  假浏览器环境（jsdom）
│   ├── data.test.mjs             164 行  纯函数测试（51 项）
│   └── app.test.mjs              383 行  Vue 交互测试（58 项）
├── package.json                          npm test 脚本 + jsdom 依赖
├── data\notes.json                       数据副本（47 条）
├── server.ps1 / 启动.bat                 本地服务器（端口 8099）
└── README-重构说明.md                     本文件
```

### 2.2 代码规模

| 文件 | 总行数 | 代码行 | 职责 |
|---|---|---|---|
| `js/utils.js` | 75 | **38** | 转义、高亮 |
| `js/dates.js` | 70 | **52** | 日期格式化 |
| `js/data.js` | 174 | **101** | 筛选/排序/分组（纯数据） |
| `js/storage.js` | 113 | **70** | 缓存、文件读写 |
| `js/app.js` | 345 | **213** | Vue 应用定义 |
| `js/main.js` | 22 | **15** | 挂载入口 |
| `index.html` | 156 | **123** | 结构 |
| `css/style.css` | 244 | **205** | 样式 |
| **业务代码合计** | | **817** | |
| `test/*.mjs`（3 个文件） | 669 | **493** | 测试（不算业务代码） |

**⚠️ 注意一个反直觉的地方：业务代码总量没有变少（817 行 vs 原来 677 行）。**

三个原因：
1. **注释写得更密了** —— 每个模块顶部都有"这个模块负责什么"
2. **表单替代 `prompt()` 是净增代码** —— 原来一行 `prompt()`，现在要写完整表单
3. **`app.js` 从 452 行降到 213 行**，但多出来的是新加的 `main.js`、测试和注释

**所以这次重构的收益不是"变短"，而是"分块 + 可测"** ——
`app.js` 单文件从 **452 行代码降到 213 行**，这才是你打开文件时的实际感受。

---

## 三、真正的收益：每个文件都能一眼看懂

### 3.1 最大的改变：**`app.js` 从 452 行代码降到 213 行**

原来打开 `app.js` 要面对 887 行（452 行代码）、30 个函数、混在一起的四种职责。
现在 345 行（213 行代码），而且里面**只剩 Vue 相关的部分**。

每个文件都很小，打开就知道它在干什么：

| 文件 | 打开后你会看到 |
|---|---|
| `utils.js` | 只有两个函数，而且注释讲清了"为什么必须先转义再高亮" |
| `dates.js` | 六个日期函数，注释讲清"为什么用 slice 而不是 new Date" |
| `data.js` | 七个纯数据函数，**完全不碰页面** |
| `storage.js` | 缓存和文件读写，注释讲了 localStorage 容量限制、`?ts=` 反缓存 |
| `app.js` | 只有 Vue 相关的部分：数据、computed、方法（**不挂载**） |
| `main.js` | 3 行挂载入口 |
| `index.html` | 只有结构，看不到一行样式 |
| `css/style.css` | 只有样式，而且配色集中在 `:root` 变量里 |

### 3.2 消失的 8 个函数（原版 153 行）

`showList`(62行) / `showNote`(21) / `showCats`(19) / `collectCats`(16) /
`updateTips`(13) / `selectCat`(9) / `toggleMonth`(8) / `clearSearch`(5)

它们的唯一职责是"把数据搬到页面上"，现在交给 Vue 模板了。

### 3.3 消除的 5 类 bug

| 原版隐患 | 重构后 |
|---|---|
| `getElementById` id 拼错 → 静默 null | 不需要 getElementById |
| 元素被 `innerHTML` 重建 → 缓存引用成孤儿 | 不存在引用问题 |
| 改了数据忘了调 `showList()` | 改数据自动更新 |
| 每处都得记得 `escapeHtml()` | `{{ }}` 自动转义 |
| 状态不同步（currentCat 变了药丸没重画） | 状态与视图天然同步 |

---

## 四、测试：两份，共 109 项，全部通过

```bash
cd F:\myusb\JavaBlog\tools\blog-vue
node test/data.test.mjs     # 51 项：纯函数（筛选/排序/格式化/转义）
node test/app.test.mjs      # 58 项：Vue 交互（jsdom）
```

或者一次跑完：

```bash
npm test
```

**实测结果：**

| 测试文件 | 测什么 | 结果 |
|---|---|---|
| `test/data.test.mjs` | 纯函数逻辑 | **51 通过 / 0 失败** |
| `test/app.test.mjs` | Vue 交互（jsdom） | **58 通过 / 0 失败** |

### 4.1 纯函数测试（不需要浏览器）

```
--- utils.js（转义 + 高亮） ---
  PASS | escapeHtml 先转义 &（顺序正确）
  PASS | 高亮：先转义再插 mark（<b> 已转义）
--- data.js（数据层） ---
  PASS | filterNotes 关键词命中正文
  PASS | sortNotes 同日按 created 倒序
  PASS | pickNewer 文件更新时用文件
--- 边界情况 ---
  PASS | 空数组筛选不崩
  PASS | 缺字段的记录不崩
```

### 4.2 Vue 交互测试（jsdom 造的假浏览器）

```
--- 一、初始渲染 ---
  PASS | 列表渲染出 4 条笔记
  PASS | 月份分组渲染出 2 组
  PASS | 默认高亮"全部"
--- 二、搜索（v-model + 高亮）---
  PASS | v-model 同步到数据 | keyword = Java
  PASS | 命中处出现 <mark> 高亮 | 2 处
--- 三、分类筛选（事件 + :class）---
  PASS | Java 药丸变成高亮
  PASS | "全部"不再高亮
--- 四、折叠/展开 ---
  PASS | 搜索时强制展开
  PASS | 清空搜索后恢复折叠
--- 五、查看详情（v-if + v-html）---
  PASS | Markdown 渲染成 HTML（v-html） | 含 <h1>
  PASS | Markdown 加粗渲染 | 含 <strong>
--- 六、新增笔记（表单替代 prompt）---
  PASS | 空标题被拦下并提示 | 标题不能为空
  PASS | 笔记数量 +1 | 5 条
  PASS | 新分类出现在药丸里 | 测试分类
--- 七、编辑笔记 ---
  PASS | 表单预填了原标题
  PASS | 编辑后标题已更新
  PASS | 点取消关闭表单
--- 八、删除笔记 ---
  PASS | 删除后数量 -1 | 5 → 4
  PASS | confirm 返回 false 时不删除 | 4 条不变
--- 九、加载失败与边界 ---
  PASS | 取数失败时不崩
  PASS | 取数失败显示错误提示（无缓存时）
```

### 4.3 怎么做到"在 node 里跑 Vue"

Vue 是给浏览器用的，node 里没有 `document`。解决办法是 **jsdom**：
它用纯 JS 实现了一套浏览器 DOM，挂到 node 的全局对象上，
Vue 就以为自己在一个真浏览器里。

见 `test/jsdom-setup.mjs`，它做三件事：

```js
// 1) 造 jsdom，把 window/document/SVGElement… 挂到 globalThis
// 2) navigator 在 node 21+ 是只读 getter，必须用 defineProperty 覆盖
// 3) 提供 requestAnimationFrame（Vue 的 nextTick 会用）
```

⚠️ **一个必须记住的顺序**：造环境 → 再 import Vue。
因为 Vue 的 ESM 构建在**加载的那一刻**就会去摸这些全局对象。

### 4.4 为了能测，专门做的一次改造

原来 `app.js` 最后一句是 `.mount('#app')` —— 意味着"一 import 就会去挂载"，
测试根本没法插手。现在拆成两半：

| 文件 | 职责 |
|---|---|
| `js/app.js` | 只**定义**应用：`export function createBlogApp(options)`，**不挂载** |
| `js/main.js` | 只**挂载**：3 行，`createBlogApp().mount('#app')` |

这样：
- **生产**：`main.js` 挂到真实页面
- **测试**：挂到 jsdom 的假页面，并用假的 fetch 喂数据（不联网、不启服务器）

这就是"把副作用隔离到入口"的写法，也是 Vue/React 项目里
`main.js` 和 `App.vue` 分开的常见原因。

---

## 五、顺便学到的三个新知识点

### 5.1 ES 模块（import / export）

现在每个 js 文件是一个**独立模块**：

```js
// data.js 导出
export function filterNotes(notes, keyword, category) { ... }

// app.js 导入
import { filterNotes } from './data.js';
```

好处：
- **不再有全局变量污染**（原版十几个全局变量，谁都能改）
- **依赖关系写明了**（看 import 就知道这个文件用了谁）
- 浏览器原生支持，**不需要 webpack/vite 打包**

⚠️ 但有个限制：**ESM 必须通过 http 打开**，不能双击 html（`file://` 下模块会被 CORS 拦）。
所以还是用 `启动.bat` 打开。

### 5.2 裸模块名 vs 相对路径（一个踩过的坑）

一开始我在 `app.js` 里写的是**裸模块名**，配合 `index.html` 里的 importmap：

```html
<!-- 早期写法（已弃用） -->
<script type="importmap">
{ "imports": { "vue": "./js/vendor/vue.esm-browser.prod.js" } }
</script>
```

```js
import { createApp } from 'vue';   // 靠 importmap 解析
```

**这个写法在浏览器里没问题，但跑测试时直接失败**：

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vue'
```

原因是：**importmap 只有浏览器认，node 不认**。
node 解析裸模块名只会去找 `node_modules`，找不到就报错。

**最终改成相对路径**，两边都原生支持、少一层间接：

```js
import { createApp } from './vendor/vue.esm-browser.prod.js';
```

**这个坑值得记住**：所有"只在浏览器生效的约定"（importmap、
`file://`、某些全局对象）在 node 里都是不存在的。
**想让同一份代码既能跑在浏览器又能跑在测试里，就尽量用两边都支持的标准写法。**

### 5.3 CSS 变量（配色集中管理）

原版的 `#0d1117` 散落在各处，改配色要搜好几遍。现在：

```css
:root {
  --bg: #0d1117;
  --accent: #58a6ff;
  /* ... */
}
body { background: var(--bg); }
```

**想换主题只改 `:root` 那几行。**

---

## 六、为什么没有用 Maven

你最初说"用 Maven 的标准格式"，这里必须说清楚：

**Maven 是 Java 的构建工具，你的博客是纯前端，没有一行 Java 可编译。**

如果把前端塞进 Maven 结构，会得到：

```
src/main/java/       ← 空的，没东西可编译
src/main/resources/  ← 放前端文件
pom.xml              ← 声明要编译 Java，但没有 Java
```

执行 `mvn package` 只会打出一个**空 jar**，因为 `src/main/java` 里没有代码。

**Maven 真正适用的形态**是加一个 Java 后端（就像 `F:\myusb\JavaWeb\blog-demo` 那样）：

```
blog-demo/
├── pom.xml                          ← Maven 管依赖和构建
└── src/main/
    ├── java/com/itheima/blog/       ← Java 后端接口
    └── resources/static/            ← 前端页面
```

**所以这次的思路是**：先把前端拆成清晰的模块（这次做的），
等你学完 JDBC / MyBatis，如果需要后端，再把它放进 Maven 工程也不迟
—— 那时候前端部分直接搬到 `src/main/resources/static/` 就行。

---

## 七、和你原博客的关系

| | 原博客 | 模块化版 |
|---|---|---|
| 入口 | `F:\myusb\JavaBlog\index.html` | `tools\blog-vue\index.html` |
| 端口 | 8080（`启动知识库.bat`） | 8099（`启动.bat`） |
| 数据 | `F:\myusb\JavaBlog\data\notes.json` | 自己的副本 |
| 依赖 | 无（marked.js 手放） | Vue 3.5.44 + marked 15 + jsdom（仅测试） |
| 测试 | 无 | 109 项（51 + 58） |
| Git 跟踪 | **是**（你的正式仓库） | **否**（`tools/` 未纳入 git） |
| 状态 | **你在用，不能动** | 对照学习用 |

> ⚠️ 注意 `tools/` 目录**没有被 git 跟踪**（`git status` 里显示为 `?? tools/`）。
> 所以你改动模块化版**不会影响原博客的提交历史**。

**⚠️ 两边数据是分开的。** 模块化版读写自己的 `notes.json`，不会碰你的原数据。

**建议**：先并排对照用一段时间，别急着替换。
你可以两边同时打开同一个功能对比 —— 比如搜索时看两边的请求和渲染。

---

## 八、U 盘上也有了一份

已经同步到你的 U 盘（`D:`），位置：

```
F:\myusb\blog-vue\
```

**同步校验结果：**

| 检查项 | 结果 |
|---|---|
| 文件数 | 1438（源 1438，**缺失 0**） |
| 源码逐字节校验（SHA256，不含 node_modules） | **0 处不一致** |
| 体积 | 11.49 MB |
| 在 U 盘上跑测试 | **51 + 58 = 109 项全过** |
| 从 U 盘启动服务器 | ✅ 全部资源 HTTP 200 |

### 8.1 怎么在 U 盘上用

```
双击 F:\myusb\blog-vue\启动.bat     → http://127.0.0.1:8099/
```

在 U 盘目录下跑测试：

```bash
cd F:\myusb\blog-vue
node test\data.test.mjs
node test\app.test.mjs
```

### 8.2 ⚠️ 一个前提：需要 node

U 盘版**带了 `node_modules`（10.9 MB）**，所以插到任何一台装了 node 的电脑上都能直接
跑测试、开页面，**不需要联网装依赖**。

但如果没有 node：

- **看页面** → 没问题。页面只用浏览器，双击 `启动.bat` 就行
  （`启动.bat` 用的是 Windows 自带的 PowerShell，不需要 node）
- **跑测试** → 需要先装 node，或者在有 node 的机器上跑

### 8.3 如果改了源码，记得重新同步

U 盘那份是**拷贝**，不是链接。改了 `F:\myusb\JavaBlog\tools\blog-vue\` 里的文件，
要重新同步一次才生效：

```powershell
robocopy "F:\myusb\JavaBlog\tools\blog-vue" "F:\myusb\blog-vue" /E /NFL /NDL /NJH /NJS /NP
```

> `/E` 连子目录一起同步。U 盘写入速度慢（约 10MB/分钟），这次 11.49 MB 用了约 4 分钟。

---

## 九、模块依赖关系图

```
        index.html
            │ type="module"
            ▼
        js/main.js        ← 只负责挂载
            │
            ▼
        js/app.js  ──────────────┐
            │                    │
     ┌──────┼──────┬──────┐      │
     ▼      ▼      ▼      ▼      │
 utils.js dates.js data.js storage.js
     │              │
     └──────────────┘
       data.js 内部用 dates.js 的
       getMonthKey / getMonthName
```

**每个箭头都是 `import`**，一眼能看出谁依赖谁。
原版是十几个全局变量到处传，看不出依赖关系。

**注意 `main.js` 只有它引 `app.js`，`app.js` 不引 `main.js`** ——
依赖是单向的。这样测试引 `app.js` 时不会连带触发挂载。

---

## 十、下一步可以做的

| 想法 | 说明 |
|---|---|
| 补更多测试 | 现在 109 项；可以再加表单校验的边界用例、Markdown 渲染的用例 |
| 真正替换原版 | 建议先对照用一段时间，替换前 `git commit` |
| 引入构建工具 | 等模块多了、需要打包压缩时再考虑 Vite（现在不需要，浏览器原生支持 ESM） |
| 加 Java 后端 | 等学完 JDBC/MyBatis，把 `js/` + `css/` + `index.html` 放进 `src/main/resources/static/` |

---

## 附：本次重构的完整改动清单

| 动作 | 内容 |
|---|---|
| **新建** | `js/utils.js` `js/dates.js` `js/data.js` `js/storage.js` `js/main.js` `css/style.css` |
| **拆分** | 原 `app.js`（887 行）→ 5 个模块 + 1 个入口；原 `index.html` 的 `<style>` → `css/style.css` |
| **改造** | `app.js` 从"自动挂载"改成"导出 `createBlogApp()`，由 `main.js` 挂载" |
| **删除的 8 个函数** | `showList` `showNote` `showCats` `collectCats` `updateTips` `selectCat` `toggleMonth` `clearSearch` |
| **新增依赖** | jsdom（仅测试用，`devDependencies`） |
| **新增测试** | `test/jsdom-setup.mjs` `test/data.test.mjs` `test/app.test.mjs`（共 109 项） |
| **新建文档** | `README-重构说明.md`（本文件） |
| **原博客** | **一个字没动** |
