# 前后端数据沟通全链路：用户注册案例

## 阶段〇：全景速览（先建立全局认知）

### 0.1 一句话主线

用户在前端点「注册」→ 浏览器把数据打成 HTTP 请求发出去 → 内嵌 Tomcat 收到 → SpringMVC 按路由找到 Controller → Controller 调 Service 做业务 → Service 调 Mapper → MyBatis 生成 SQL 交给连接池执行 → MySQL 落库 → 结果原路返回 → 前端拿到 JSON 渲染提示

### 0.2 六段式时间轴（严格按此顺序）

#### 阶段一：前端采集与发送

前端：HTML 表单 → v-model 双向绑定 → 校验 → @click 触发 → 组装 JS 对象 → axios.post → await 挂起等待

#### 阶段二：网络传输

网络：TCP 建连 → HTTP 请求报文（请求行 + 请求头 + 空行 + 请求体）→ 到达服务器端口

#### 阶段三：后端接收与参数解析

后端：内嵌 Tomcat 监听 → DispatcherServlet 拦截 → HandlerMapping 查路由 → @PostMapping 命中 → @RequestBody 反序列化

#### 阶段四：业务处理与依赖注入

业务：@Autowired 拿到 Service Bean → @Service 里的业务校验 → 调 Mapper

#### 阶段五：数据持久化

持久层：@Mapper 动态代理 → #{} 预编译 → HikariCP 借连接 → INSERT → 返回受影响行数 → 归还连接

#### 阶段六：响应返回

响应：封装 Result → Jackson 转 JSON → 200 状态码 → Tomcat 发回 → 前端 await 恢复 → 判断 code → 提示/跳转

### 0.3 四个角色与各自的语言

#### 浏览器（前端）

只懂 JS 对象、JSON、HTTP；不关心数据库长什么样

#### Tomcat（容器）

只懂 TCP 连接、HTTP 报文；不关心业务

#### Spring（框架）

负责路由、参数转换、对象创建、依赖注入；把杂乱的基础工作收走

#### MySQL（数据库）

只懂 SQL；不关心是谁在问、为什么要问

### 0.4 一次注册请求的耗时分层（体感）

#### 前端处理

输入、校验、序列化：约 1ms 以内，肉眼无感

#### 网络往返

本机 loopback 约 1~3ms；公网 20~200ms

#### 后端处理

路由 + 业务 + SQL 解析：约 5~30ms

#### 数据库写入

INSERT + 索引更新 + 事务提交：约 1~10ms

#### 渲染反馈

弹提示、跳转：约 1ms

## 阶段一：前端数据采集与发送（HTML + Vue + Axios）

### 1.1 HTML 表单：先把「容器」搭好

#### 知识点：HTML 表单元素

form 标签负责把一组输入框聚合成一次「提交」；input 负责采集单个字段

#### 详细过程

页面里先写好结构：一个用户名输入框、一个密码输入框、一个注册按钮

#### 关键细节

type="text" 是明文；type="password" 输入时显示圆点但值仍是明文，加密必须靠后端

#### 关键细节

input 必须绑定一个「归宿」——在 Vue 里就是 data 中的字段，否则输入的值抓不到

#### 常见坑

input 忘了写 v-model，用户输入了但 form.username 一直是空字符串

### 1.2 Vue 的 v-model：把输入框和 data 焊在一起

#### 知识点：v-model 双向绑定

它是语法糖，等价于 :value + @input 的合体

#### 拆开看本质

一是「数据 → 视图」：data 变了，输入框的值跟着变

#### 拆开看本质

二是「视图 → 数据」：用户敲键盘触发 input 事件，Vue 自动把新值写回 data

#### 详细过程

写 v-model="form.username"，用户每敲一个字符，form.username 立刻同步更新，不需要手动读 DOM

#### 为什么不用 document.getElementById

手动取 DOM 要自己监听事件、自己赋值、还得处理中文输入法组合态；v-model 全部替你做了

#### 常见坑

v-model 绑定到一个未在 data 里声明的字段，Vue3 下会不响应（要先声明）

### 1.3 前端校验：能在这里拦住的就不要发网络请求

#### 知识点：表单校验

校验越靠前越省钱——前端拦住一次，就省一次网络往返 + 一次后端处理 + 一次数据库查询

#### 详细过程

点注册前先判断：用户名非空、长度 3~20、密码长度不少于 6 位；不通过就直接提示，不发请求

#### 关键细节

前端校验只提升体验，不能当安全防线——用户可以绕过前端直接调接口，所以后端必须再校验一遍

#### 对应到本项目

知识库后端的 Service 层就写了「标题不能为空 / 分类不能为空 / 正文不能为空」的校验，和前端校验是两道关卡

### 1.4 @click 事件：真正的触发点

#### 知识点：Vue 事件绑定 @click

v-on:click 的简写，把「点击」这个 DOM 事件绑到 methods 里的一个方法上

#### 详细过程

给注册按钮写 @click="register"，点击时调用 register() 方法

#### 为什么触发的是方法而不是直接发请求

把「事件」和「请求」拆开，好处是方法里可以先校验、可以置 loading、可以防重复提交

#### 关键细节

若用 form 原生提交，要写 @submit.prevent，否则浏览器会刷新整页，Ajax 白写

#### 常见坑

按钮写在 form 里但没写 type="button"，点一下触发表单默认提交，页面闪一下刷新

#### 常见坑

防重复提交：点完没禁用按钮，用户连点三次就注册了三条记录

### 1.5 组装参数：JS 对象是这一层的通用货币

#### 知识点：JS 对象 / 字面量

前端发出去的不是「两个变量」，而是一个结构化的对象

#### 详细过程

方法里组装 const data = { username: form.username, password: form.password }

#### 关键细节

字段名必须和后端 Java 实体类的属性名一致——这是前后端唯一的「口头约定」，对不上后端收到 null

#### 关键细节

不要直接把 form 整个发过去，可能夹带无关字段（比如确认密码），后端要么忽略要么报错

### 1.6 Axios 的 POST 请求：把对象变成网络报文

#### 知识点：axios.post

axios.post(url, data) 发一个 POST 请求

#### 详细过程

调用 axios.post('/api/users/register', data)，url 里的 /api 是后端统一前缀

#### 关键细节：Axios 自动做了两件事

一是把 JS 对象序列化成 JSON 字符串

#### 关键细节：Axios 自动做了两件事

二是自动设置请求头 Content-Type: application/json

#### 如果手写原生 fetch 会怎样

要自己 JSON.stringify、自己设 header，Axios 把这些默认行为都封好了

#### 常见坑

发给后端却报 415 Unsupported Media Type，多半是 Content-Type 没设成 application/json

#### 常见坑

路径写成相对路径时，基准是当前页面地址；页面地址变了就会 404，建议统一从配置里读 baseURL

### 1.7 async/await：等待但不卡死

#### 知识点：async/await 异步等待

await 让异步代码读起来像同步，但底层仍然是「先挂起、结果回来再继续」

#### 详细过程

register() 声明成 async，里面 const res = await axios.post(...)；执行到 await 时函数暂停，把控制权交回浏览器，页面仍可滚动、仍可点别的

#### 关键细节

await 挂起的是「当前 async 函数」，不是整个页面——所以不会像同步请求那样把界面冻住

#### 等价写法

不写 async/await 就用 axios.post(...).then(res => {...}).catch(err => {...})，本质上一样

#### 关键细节

必须用 try/catch 包住 await，否则网络错误会变成未捕获异常，提示框弹不出来

#### 常见坑

忘了写 await，拿到的是 Promise 对象而不是响应数据，后面 res.data 全是 undefined

### 1.8 JSON：前端与后端唯一都认的数据格式

#### 知识点：JSON 格式

一种纯文本的数据交换格式，键值对 + 数组，语言无关

#### 为什么不用 JS 对象直接发

网络只能传字节流；JSON 是文本，能安全穿过 HTTP 请求体

#### JSON 与 JS 对象的区别

JSON 的键必须用双引号；不能有注释；不能有 undefined；不能有函数

#### 详细过程

浏览器里 { username: "wuji", password: "123" } 是 JS 对象

#### 详细过程

发出后变成文本 {"username":"wuji","password":"123"} 这才是 JSON

#### 常见坑

后端返回的字段名和前端.js 里写的对不上（比如 note_date 与 noteDate），页面一片空白

## 阶段二：网络传输（HTTP 协议）

### 2.1 建立连接：先握手再说话

#### 知识点：TCP 三次握手

HTTP 建立在 TCP 之上；发请求前先建立可靠连接

#### 详细过程

客户端发 SYN → 服务端回 SYN+ACK → 客户端回 ACK，连接建立后才会发 HTTP 报文

#### 关键细节

本机访问 127.0.0.1 走 loopback，不经过网卡，所以几乎无延迟

#### 关键细节

HTTP/1.1 默认 keep-alive，连接可复用，不是每个请求都重新握手

### 2.2 HTTP 请求报文：三个部分一个空行

#### 知识点：请求行

格式是「方法 + 路径 + 协议版本」

#### 详细过程：请求行实例

POST /api/users/register HTTP/1.1

#### 知识点：请求头

一组「键: 值」，告诉服务器这次请求的元信息

#### 详细过程：请求头关键项

Host：目标主机和端口

#### 详细过程：请求头关键项

Content-Type: application/json：请求体是 JSON，这是后端能否用 @RequestBody 解析的关键

#### 详细过程：请求头关键项

Content-Length：请求体的字节长度

#### 详细过程：请求头关键项

Accept: application/json：希望返回 JSON

#### 详细过程：请求头关键项

User-Agent：浏览器身份

#### 详细过程：请求头关键项

Cookie：若已登录，会话信息在这里

#### 知识点：空行

请求头和请求体之间的分界线，一个空行，告诉服务器「头结束了」

#### 知识点：请求体

真正要传的业务数据，只在 POST/PUT 里有

#### 详细过程：请求体实例

{"username":"wuji","password":"123"}

#### 关键细节

请求头里能看出「是什么格式」，请求体里才是「内容」，两者配合才能正确解析

### 2.3 POST 与 GET 的区别：为什么注册必须用 POST

#### 知识点：参数位置不同

GET 把参数拼在 URL 的问号后面（query string）；POST 把参数放在请求体里

#### 知识点：语义不同

GET 用于「取」，应该是只读、可重复的；POST 用于「提交」，会改变服务器状态

#### 知识点：安全性不同

GET 参数暴露在 URL 里，会被浏览器历史、日志、代理服务器记录；POST 放在 body 里相对隐蔽

#### 关键细节

注意「相对隐蔽」不等于「安全」——POST 照样可以被抓包，真正安全要靠 HTTPS

#### 知识点：长度限制不同

GET 受 URL 长度限制（不同浏览器几千字符）；POST 理论上没有硬限制

#### 知识点：缓存与幂等不同

GET 可被缓存、可重复执行结果不变（幂等）；POST 一般不被缓存、重复执行会产生多条数据（非幂等）

#### 详细过程：对照表

注册用 POST：/api/users/register + body 里放 username/password

#### 详细过程：对照表

查询用户用 GET：/api/users?page=1&size=10

#### 常见坑

用 GET 传密码，密码直接出现在 URL 和访问日志里，属于低级安全事故

### 2.4 URL 的拆解：请求到底发到哪

#### 知识点：URL 结构

协议://主机:端口/路径?查询参数#锚点

#### 详细过程

http://127.0.0.1:8080/api/users/register

#### 逐段拆解

http：协议

#### 逐段拆解

127.0.0.1：主机（本机回环地址）

#### 逐段拆解

8080：端口，对应 SpringBoot 内嵌 Tomcat 的监听端口

#### 逐段拆解

/api/users/register：路径，SpringMVC 就是靠它查路由表的

#### 关键细节

端口不对会直接连接被拒（ERR_CONNECTION_REFUSED），根本不是 404——两者要分清

### 2.5 跨域与预检：本地开发的高频坑

#### 知识点：同源策略

浏览器的安全策略：协议 + 域名 + 端口三者完全相同才算同源，否则 Ajax 被拦

#### 知识点：CORS

服务端通过响应头 Access-Control-Allow-Origin 等声明「允许哪些来源访问」

#### 详细过程

若前端跑在 5173、后端在 8080，就是跨域；浏览器会先发一个 OPTIONS 预检请求，服务端允许后才发真正的 POST

#### 关键细节

这是浏览器的限制，不是服务器的限制——用 Postman 直接调接口不会跨域，因为 Postman 不是浏览器

#### 常见坑

file:// 协议下打开页面，Ajax 一律失败：这是本地文件跨域限制，必须用本地服务器打开

## 阶段三：后端接客与参数解析（SpringBoot + SpringMVC + Controller）

### 3.1 SpringBoot 启动类：一切的起点

#### 知识点：@SpringBootApplication

它是三个注解的合体：@SpringBootConfiguration + @EnableAutoConfiguration + @ComponentScan

#### 逐个解释

@SpringBootConfiguration：声明这是配置类

#### 逐个解释

@EnableAutoConfiguration：自动配置，按依赖推断要装配什么（比如引了 web 依赖就自动配 Tomcat）

#### 逐个解释

@ComponentScan：从启动类所在包向下扫描所有 @Component/@Service/@Repository/@RestController

#### 详细过程

main 方法里调 SpringApplication.run(XxxApplication.class, args)，容器启动、Bean 创建、Tomcat 拉起

#### 关键细节：包的位置很关键

启动类必须放在所有业务类的「父包」下，否则扫不到——这就是为什么 Controller 注入 Service 会变成 null 的常见原因

### 3.2 内嵌 Tomcat：不用单独装服务器

#### 知识点：内嵌 Tomcat

SpringBoot 把 Tomcat 打进了 jar 里，启动应用就等于启动服务器

#### 详细过程

启动日志里会出现 Tomcat started on port 8080 和 Started XxxApplication in x.xx seconds

#### 为什么可以内嵌

传统做法是把 war 丢进外部 Tomcat；SpringBoot 反过来把容器作为依赖引入，做到「一个 jar 就能跑」

#### 关键细节

端口可在 application.yml 里改 server.port；被占用时启动会直接失败，报 Port 8080 was already in use

#### 关键细节

Tomcat 内部用线程池处理请求，每个请求占一个线程，所以 Service 里不要写死循环或长阻塞

### 3.3 请求进入 Tomcat：从字节流到 Request 对象

#### 知识点：Connector 与线程池

Tomcat 的 Connector 组件监听端口，收到 TCP 数据后交给工作线程处理

#### 详细过程

Tomcat 解析 HTTP 报文，把请求行、请求头、请求体封装成 HttpServletRequest 对象，响应封装成 HttpServletResponse

#### 关键细节

到这里 Tomcat 并不知道「用户注册」是什么业务，它只管把报文解析成对象

### 3.4 SpringMVC 路由分发：DispatcherServlet 是总调度

#### 知识点：DispatcherServlet

SpringMVC 的前端控制器（Front Controller），所有请求的入口，负责统筹而不是自己干活

#### 详细过程

请求先到 DispatcherServlet → 它问 HandlerMapping「这个路径该谁处理」→ HandlerMapping 查路由表 → 返回对应的 Controller 方法

#### 关键细节

路由表是启动时扫出来的：扫描所有 @RequestMapping/@GetMapping/@PostMapping，建立「路径 + 方法 → 处理函数」的映射

#### 常见坑

路径对得上但请求方法不对（代码写 @PostMapping、你发的是 GET），会返回 405 Method Not Allowed——这是接口层面最容易被误判成 404 的错误

### 3.5 路由映射的两种写法

#### 知识点：类级 + 方法级组合

类上写 @RequestMapping("/api/users") 作为前缀，方法上写 @PostMapping("/register")

#### 详细过程：最终路径

两者拼接得到 /api/users/register，这才和前端 axios 里的 url 对上

#### 另一种写法

方法上直接写完整路径 @PostMapping("/api/users/register")，效果一样但不利于统一管理

#### 关键细节

路径前有没有斜杠、末尾有没有斜杠，都可能影响匹配，团队要统一约定

### 3.6 @RestController：告诉 Spring「我是接口」

#### 知识点：@RestController

等于 @Controller + @ResponseBody 的组合注解

#### 拆开看

@Controller：声明这是一个控制器，要被 Spring 管理

#### 拆开看

@ResponseBody：方法返回值不再当「视图名」解析，而是直接写进响应体

#### 详细过程

返回一个 User 对象，Spring 用 Jackson 自动把它序列化成 JSON 字符串放进响应体

#### 关键细节

如果用 @Controller 而忘了 @ResponseBody，Spring 会把返回值当模板名去找页面，结果报 404 或视图解析错误——这是新手最常见的坑之一

### 3.7 @PostMapping：只接 POST

#### 知识点：@PostMapping

限定只有 POST 请求才进这个方法，是 @RequestMapping(method = RequestMethod.POST) 的简写

#### 详细过程

@PostMapping("/register") 贴在方法上，表示「/register 且是 POST」才匹配

#### 家族成员

@GetMapping / @PostMapping / @PutMapping / @DeleteMapping 分别对应查/增/改/删，和 RESTful 风格一一对应

#### 常见坑

前端用了 axios.get 而后端写的是 @PostMapping，报 405；反过来也一样

### 3.8 @RequestBody：把 JSON 变成 Java 对象

#### 知识点：@RequestBody

告诉 Spring「把请求体整个读出来，转成这个参数类型的对象」

#### 详细过程

方法签名写 public Result register(@RequestBody User user)，Spring 会：

#### 详细过程：第一步

读取请求体里的 JSON 字符串

#### 详细过程：第二步

根据 Content-Type 选择 HttpMessageConverter（JSON 对应 Jackson 的 MappingJackson2HttpMessageConverter）

#### 详细过程：第三步

Jackson 把 JSON 的键和 User 的属性名逐一匹配、反序列化成 new User(...)

#### 关键细节

这就是为什么前端字段名和后端实体属性名必须一致——不一致就映射不上，拿到 null

#### 关键细节

Content-Type 必须是 application/json，否则会报 415 Unsupported Media Type

#### 与 @RequestParam 的区别

@RequestParam 取的是 URL 上的参数或表单字段（key=value）；@RequestBody 取的是请求体的整体内容

#### 与 @PathVariable 的区别

@PathVariable 取的是路径里的占位（/users/{id}）；@RequestBody 取的是 body

#### 常见坑

一个方法里既想接 body 又想接 query 参数是可以的，但不能写两个 @RequestBody

### 3.9 Controller 的职责边界：接客不干活

#### 知识点：Controller 层是「前台」

只做三件事：接收参数、调用 Service、包装返回结果

#### 详细过程

Controller 里不应该出现 SQL、不应该出现复杂判断、不应该出现事务 —— 那些都属于 Service

#### 关键细节

Controller 保持薄，一旦业务变复杂，改 Service 就够了，接口层不用动

## 阶段四：业务处理与依赖注入（Service + IOC/DI）

### 4.1 IOC：对象创建权交给容器

#### 知识点：IOC（控制反转）

传统写法是「我要用什么，我自己 new」；IOC 是「我要用什么，容器给我」

#### 反转了什么

反转的是「对象的创建权与生命周期管理权」——从程序员手里转到了 Spring 容器

#### 详细过程

Spring 启动时扫描到 @Service、@RestController、@Repository、@Component、@Mapper，把它们实例化成对象放进容器，这些对象统称 Bean

#### 为什么要这么做

一是解耦（换个实现类不用改调用方）；二是统一管理（生命周期、作用域、AOP 增强都集中处理）

### 4.2 @Service：把类注册成 Bean

#### 知识点：@Service

语义上标记「这是一个业务层组件」，本质上和 @Component 一样，都是让容器扫描并实例化

#### 详细过程

在 UserServiceImpl 类上加 @Service，Spring 启动时就会创建它的实例放进容器

#### 关键细节：默认单例

一个 @Service 类在容器里只有一个实例，被所有请求共享；所以不要在 Service 里用成员变量存「这个请求的数据」，会串数据

#### 家族成员

@Controller/@RestController 用于接口层，@Service 用于业务层，@Repository 用于持久层，@Component 是通用兜底

### 4.3 @Autowired：依赖注入，替代手动 new

#### 知识点：@Autowired（DI 依赖注入）

声明「这个字段需要的对象，请容器帮我注入进来」

#### 详细过程：对比两种写法

老写法：private UserService userService = new UserServiceImpl();

#### 详细过程：对比两种写法

新写法：@Autowired private UserService userService;

#### 关键细节

注意注入的是「接口类型」而不是实现类——这就是利用多态解耦：以后把 UserServiceImpl 换成 UserServiceImplV2，Controller 一行都不用改

#### 注入方式：字段注入

直接标在字段上，写法最简，但不利于单元测试

#### 注入方式：构造器注入

把依赖作为构造参数，Spring 自动传入；官方推荐，因为依赖不可变（final）、便于测试、能早暴露循环依赖

#### 关键细节

@Autowired 默认按「类型」找 Bean；同类型有多个时要用 @Qualifier 指定名字，或 @Primary 标记首选

#### 常见坑

注入到的是 null，通常三个原因：类没加 @Service/@Repository；类不在启动类扫描范围内；Bean 还没创建就用了

### 4.4 Controller 调用 Service：进入业务层

#### 详细过程

Controller 里 userService.register(user) 一行调用，控制权交给 Service

#### 关键细节

这一行「看起来很简单」，但背后是：Spring 已经提前把 UserService 的实例准备好并注入到 Controller 里了

### 4.5 Service 里的业务逻辑：真正「有脑子」的一层

#### 知识点：业务校验

即便前端校验过，后端仍然要再校验一遍：用户名非空、长度合规、密码强度

#### 为什么后端还要校验

前端可以绕过（Postman 直接调接口），所以后端才是真正的安全边界

#### 知识点：唯一性检查

先查库里是否已存在同名用户，存在就抛业务异常（用户名已存在）

#### 关键细节

严格来说「先查再插」在高并发下有竞态问题，真正可靠的做法是数据库唯一索引兜底

#### 知识点：密码加密

绝不能明文存库；常见做法是 BCrypt（自带盐、可调强度）或 MD5+随机盐

#### 关键细节

加密后存的是密文，登录时是把「用户输入的密码」用同样规则算出密文再比对，不是解密

#### 知识点：事务

如果注册涉及多张表（用户表 + 用户角色表），要加 @Transactional，保证要么全成功要么全回滚

#### 知识点：业务异常

校验不通过时抛自定义异常（如 ApiException），交给全局异常处理器统一转成错误响应

### 4.6 Service 调用 Mapper：业务层不写 SQL

#### 详细过程

Service 里调用 userMapper.insert(user)，把「持久化」这件事委托出去

#### 关键细节

Service 只关心「要保存这个用户」，不关心「SQL 怎么写、连接从哪来」——这就是分层带来的好处

## 阶段五：数据持久化（MyBatis + HikariCP + MySQL）

### 5.1 @Mapper 接口：只有签名，没有实现

#### 知识点：@Mapper

标记这是一个 MyBatis 的持久层接口，告诉 MyBatis「启动时请为它生成实现」

#### 详细过程

写 public interface UserMapper { int insert(User user); } —— 只有方法签名，没有方法体

#### 关键细节

@Mapper 可以逐接口标注，也可以在启动类上用 @MapperScan 批量扫描包

### 5.2 动态代理：实现类是运行时生成的

#### 知识点：MyBatis 动态代理

MyBatis 用 JDK 动态代理（java.lang.reflect.Proxy）在运行时生成接口的实现类对象

#### 详细过程

调用 userMapper.insert(user) 时，实际进入的是代理对象的 invoke 方法，代理再根据「接口名 + 方法名」找到对应的 SQL 并执行

#### 关键细节

所以 Mapper 接口不需要你写实现类；但这也意味着「接口名 / 方法名 / namespace / id」必须严丝合缝对上，否则报 Invalid bound statement (not found)

#### 关键细节

代理对象同样被注册进 Spring 容器，所以 Service 里可以用 @Autowired 注入它

### 5.3 SQL 映射：注解写还是 XML 写

#### 知识点：注解方式

在方法上直接写 @Insert("insert into user(username, password) values(#{username}, #{password})")

#### 知识点：XML 方式

在 resources/mapper/UserMapper.xml 里写 mapper + insert，namespace 指向接口全限定名、id 等于方法名

#### 怎么选

简单 SQL 用注解；复杂/动态 SQL（if、where、foreach）用 XML，可读性更好

#### 关键细节

XML 必须放在 mybatis.mapper-locations 配置的路径下（如 classpath:mapper/*.xml），否则打包后找不到

### 5.4 #{} 占位符：防 SQL 注入的关键

#### 知识点：#{} 预编译占位符

MyBatis 把 #{username} 编译成 JDBC 的 ?，交给 PreparedStatement 设参

#### 详细过程

最终执行的 SQL 是 INSERT INTO user(username, password) VALUES(?, ?)

#### 为什么能防注入

因为 SQL 的「结构」在预编译阶段就固定了，用户输入只作为「值」被传入，不会被当成 SQL 语法的一部分

#### 对比 ${} 字符串拼接

${} 是直接文本替换，如果用户输入 ' or '1'='1，整条语句语义就被改掉

#### 详细过程：注入攻击示例

假设 SQL 是 select * from user where username = '${username}'，输入 ' or '1'='1 后变成 where username = '' or '1'='1'，条件永远成立

#### 关键细节

结论：99% 的场景用 #{}；只有表名、字段名这类「不能用 ? 替代」的地方才考虑 ${}，而且必须自己做白名单校验

#### 这个坑你踩过两次

前端用 innerHTML 拼用户输入会 XSS；SQL 用字符串拼接会注入 —— 本质都是「把数据当代码执行」

### 5.5 HikariCP 连接池：借连接而不是造连接

#### 知识点：为什么需要连接池

建立一次数据库连接要做网络握手、身份认证、分配资源，成本很高；每个请求都新建连接，高并发下会把数据库拖死

#### 知识点：连接池机制

应用启动时预先建好一批连接放进池子；用时「借出」，用完「归还」，而不是关闭

#### 详细过程

MyBatis 执行 SQL 前向 HikariCP 借一个 Connection → 执行 → 归还

#### 关键细节

SpringBoot 引入 JDBC/MyBatis 依赖后默认就用 HikariCP，不需要额外配置；application.yml 里可调最大连接数、超时等

#### 关键细节

连接池的参数本质是「并发上限」：池子满了，后来的请求只能排队等

### 5.6 执行 INSERT：DML 与事务

#### 知识点：DML 语句

INSERT 属于 DML（数据操作语言），影响的是「数据行」而不是「表结构」

#### 详细过程

PreparedStatement 设好两个参数 → executeUpdate() 执行 → MySQL 写入数据页并更新索引

#### 关键细节

数据库默认 autocommit=true，一条 DML 执行完立即提交；如果加了 @Transactional，则要在方法结束时统一提交

#### 知识点：主键回填

如果是自增主键，需要配置 useGeneratedKeys=true + keyProperty="id"，插入后新 id 会回填到传入的 User 对象上

#### 关键细节

不配回填，插入完你就拿不到新记录的 id，后续想用 id 做跳转或关联就没法做

### 5.7 结果映射：数据库的行变成 Java 的对象

#### 知识点：结果映射

查询时 MySQL 返回 ResultSet（结果集），MyBatis 负责把「一行」映射成「一个 Java 对象」

#### 详细过程：INSERT 的返回

插入方法通常声明返回 int，值等于「受影响的行数」；返回 0 说明一条都没插进去

#### 详细过程：查询的返回

select 方法声明返回 User 或 List<User>，MyBatis 按列名匹配属性名自动填充

#### 关键细节

列名 user_name 与属性名 userName 默认映射不上，需要在 SQL 里 as 起别名，或开启 map-underscore-to-camel-case

#### 常见坑

同一条 SQL 在数据库工具里查得到数据，程序里对象却全是 null —— 多半就是命名没对上

## 阶段六：响应返回与前端渲染（HTTP Response + Axios）

### 6.1 Service 返回结果给 Controller

#### 详细过程

userService.register(user) 执行完返回（void 或 int 或其他），Controller 拿到这个结果

#### 关键细节

如果 Service 里抛了异常，流程不会走到这里，而是直接进入全局异常处理分支

### 6.2 统一响应封装：Result 是前后端的「契约」

#### 知识点：统一响应结果类

把所有接口的返回都统一成 { code, msg, data } 三段式

#### 为什么需要统一

前端只需要写一套解析逻辑：先看 code，再决定取 data 还是弹 msg；不用为每个接口写不同的判断

#### 详细过程

Controller 返回 Result.success("注册成功")，或 Result.error("用户名已存在")

#### 关键细节

code 的约定要固定下来：0 或 200 表示成功，非 0 表示失败；失败时要带上可读的 msg

#### 对照你的项目

知识库后端的接口就返回统一结构，出错时由 @RestControllerAdvice 统一转成错误 JSON，前端不用逐个接口写 try

### 6.3 @RestController 序列化：Result 对象变 JSON

#### 知识点：Jackson 序列化

Spring 内置 Jackson，把 Java 对象转成 JSON 字符串

#### 详细过程

Result 对象的 code/msg/data 三个属性 → {"code":0,"msg":"注册成功","data":null}

#### 关键细节

serialization 时对象里的 null 字段默认会被写成 null；日期默认是时间戳或 ISO 格式，必要时用 @JsonFormat 指定格式

### 6.4 HTTP 响应报文：状态行 + 响应头 + 响应体

#### 知识点：状态行

格式是「协议版本 + 状态码 + 状态描述」

#### 详细过程：状态行实例

HTTP/1.1 200 OK

#### 知识点：响应头

Content-Type: application/json;charset=UTF-8（告诉浏览器这是 JSON，别乱解析）

#### 详细过程：响应头关键项

Content-Length：响应体字节长度

#### 详细过程：响应头关键项

Date：服务器时间

#### 详细过程：响应头关键项

Set-Cookie：需要建立会话时在这里下发 Cookie

#### 知识点：响应体

真正的业务数据，就是那段 JSON

#### 详细过程：响应体实例

{"code":0,"msg":"注册成功","data":null}

### 6.5 状态码：HTTP 层的「一句话结论」

#### 知识点：200 OK

请求成功，业务是否成功还要看响应体里的 code

#### 知识点：201 Created

资源创建成功（新增接口更规范的做法）；很多项目统一用 200，但要和前端约定好

#### 知识点：400 Bad Request

请求参数有问题，比如 JSON 格式错、必填字段缺失

#### 知识点：401 / 403

未认证 / 已认证但无权限

#### 知识点：404 Not Found

路径找不到——注意区分「路径错」与「端口错」，端口错是连接被拒

#### 知识点：405 Method Not Allowed

路径对了但请求方法不对（该 POST 发了 GET）

#### 知识点：415 Unsupported Media Type

Content-Type 不对，@RequestBody 解析不了

#### 知识点：500 Internal Server Error

服务端代码抛了未被捕获的异常，比如空指针、SQL 语法错、连接池耗尽

#### 关键细节

一句话区分：4xx 是「你的请求有问题」，5xx 是「我的服务器有问题」

### 6.6 全局异常处理：别让 500 直接甩给用户

#### 知识点：@RestControllerAdvice + @ExceptionHandler

统一捕获 Controller 层抛出的异常，转成规范的 JSON 响应

#### 详细过程

自定义异常（如用户名已存在）→ 被 @ExceptionHandler 捕获 → 返回 400 + {code:xxx, msg:"用户名已存在"}

#### 关键细节

没有全局处理时，未捕获异常会导致 500 并可能把堆栈信息暴露给前端，既不友好也不安全

### 6.7 Tomcat 发回响应

#### 详细过程

Tomcat 把响应对象序列化成 HTTP 响应报文字节流，通过 TCP 连接写回浏览器

#### 关键细节

如果前面是跨域请求，Tomcat 返回时还要带上 CORS 相关响应头，否则浏览器仍然会拦

### 6.8 前端接收：await 恢复执行

#### 知识点：Promise 的 resolve

网络响应回来后，之前挂起的 await 恢复执行，axios 把响应包装成 response 对象

#### 详细过程

const res = await axios.post(...)；res 里有 status（HTTP 状态码）、data（响应体 JSON 解析后的对象）

#### 关键细节

axios 已经帮你做了 JSON.parse；如果响应不是 JSON（比如返回 HTML 错误页），会解析失败

#### 关键细节

HTTP 状态码非 2xx 时，axios 默认会走 catch 而不是 then，需要用 try/catch 或在拦截器里统一处理

### 6.9 判断与渲染：把结果变成用户能看懂的东西

#### 详细过程

判断 res.data.code 是否为成功值

#### 成功分支

弹出「注册成功」提示 → 清空表单 → 延迟跳转到登录页（路由跳转而不是 window.location，避免整页刷新）

#### 失败分支

把 res.data.msg 显示在页面上（比如「用户名已存在」），让用户知道下一步该改什么

#### 关键细节

loading 状态要在这时关闭（无论成功失败），否则按钮会一直转圈

#### 关键细节

提示信息要具体，「操作失败」这种话对用户毫无帮助

## 附录 A：全链路文字时序图

### A.1 正常流程（逐步）

#### 步骤 1

用户输入 → v-model 同步到 form.username / form.password

#### 步骤 2

点击按钮 → @click 触发 register()

#### 步骤 3

前端校验通过 → 组装 data 对象

#### 步骤 4

axios.post('/api/users/register', data) → 序列化成 JSON

#### 步骤 5

浏览器发出 HTTP 请求：请求行 + 请求头（Content-Type: application/json）+ 空行 + 请求体

#### 步骤 6

TCP 连接建立 → 请求到达 127.0.0.1:8080

#### 步骤 7

Tomcat 解析报文 → 封装成 HttpServletRequest

#### 步骤 8

DispatcherServlet → HandlerMapping 查到 UserController.register 方法

#### 步骤 9

@RequestBody 用 Jackson 把 JSON 反序列化成 User 对象

#### 步骤 10

@Autowired 注入的 UserService 被调用 → 执行业务校验与加密

#### 步骤 11

Service 调用 @Autowired 注入的 UserMapper（动态代理对象）

#### 步骤 12

MyBatis 找到对应 SQL，#{} 编译成 ?，从 HikariCP 借连接

#### 步骤 13

执行 INSERT → MySQL 写入磁盘 → 返回受影响行数

#### 步骤 14

连接归还池中 → int 结果一路上传：Mapper → Service → Controller

#### 步骤 15

Controller 封装 Result.success("注册成功")

#### 步骤 16

Jackson 序列化成 JSON → 写入 HTTP 响应体 → 状态码 200

#### 步骤 17

Tomcat 发回浏览器 → await 恢复 → 判断 code → 提示并跳转

## 附录 B：常见错误对照表

### B.1 前端侧

#### 页面不刷新 / 数据不变

v-model 绑定的字段未在 data 中声明，或字段名写错

#### 请求根本没发出

按钮在 form 内且未 preventDefault，触发了页面刷新；或 @click 方法名写错

#### 请求 404

axios 的 url 与后端 @RequestMapping 拼出来的路径不一致

#### 请求 405

请求方法与后端注解不匹配（GET 打了 @PostMapping）

#### 请求 415

Content-Type 不是 application/json，或没传 body

#### 拿到 undefined

await 漏写，res 还是个 Promise

#### 报跨域错误

前后端不同源且后端没配 CORS；或页面是 file:// 打开的

### B.2 后端侧

#### 启动失败 Port already in use

8080 被占用，改 server.port 或杀掉占用进程

#### 注入的 Service 为 null

类没加 @Service，或不在启动类扫描的包范围内

#### 收到的参数全是 null

前端字段名与实体属性名不一致；或漏了 @RequestBody

#### Invalid bound statement (not found)

XML 的 namespace 不是接口全限定名、select 的 id 与方法名不一致，或 XML 不在 mapper-locations 路径

#### 查得到数据但对象全 null

数据库下划线命名与 Java 驼峰命名没做映射

#### 500 空指针

Service 里没判空就调用了方法，或注入失败

#### 中文乱码

数据库/表不是 utf8mb4，或连接串没指定字符集

#### 时间差 8 小时

连接串没配 serverTimezone=Asia/Shanghai

## 附录 C：面试高频追问

### C.1 为什么 Controller 不直接操作数据库

#### 答案要点

职责分离：Controller 负责协议层（接参、返参），Service 负责业务规则与事务边界，Mapper 负责 SQL；分层让「改业务」和「改 SQL」互不影响，也让单元测试更可行

### C.2 @Autowired 注入的是接口，能调用吗

#### 答案要点

能。Spring 注入的是接口的「实现类实例」，通过多态调用；这也是面向接口编程的价值——换实现不用改调用方

### C.3 #{} 和 ${} 到底差在哪

#### 答案要点

#{} 编译成 JDBC 的 ? 走预编译，值永远是值；${} 是文本替换，值可能变成语法的一部分。前者安全，后者只在表名/字段名这类无法用 ? 的场景使用，且必须白名单校验

### C.4 为什么有了 JDBC 还要 MyBatis

#### 答案要点

JDBC 一个查询要写连接、PreparedStatement、设参、遍历 ResultSet、关资源，模板代码占了大头；MyBatis 把模板收走，只留「接口方法 + SQL」，本质是「把重复收进壳里」

### C.5 连接池解决了什么问题

#### 答案要点

建连接成本高（握手、认证、分配资源），连接池把连接复用起来，用「借/还」代替「建/销」，把开销从「每请求一次」降到「启动时一批」

### C.6 一次请求经过了多少层

#### 答案要点

浏览器 → TCP → Tomcat → DispatcherServlet → HandlerMapping → Controller → Service → Mapper 代理 → MyBatis → 连接池 → MySQL → 原路返回。每层只做自己的事，靠「约定」（路径、字段名、返回结构）串起来

## 附录 D：这张图怎么用

### D.1 顺向背一遍

从阶段一读到阶段六，每个阶段问自己：「这一层的输入是什么、输出是什么、出了什么错」

### D.2 逆向查一遍

从报错倒推：看到 404 想「路径匹配」，看到 405 想「请求方法」，看到 500 想「服务端异常」，看到 null 想「字段映射」

### D.3 画一遍再讲一遍

合上这张图，自己在纸上画出六段式，然后对着空气讲给「一个不懂的人」听——能讲通，才算真会
