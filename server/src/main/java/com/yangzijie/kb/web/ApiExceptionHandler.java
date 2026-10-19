package com.yangzijie.kb.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 全局异常处理：把 Java 异常翻译成「HTTP 状态码 + 统一 JSON 结构」。
 *
 * 【为什么不 try-catch 写在每个 Controller 里】
 *   每个方法都写一遍同样的 catch，既啰嗦又容易漏。
 *   @RestControllerAdvice 是 SpringMVC 的“统一兜底”：
 *   任何 Controller 抛出的异常都会跑到这里，按类型匹配到对应方法。
 *
 * 【统一返回结构的意义】
 *   前端只要判断 res.ok 和 body.error 就够了，不用为每个接口写不同的错误解析。
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    /** 业务“不存在” → 404 */
    @ExceptionHandler(NotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Map<String, Object> handleNotFound(NotFoundException e) {
        return body(HttpStatus.NOT_FOUND, e.getMessage());
    }

    /** 参数校验失败 → 400（比如标题为空、分类为空） */
    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> handleBadRequest(IllegalArgumentException e) {
        return body(HttpStatus.BAD_REQUEST, e.getMessage());
    }

    /**
     * 静态资源找不到（比如访问 /favicon.ico）→ 仍然是 404，
     * 不要让下面的兜底把它变成 500。
     */
    @ExceptionHandler(NoResourceFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public Map<String, Object> handleNoResource(NoResourceFoundException e) {
        return body(HttpStatus.NOT_FOUND, "资源不存在：" + e.getResourcePath());
    }

    /** 其他未预料到的异常 → 500，并把堆栈打到日志里（方便排查） */
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public Map<String, Object> handleOther(Exception e) {
        log.error("未处理的异常", e);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "服务器内部错误：" + e.getMessage());
    }

    private Map<String, Object> body(HttpStatus status, String message) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", status.value());
        m.put("error", message);
        return m;
    }
}
