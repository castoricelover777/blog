package com.yangzijie.kb;

import com.yangzijie.kb.dao.NoteDao;
import com.yangzijie.kb.domain.CategoryStat;
import com.yangzijie.kb.domain.Note;
import com.yangzijie.kb.domain.Stats;
import com.yangzijie.kb.service.NoteService;
import com.yangzijie.kb.web.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 业务层单元测试 —— 不连数据库、不启动 Spring。
 *
 * 【为什么能不连数据库就测】
 *   NoteService 依赖的是**接口** NoteDao，而不是 JdbcNoteDao 这个具体类。
 *   所以测试里可以塞一个内存版假实现（FakeNoteDao），
 *   业务规则（校验、默认值、404）照样能测到。
 *
 *   这就是「面向接口编程」最实际的好处之一：
 *   写业务代码的时候不关心存储，测试的时候也不用准备数据库。
 */
class NoteServiceTest {

    private FakeNoteDao fakeDao;
    private NoteService service;

    @BeforeEach
    void setUp() {
        fakeDao = new FakeNoteDao();
        service = new NoteService(fakeDao);
    }

    @Test
    @DisplayName("新增：不传 date/created 时自动补今天和时间戳")
    void createFillsDefaults() {
        Note input = new Note();
        input.setTitle("  测试标题  ");
        input.setCategory(" JavaWeb ");
        input.setContent("正文");

        Note created = service.create(input);

        assertNotNull(created.getId(), "没传 id 应该自动生成");
        assertEquals(LocalDate.now(), created.getDate(), "没传日期应该默认今天");
        assertNotNull(created.getCreated(), "created 应该自动补上");
        assertEquals("测试标题", created.getTitle(), "标题两端空格应被去掉");
        assertEquals("JavaWeb", created.getCategory(), "分类两端空格应被去掉");
        assertEquals(1, fakeDao.count(), "数据库里应该有 1 条");
    }

    @Test
    @DisplayName("新增：标题为空应抛出 IllegalArgumentException")
    void createRejectsBlankTitle() {
        Note input = new Note();
        input.setTitle("   ");
        input.setCategory("Java");
        input.setContent("正文");

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> service.create(input));
        assertEquals("标题不能为空", e.getMessage());
    }

    @Test
    @DisplayName("查询：不存在的 id 抛 NotFoundException（接口层会翻译成 404）")
    void getMissingThrows() {
        assertThrows(NotFoundException.class, () -> service.get(123456L));
    }

    @Test
    @DisplayName("修改：请求里没带 date 时，保留原本的归属日期")
    void updateKeepsOriginalDate() {
        Note old = new Note();
        old.setTitle("原标题");
        old.setCategory("Java");
        old.setContent("原正文");
        old.setDate(LocalDate.of(2026, 10, 1));
        Note saved = service.create(old);

        Note patch = new Note();
        patch.setTitle("新标题");
        patch.setCategory("JavaWeb");
        patch.setContent("新正文");

        Note updated = service.update(saved.getId(), patch);

        assertEquals("新标题", updated.getTitle());
        assertEquals("JavaWeb", updated.getCategory());
        assertEquals(LocalDate.of(2026, 10, 1), updated.getDate(), "编辑正文不应该把日期改成今天");
    }

    @Test
    @DisplayName("删除：先确认存在，删不存在的抛 404")
    void deleteMissingThrows() {
        assertThrows(NotFoundException.class, () -> service.delete(999L));
    }

    @Test
    @DisplayName("统计：总数/分类/字数/时间跨度都算对")
    void statsAreAggregated() {
        service.create(note("A", "Java", "2026-10-01", "12"));
        service.create(note("B", "Java", "2026-10-05", "345"));
        service.create(note("C", "JavaWeb", "2026-10-03", "6789"));

        Stats s = service.stats();

        assertEquals(3, s.getTotal());
        assertEquals(2, s.getCategoryCount());
        // 正文分别是 "12" / "345" / "6789"，按字符数算就是 2 + 3 + 4
        assertEquals(2 + 3 + 4, s.getTotalChars());
        assertEquals("2026-10-01", s.getFirstDate());
        assertEquals("2026-10-05", s.getLastDate());

        // 分类按数量倒序：Java 2 条排第一
        assertEquals("Java", s.getCategories().get(0).getName());
        assertEquals(2, s.getCategories().get(0).getCount());
    }

    @Test
    @DisplayName("列表：关键词和分类叠加筛选")
    void listFiltersByKeywordAndCategory() {
        service.create(note("MySQL 索引", "JavaWeb", "2026-10-01", "内容"));
        service.create(note("MySQL 事务", "数据库", "2026-10-02", "内容"));
        service.create(note("IOC 与 DI", "JavaWeb", "2026-10-03", "内容"));

        assertEquals(3, service.list(null, null).size());
        assertEquals(2, service.list("MySQL", null).size());
        assertEquals(1, service.list("MySQL", "JavaWeb").size());
        assertEquals(2, service.list(null, "JavaWeb").size());
        assertEquals(0, service.list("不存在的东西", null).size());
    }

    // ------------------------------------------------------------------
    // 测试辅助
    // ------------------------------------------------------------------

    private Note note(String title, String category, String date, String content) {
        Note n = new Note();
        n.setTitle(title);
        n.setCategory(category);
        n.setDate(LocalDate.parse(date));
        n.setContent(content);
        return n;
    }

    /** 内存版 DAO：所有操作都打到 Map 上，行为跟真 DAO 保持一致 */
    static class FakeNoteDao implements NoteDao {

        private final Map<Long, Note> store = new LinkedHashMap<>();

        @Override
        public List<Note> findAll(String keyword, String category) {
            List<Note> list = new ArrayList<>(store.values());
            if (category != null) {
                list.removeIf(n -> !category.equals(n.getCategory()));
            }
            if (keyword != null) {
                String kw = keyword.toLowerCase();
                list.removeIf(n -> !(n.getTitle().toLowerCase().contains(kw)
                        || n.getCategory().toLowerCase().contains(kw)
                        || n.getContent().toLowerCase().contains(kw)));
            }
            list.sort(Comparator.comparing(Note::getDate).reversed());
            return list;
        }

        @Override
        public Optional<Note> findById(long id) {
            return Optional.ofNullable(store.get(id));
        }

        @Override
        public int insert(Note note) {
            store.put(note.getId(), note);
            return 1;
        }

        @Override
        public int update(Note note) {
            if (!store.containsKey(note.getId())) return 0;
            store.put(note.getId(), note);
            return 1;
        }

        @Override
        public int deleteById(long id) {
            return store.remove(id) != null ? 1 : 0;
        }

        @Override
        public long count() {
            return store.size();
        }

        @Override
        public List<CategoryStat> countByCategory() {
            Map<String, Long> m = new LinkedHashMap<>();
            for (Note n : store.values()) {
                m.merge(n.getCategory(), 1L, Long::sum);
            }
            List<CategoryStat> list = new ArrayList<>();
            m.forEach((k, v) -> list.add(new CategoryStat(k, v)));
            list.sort(Comparator.comparingLong(CategoryStat::getCount).reversed().thenComparing(CategoryStat::getName));
            return list;
        }

        @Override
        public long sumContentChars() {
            long sum = 0;
            for (Note n : store.values()) {
                sum += n.getContent() == null ? 0 : n.getContent().length();
            }
            return sum;
        }

        @Override
        public String selectFirstDate() {
            return store.values().stream().map(n -> n.getDate().toString()).min(String::compareTo).orElse(null);
        }

        @Override
        public String selectLastDate() {
            return store.values().stream().map(n -> n.getDate().toString()).max(String::compareTo).orElse(null);
        }
    }

    /** 保证测试类本身没被写坏：至少有一个断言能过的空壳测试 */
    @Test
    @DisplayName("基础自检")
    void sanity() {
        assertTrue(true);
    }
}
