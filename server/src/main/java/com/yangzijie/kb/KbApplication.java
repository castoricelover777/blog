package com.yangzijie.kb;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 后端启动类。
 *
 * 【@SpringBootApplication 拆开看是三个注解】
 *   @SpringBootConfiguration  标记这是一个配置类
 *   @EnableAutoConfiguration  开启自动配置（看到 starter-jdbc 就自动配数据源，
 *                             看到 starter-web 就自动配 Tomcat + SpringMVC）
 *   @ComponentScan            扫描当前包及子包里的 @Component/@Service/@Repository/@RestController
 *
 * ⚠ 这就是为什么所有业务类都必须放在 com.yangzijie.kb 的子包里。
 *   放到外面（比如 com.itheima）就扫不到，注入时会报 NoSuchBeanDefinitionException ——
 *   和你在笔记里记的「业务类一定要放在启动类所在包的子包下」是同一件事。
 */
@SpringBootApplication
public class KbApplication {

    public static void main(String[] args) {
        SpringApplication.run(KbApplication.class, args);
    }
}
