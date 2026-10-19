package com.yangzijie.kb.web;

/**
 * 业务异常：资源不存在 → 最终映射成 HTTP 404。
 *
 * 【为什么要自己定义一个异常，而不是直接 return null】
 *   Service 层不关心 HTTP。它只表达“要的东西没有”。
 *   把“没有”翻译成“404”是 Web 层（GlobalExceptionHandler）的事 ——
 *   这叫「分层职责」，Service 复用到别的场景（定时任务、命令行工具）也不会携带 HTTP 味道。
 */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }
}
