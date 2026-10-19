package com.yangzijie.kb.dao;

import com.yangzijie.kb.domain.CategoryStat;
import com.yangzijie.kb.domain.Note;

import java.util.List;
import java.util.Optional;

/**
 * 笔记的数据访问接口（DAO = Data Access Object）。
 *
 * 【为什么要先定义接口，再写实现类】
 *   1. Service 只依赖“能力”（能查、能存），不依赖“怎么实现”。
 *      将来把 JDBC 换成 MyBatis、换成 Redis，Service 一行都不用改。
 *   2. 测试时可以传入假实现（FakeNoteDao），不连数据库就能测业务逻辑 ——
 *      这就是 spring-boot-starter-test 里那个 NoteServiceTest 干的事。
 *
 * 这在课程里叫「面向接口编程」，也是 IOC/DI 能成立的前提：
 * 容器里放的是实现类的 bean，但注入点写的是接口类型。
 */
public interface NoteDao {

    /**
     * 查询笔记列表，支持关键词 + 分类叠加筛选，按日期倒序。
     *
     * @param keyword  关键词（null/空 = 不筛），匹配标题/分类/正文
     * @param category 分类（null/空 = 全部）
     */
    List<Note> findAll(String keyword, String category);

    Optional<Note> findById(long id);

    /** 返回受影响行数（1 = 成功） */
    int insert(Note note);

    int update(Note note);

    int deleteById(long id);

    long count();

    /** 每个分类有多少篇：SELECT category, COUNT(*) ... GROUP BY category */
    List<CategoryStat> countByCategory();

    /** 正文总字数（近似：按字符数累加） */
    long sumContentChars();

    /** 最早一篇 / 最晚一篇的日期，返回 yyyy-MM-dd 字符串，没有数据时返回 null */
    String selectFirstDate();

    String selectLastDate();
}
