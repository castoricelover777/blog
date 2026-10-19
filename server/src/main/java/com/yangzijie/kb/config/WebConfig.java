package com.yangzijie.kb.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Web 配置：把 Vue 前端和 REST 接口放在同一个 8080 端口下。
 *
 * 【为什么要这么做】
 *   前后端分离最常遇到的第一个坑就是「跨域（CORS）」：
 *   前端在 8099、后端在 8080，浏览器会因为端口不同而拦截请求。
 *   解决办法有两种：
 *     A. 后端加 CORS 头，允许 8099 访问（下面 addCorsMappings 就是，留着给开发期用）
 *     B. 干脆让后端把前端页面也托管了，同源访问 —— 生产/日常使用推荐这种
 *   这里两种都给了：正常用 http://localhost:8080 访问（同源，干净）；
 *   如果你单独启动 tools/blog-vue 的 8099 小服务器调前端，也能通过 CORS 访问后端。
 *
 * 【这样做带来的额外好处】
 *   只需要启动一个进程：java -jar kb-server.jar → 页面和接口全有了。
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebConfig.class);

    /** 前端源码目录（相对 server/ 目录），在 application.yml 里可改 */
    @Value("${kb.frontend-dir:../src/main/webapp}")
    private String frontendDir;

    /**
     * 把前端目录映射成静态资源。
     *
     * 【踩过的坑：为什么用 /** 而不是 /js/**】
     *   ResourceHandler 匹配 "/js/**" 时，交给资源解析的路径是 ** 匹配到的那一段，
     *   也就是 "app.js"，而不是 "js/app.js"。
     *   所以 /js/app.js 会去找 <前端目录>/app.js → 404。
     *   换成 /**（整体兜底）后，路径原样保留（"js/app.js"），就对了。
     *
     * 【/** 会不会抢走 /api 的请求】
     *   不会。SpringMVC 的 RequestMappingHandlerMapping（Controller）优先级
     *   高于资源处理器，所以 /api/** 先交给 @RestController，其余才落到静态资源。
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path dir = Paths.get(frontendDir).toAbsolutePath().normalize();
        if (!Files.isDirectory(dir)) {
            log.warn("[web] 前端目录不存在：{}（页面会 404，但接口不受影响）", dir);
            return;
        }
        String location = dir.toUri().toString();
        if (!location.endsWith("/")) {
            location = location + "/";
        }
        log.info("[web] 前端静态目录：{}", dir);

        registry.addResourceHandler("/**")
                .addResourceLocations(location)
                .setCachePeriod(0);   // 开发期不缓存，改了前端刷新就能看到
    }

    /** 访问 / 时转发到 index.html（否则 "/" 没有对应文件会 404） */
    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/").setViewName("forward:/index.html");
    }

    /**
     * 开发期用：允许本机任意端口的页面访问 /api/**。
     * 用 allowedOriginPatterns 而不是 allowedOrigins("*")，
     * 是因为带 Cookie 的请求不允许 "*"。
     */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("http://localhost:*", "http://127.0.0.1:*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .maxAge(3600);
    }
}
