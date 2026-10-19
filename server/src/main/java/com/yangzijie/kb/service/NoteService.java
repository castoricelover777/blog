package com.yangzijie.kb.service;

import com.yangzijie.kb.dao.NoteDao;
import com.yangzijie.kb.domain.CategoryStat;
import com.yangzijie.kb.domain.Note;
import com.yangzijie.kb.domain.Stats;
import com.yangzijie.kb.web.NotFoundException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 笔记业务层。
 *
 * 【这一层存在的意义：装“业务规则”】
 *   Controller 只负责收 HTTP 请求、返回 HTTP 响应；
 *   DAO 只负责跟数据库打交道；
 *   中间那些“标题不能为空”“新增时 id/日期要自动补”“改之前先确认存在”
 *   的规则，都放这里。这样以后不管从网页、定时任务还是命令行调用，
 *   规则都是同一份。
 *
 * 【为什么用构造器注入】
 *   字段上加 @Autowired 也能跑，但构造器注入有三个好处：
 *     1. 依赖一创建就确定，不会出现“用到一半还是 null”
 *     2. 能用 final，防止被意外改掉
 *     3. 单元测试里可以直接 new NoteService(fakeDao)，不用启动 Spring 容器
 */
@Service
public class NoteService {

    /** 和前端一致的分钟级时间格式 */
    private static final DateTimeFormatter MINUTE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    /**
     * id 生成器用的“上一次 id”。
     *
     * 【为什么不能直接用 System.currentTimeMillis()】
     *   同一毫秒内连续新增多条（批量导入、脚本循环、自动化测试）会拿到同一个 id，
     *   主键冲突 / 互相覆盖 —— 这个 bug 就是单元测试跑出来的：
     *   连续 create 3 条，断言总数是 3，实际只有 1 条（后两条把前一条覆盖了）。
     *
     * 【现在怎么保证唯一】
     *   取 max(当前毫秒, 上一个 id + 1)，用 CAS 自增。
     *   效果：id 既近似时间戳（前端排序友好），又严格递增不重复。
     */
    private static final java.util.concurrent.atomic.AtomicLong LAST_ID =
            new java.util.concurrent.atomic.AtomicLong(0);

    private final NoteDao noteDao;

    public NoteService(NoteDao noteDao) {
        this.noteDao = noteDao;
    }

    /** 列表查询：关键词 + 分类叠加筛选 */
    public List<Note> list(String keyword, String category) {
        return noteDao.findAll(trimToNull(keyword), trimToNull(category));
    }

    public Note get(long id) {
        return noteDao.findById(id)
                .orElseThrow(() -> new NotFoundException("笔记不存在：id=" + id));
    }

    /** 新增：校验 → 补默认值 → 入库 → 回查返回（带回数据库生成的时间字段） */
    public Note create(Note input) {
        validate(input);

        Note n = new Note();
        n.setId(input.getId() != null ? input.getId() : nextId());
        // 前端没传日期就默认今天；传了就按传的来（导入历史笔记时会传）
        n.setDate(input.getDate() != null ? input.getDate() : LocalDate.now());
        n.setCreated(input.getCreated() != null && !input.getCreated().isBlank()
                ? input.getCreated()
                : LocalDateTime.now().format(MINUTE_FORMAT));
        n.setTitle(input.getTitle().trim());
        n.setCategory(input.getCategory().trim());
        n.setContent(input.getContent());

        noteDao.insert(n);
        return get(n.getId());
    }

    /**
     * 修改：先确认存在，再把新的标题/分类/正文覆盖上去。
     *
     * 【注意 date / created 的处理】
     *   编辑正文不应该把“笔记归属日期”改成今天 —— 那会让历史笔记全跑到列表最前面。
     *   所以：请求里明确传了 date 才改，否则保留原来的。
     */
    public Note update(long id, Note input) {
        Note old = get(id);          // 不存在会直接抛 404
        validate(input);

        Note n = new Note();
        n.setId(id);
        n.setDate(input.getDate() != null ? input.getDate() : old.getDate());
        n.setCreated(input.getCreated() != null && !input.getCreated().isBlank()
                ? input.getCreated()
                : old.getCreated());
        n.setTitle(input.getTitle().trim());
        n.setCategory(input.getCategory().trim());
        n.setContent(input.getContent());

        noteDao.update(n);
        return get(id);
    }

    public void delete(long id) {
        Note old = get(id);          // 先确认存在，删不存在的返回 404 而不是“假装成功”
        noteDao.deleteById(old.getId());
    }

    public List<CategoryStat> categories() {
        return noteDao.countByCategory();
    }

    /**
     * 统计信息：一次把首页需要的数字都算好。
     * 这些查询单看都很简单，组合起来才是“为页面服务的接口”该有的样子。
     */
    public Stats stats() {
        Stats s = new Stats();
        s.setTotal(noteDao.count());
        List<CategoryStat> cats = noteDao.countByCategory();
        s.setCategories(cats);
        s.setCategoryCount(cats.size());
        s.setTotalChars(noteDao.sumContentChars());
        s.setFirstDate(noteDao.selectFirstDate());
        s.setLastDate(noteDao.selectLastDate());
        return s;
    }

    // ------------------------------------------------------------------
    // 私有工具
    // ------------------------------------------------------------------

    /** 校验规则集中在一处：以后加规则只改这里，不会漏掉某个入口 */
    private void validate(Note n) {
        if (n == null) {
            throw new IllegalArgumentException("请求体不能为空");
        }
        if (n.getTitle() == null || n.getTitle().trim().isEmpty()) {
            throw new IllegalArgumentException("标题不能为空");
        }
        if (n.getTitle().trim().length() > 200) {
            throw new IllegalArgumentException("标题不能超过 200 字");
        }
        if (n.getCategory() == null || n.getCategory().trim().isEmpty()) {
            throw new IllegalArgumentException("分类不能为空");
        }
        if (n.getCategory().trim().length() > 50) {
            throw new IllegalArgumentException("分类不能超过 50 字");
        }
        if (n.getContent() == null || n.getContent().trim().isEmpty()) {
            throw new IllegalArgumentException("正文不能为空");
        }
    }

    private String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    /**
     * 导出成静态站用的 notes.json 结构。
     *
     * 【为什么单独做一个导出方法，而不是直接返回 Note 对象】
     *   静态站的 data/notes.json 只需要 6 个字段：
     *     id / date / created / title / category / content
     *   而 Note 里还有 createdAt、updatedAt（数据库内部字段）。
     *   用 LinkedHashMap 固定字段顺序，导出的文件 git diff 才好看、可读。
     *
     * 【这就是 C 方案的桥梁】
     *   本地全栈写数据（MySQL）→ 调这个接口 → 覆盖静态站的 data/notes.json
     *   → 推送到 GitHub → Pages 自动更新（线上只读，但内容永远最新）。
     */
    public java.util.List<java.util.Map<String, Object>> exportForStatic() {
        java.util.List<java.util.Map<String, Object>> list = new java.util.ArrayList<>();
        for (Note n : noteDao.findAll(null, null)) {
            java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("id", n.getId());
            m.put("date", n.getDate() == null ? null : n.getDate().toString());
            m.put("created", n.getCreated());
            m.put("title", n.getTitle());
            m.put("category", n.getCategory());
            m.put("content", n.getContent());
            list.add(m);
        }
        return list;
    }

    /**
     * 生成一个不重复的 id：max(当前毫秒, 上一个 + 1)，CAS 保证并发下也唯一。
     * 结果既接近时间戳，又严格递增。
     */
    private static long nextId() {
        while (true) {
            long last = LAST_ID.get();
            long candidate = Math.max(System.currentTimeMillis(), last + 1);
            if (LAST_ID.compareAndSet(last, candidate)) {
                return candidate;
            }
        }
    }
}
