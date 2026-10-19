-- ============================================================================
--  schema.sql —— 建表脚本
-- ============================================================================
--  这个脚本在每次启动时都会被 spring.sql.init 执行一次。
--  用 CREATE TABLE IF NOT EXISTS，重复执行不会报错、也不会删数据。
--
--  【表结构设计思路】
--    · id      ：直接沿用前端原来用 Date.now() 生成的时间戳 id，
--                好处是前端一行代码都不用改；但业务上它是唯一标识，所以做主键。
--    · note_date：笔记“归属日期”（前端显示用），单独索引，列表按它倒序。
--                ⚠ 不能直接叫 date：date 是 MySQL 的类型关键字，容易踩坑。
--    · created ：创建时间（精确到分钟），同一天的笔记靠它定顺序。
--    · category ：分类，单独索引，因为分类筛选是高频查询。
--    · content ：正文（Markdown 原文），用 MEDIUMTEXT（最大 16MB）足够。
--    · created_at / updated_at：真正的“入库时间/最后修改时间”，
--                由数据库默认值维护，前端不用管。
-- ============================================================================

CREATE TABLE IF NOT EXISTS note (
    id         BIGINT       NOT NULL COMMENT '笔记 id（沿用前端时间戳，保证唯一）',
    note_date  DATE         NOT NULL COMMENT '笔记归属日期',
    created    VARCHAR(16)  NULL COMMENT '创建时间（精确到分钟，如 2026-10-17 19:30）',
    title      VARCHAR(200) NOT NULL COMMENT '标题',
    category   VARCHAR(50)  NOT NULL COMMENT '分类',
    content    MEDIUMTEXT   NOT NULL COMMENT '正文（Markdown）',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    KEY idx_note_date (note_date),
    KEY idx_category (category)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = '知识库笔记表';
