package com.yangzijie.kb.domain;

import java.util.List;

/**
 * 首页/页头的统计信息。
 *
 * 这是「一个接口同时返回多种统计」的例子：
 * 与其让前端发 4 个请求，不如后端一次查完、拼成一个对象返回。
 * 这类“为页面量身定做的返回结构”就是 DTO（Data Transfer Object）。
 */
public class Stats {

    /** 笔记总数 */
    private long total;

    /** 分类数 */
    private long categoryCount;

    /** 正文总字数（近似统计，按字符数算） */
    private long totalChars;

    /** 最早/最晚一篇的日期 */
    private String firstDate;
    private String lastDate;

    /** 各分类数量 */
    private List<CategoryStat> categories;

    public long getTotal() {
        return total;
    }

    public void setTotal(long total) {
        this.total = total;
    }

    public long getCategoryCount() {
        return categoryCount;
    }

    public void setCategoryCount(long categoryCount) {
        this.categoryCount = categoryCount;
    }

    public long getTotalChars() {
        return totalChars;
    }

    public void setTotalChars(long totalChars) {
        this.totalChars = totalChars;
    }

    public String getFirstDate() {
        return firstDate;
    }

    public void setFirstDate(String firstDate) {
        this.firstDate = firstDate;
    }

    public String getLastDate() {
        return lastDate;
    }

    public void setLastDate(String lastDate) {
        this.lastDate = lastDate;
    }

    public List<CategoryStat> getCategories() {
        return categories;
    }

    public void setCategories(List<CategoryStat> categories) {
        this.categories = categories;
    }
}
