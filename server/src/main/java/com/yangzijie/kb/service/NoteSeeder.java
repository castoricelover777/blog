package com.yangzijie.kb.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yangzijie.kb.dao.NoteDao;
import com.yangzijie.kb.domain.Note;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.time.LocalDate;

/**
 * 种子数据导入器：第一次启动时把 data/notes.json 的 49 篇笔记灌进 MySQL。
 *
 * 【为什么需要它】
 *   前端原来是读 data/notes.json 这个文件的。改成前后端分离后，
 *   数据必须先进数据库。手动一条条 insert 49 篇显然不现实，
 *   所以写一个“启动时检查表空不空，空就批量导入”的组件。
 *
 * 【ApplicationRunner vs @PostConstruct】
 *   ApplicationRunner 的 run() 在**整个 Spring 容器就绪之后**才执行，
 *   此时代理、事务、数据源都准备好了；
 *   @PostConstruct 太早，那时候很多 bean 还没初始化完。
 *
 * 【幂等性】
 *   先 count() 判断表里有没有数据。有就跳过 ——
 *   所以重启多少次都不会把数据重复导入两遍。
 */
@Component
public class NoteSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(NoteSeeder.class);

    private final NoteDao noteDao;
    private final ObjectMapper objectMapper;

    @Value("${kb.seed-on-empty:true}")
    private boolean seedOnEmpty;

    public NoteSeeder(NoteDao noteDao, ObjectMapper objectMapper) {
        this.noteDao = noteDao;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!seedOnEmpty) {
            log.info("[seed] kb.seed-on-empty=false，跳过种子数据导入");
            return;
        }

        long existing = noteDao.count();
        if (existing > 0) {
            log.info("[seed] 数据库里已有 {} 篇笔记，跳过导入", existing);
            return;
        }

        ClassPathResource resource = new ClassPathResource("seed/notes.json");
        if (!resource.exists()) {
            log.warn("[seed] 找不到 classpath:seed/notes.json，跳过导入");
            return;
        }

        try (InputStream in = resource.getInputStream()) {
            JsonNode root = objectMapper.readTree(in);
            if (!root.isArray()) {
                log.warn("[seed] seed/notes.json 不是数组，跳过导入");
                return;
            }

            int ok = 0;
            for (JsonNode node : root) {
                Note n = new Note();
                n.setId(node.path("id").asLong());
                String date = node.path("date").asText("");
                if (date.isEmpty()) {
                    continue;
                }
                n.setDate(LocalDate.parse(date));
                n.setCreated(node.path("created").asText(""));
                n.setTitle(node.path("title").asText(""));
                n.setCategory(node.path("category").asText(""));
                n.setContent(node.path("content").asText(""));
                if (n.getTitle().isEmpty() || n.getCategory().isEmpty()) {
                    continue;
                }
                noteDao.insert(n);
                ok++;
            }
            log.info("[seed] 导入完成：{} 篇笔记", ok);
        }
    }
}
