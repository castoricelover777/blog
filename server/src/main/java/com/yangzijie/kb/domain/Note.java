package com.yangzijie.kb.domain;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 笔记实体（对应数据库 note 表，也对应前端 notes.json 里的一条记录）。
 *
 * 【为什么字段名和前端 notes.json 完全一样】
 *   前端原来的数据结构是 { id, date, created, title, category, content }。
 *   后端保持同名，前端 renderMarkdown/filterNotes 那些代码一行都不用改，
 *   只需要把「从文件读」换成「从接口读」。
 *
 * 【为什么不直接用数据库字段名 note_date】
 *   数据库叫 note_date 是为了避开关键字；对外（JSON）保留 date 这个业务名，
 *   两者的转换放在 DAO 的 RowMapper 里做 —— 这就是“持久层负责映射”的意义。
 */
public class Note {

    /** 笔记 id：沿用前端 Date.now() 生成的时间戳，作主键 */
    private Long id;

    /** 归属日期，JSON 里输出 2026-10-17 */
    private LocalDate date;

    /** 创建时间（精确到分钟），如 2026-10-17 19:30 */
    private String created;

    private String title;

    private String category;

    /** 正文（Markdown 原文） */
    private String content;

    /** 入库时间，只给后端/统计用，前端可以忽略 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createdAt;

    /** 最后修改时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updatedAt;

    public Note() {
    }

    public Note(Long id, LocalDate date, String created, String title, String category, String content) {
        this.id = id;
        this.date = date;
        this.created = created;
        this.title = title;
        this.category = category;
        this.content = content;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }

    public String getCreated() {
        return created;
    }

    public void setCreated(String created) {
        this.created = created;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    @Override
    public String toString() {
        return "Note{id=" + id + ", date=" + date + ", category='" + category + "', title='" + title + "'}";
    }
}
