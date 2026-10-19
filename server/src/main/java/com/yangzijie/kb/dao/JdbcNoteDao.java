package com.yangzijie.kb.dao;

import com.yangzijie.kb.domain.CategoryStat;
import com.yangzijie.kb.domain.Note;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * NoteDao 的 JDBC 实现。
 *
 * 【JdbcTemplate 帮你省了什么】
 *   裸 JDBC 写一次查询要：拿连接 → 建 PreparedStatement → 设参数 →
 *   执行 → 遍历 ResultSet → 关三个资源（还要 try-finally 防泄漏）。
 *   JdbcTemplate 用回调封装了这些样板代码，你只写「SQL + 参数 + 怎么映射成对象」。
 *   ⚠ 它用的仍然是 PreparedStatement，所以不会退化成 SQL 拼接注入。
 *
 * 【@Repository 是什么】
 *   它 = @Component + 语义标记（表示这是持久层组件）。
 *   被 @ComponentScan 扫到后放进 IOC 容器，NoteService 才能注入它。
 */
@Repository
public class JdbcNoteDao implements NoteDao {

    private final JdbcTemplate jdbc;

    /** 构造器注入：Spring 发现这个类只有一个构造方法，会自动把 JdbcTemplate 传进来 */
    public JdbcNoteDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * ResultSet → Java 对象的映射。
     * 数据库列 note_date 在这里转成业务字段 date，这就是「持久层负责映射」。
     */
    private static final RowMapper<Note> ROW_MAPPER = new RowMapper<Note>() {
        @Override
        public Note mapRow(ResultSet rs, int rowNum) throws SQLException {
            Note n = new Note();
            n.setId(rs.getLong("id"));
            n.setDate(rs.getObject("note_date", LocalDate.class));
            n.setCreated(rs.getString("created"));
            n.setTitle(rs.getString("title"));
            n.setCategory(rs.getString("category"));
            n.setContent(rs.getString("content"));
            if (rs.getTimestamp("created_at") != null) {
                n.setCreatedAt(rs.getTimestamp("created_at").toLocalDateTime());
            }
            if (rs.getTimestamp("updated_at") != null) {
                n.setUpdatedAt(rs.getTimestamp("updated_at").toLocalDateTime());
            }
            return n;
        }
    };

    @Override
    public List<Note> findAll(String keyword, String category) {
        // 动态拼 SQL 的条件部分，但**参数一律用 ? 占位**，交给 JdbcTemplate 传值。
        // 这样既能按需加条件，又不会有 SQL 注入风险。
        StringBuilder sql = new StringBuilder(
                "SELECT id, note_date, created, title, category, content, created_at, updated_at FROM note WHERE 1 = 1");
        List<Object> args = new ArrayList<>();

        if (category != null && !category.isBlank()) {
            sql.append(" AND category = ?");
            args.add(category);
        }
        if (keyword != null && !keyword.isBlank()) {
            String like = "%" + keyword + "%";
            sql.append(" AND (title LIKE ? OR category LIKE ? OR content LIKE ?)");
            args.add(like);
            args.add(like);
            args.add(like);
        }

        // 排序规则和前端原来的 sortNotes 一致：日期倒序，同一天按 created 倒序
        sql.append(" ORDER BY note_date DESC, created DESC, id DESC");

        return jdbc.query(sql.toString(), ROW_MAPPER, args.toArray());
    }

    @Override
    public Optional<Note> findById(long id) {
        String sql = "SELECT id, note_date, created, title, category, content, created_at, updated_at FROM note WHERE id = ?";
        List<Note> list = jdbc.query(sql, ROW_MAPPER, id);
        return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }

    @Override
    public int insert(Note n) {
        String sql = "INSERT INTO note (id, note_date, created, title, category, content) VALUES (?, ?, ?, ?, ?, ?)";
        return jdbc.update(sql, n.getId(), n.getDate(), n.getCreated(), n.getTitle(), n.getCategory(), n.getContent());
    }

    @Override
    public int update(Note n) {
        String sql = "UPDATE note SET note_date = ?, created = ?, title = ?, category = ?, content = ? WHERE id = ?";
        return jdbc.update(sql, n.getDate(), n.getCreated(), n.getTitle(), n.getCategory(), n.getContent(), n.getId());
    }

    @Override
    public int deleteById(long id) {
        return jdbc.update("DELETE FROM note WHERE id = ?", id);
    }

    @Override
    public long count() {
        Long c = jdbc.queryForObject("SELECT COUNT(*) FROM note", Long.class);
        return c == null ? 0L : c;
    }

    @Override
    public List<CategoryStat> countByCategory() {
        String sql = "SELECT category, COUNT(*) AS cnt FROM note GROUP BY category ORDER BY cnt DESC, category ASC";
        return jdbc.query(sql, (rs, i) -> new CategoryStat(rs.getString("category"), rs.getLong("cnt")));
    }

    @Override
    public long sumContentChars() {
        Long c = jdbc.queryForObject("SELECT COALESCE(SUM(CHAR_LENGTH(content)), 0) FROM note", Long.class);
        return c == null ? 0L : c;
    }

    @Override
    public String selectFirstDate() {
        return jdbc.queryForObject("SELECT DATE_FORMAT(MIN(note_date), '%Y-%m-%d') FROM note", String.class);
    }

    @Override
    public String selectLastDate() {
        return jdbc.queryForObject("SELECT DATE_FORMAT(MAX(note_date), '%Y-%m-%d') FROM note", String.class);
    }
}
