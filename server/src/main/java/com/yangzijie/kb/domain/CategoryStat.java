package com.yangzijie.kb.domain;

/**
 * 分类统计（分类药丸上显示「JavaWeb 12」这种数字用）。
 *
 * 对应 SQL：
 *   SELECT category, COUNT(*) AS cnt FROM note GROUP BY category ORDER BY cnt DESC
 */
public class CategoryStat {

    private String name;
    private long count;

    public CategoryStat() {
    }

    public CategoryStat(String name, long count) {
        this.name = name;
        this.count = count;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public long getCount() {
        return count;
    }

    public void setCount(long count) {
        this.count = count;
    }
}
