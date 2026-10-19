package com.yangzijie.kb.web;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.util.DefaultIndenter;
import com.fasterxml.jackson.core.util.DefaultPrettyPrinter;
import com.fasterxml.jackson.core.util.Separators;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.yangzijie.kb.domain.CategoryStat;
import com.yangzijie.kb.domain.Note;
import com.yangzijie.kb.domain.Stats;
import com.yangzijie.kb.service.NoteService;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 笔记接口层（Controller）。
 *
 * 【RESTful 的一句话理解】
 *   用「名词（/api/notes）+ 动词（HTTP 方法）」表达操作，而不是把动词写进 URL：
 *     GET    /api/notes       查列表
 *     GET    /api/notes/{id}  查单条
 *     POST   /api/notes       新增
 *     PUT    /api/notes/{id}  全量修改
 *     DELETE /api/notes/{id}  删除
 *   好处：接口语义统一，前端 axios/fetch 调用方式一致，浏览器/代理/缓存都能理解。
 *
 * 【@RestController 的效果】
 *   = @Controller + @ResponseBody：方法返回的对象会被 Jackson 自动转成 JSON。
 *   所以这里 return 一个 Note 对象，浏览器收到的是 JSON，不用手写转换。
 */
@RestController
@RequestMapping("/api")
public class NoteController {

    private final NoteService noteService;

    /**
     * ObjectMapper：Spring Boot 自动配置好的 Jackson 序列化器。
     * 这里注入它，是为了在 /api/export 里手动把对象输出成
     * **带缩进的 JSON 字符串**（方便 git diff 看清每一行改了什么）。
     */
    private final ObjectMapper objectMapper;

    public NoteController(NoteService noteService, ObjectMapper objectMapper) {
        this.noteService = noteService;
        this.objectMapper = objectMapper;
    }

    /** 健康检查：前端用它判断“后端通不通”，也方便你用浏览器直接测 */
    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", "ok");
        m.put("service", "kb-server");
        m.put("time", LocalDateTime.now().toString());
        return m;
    }

    /**
     * 查列表，支持 ?keyword= 和 ?category=，两者可以叠加。
     * 例：/api/notes?keyword=MySQL&category=JavaWeb
     */
    @GetMapping("/notes")
    public List<Note> list(@RequestParam(required = false) String keyword,
                           @RequestParam(required = false) String category) {
        return noteService.list(keyword, category);
    }

    @GetMapping("/notes/{id}")
    public Note get(@PathVariable long id) {
        return noteService.get(id);
    }

    /** 新增成功返回 201 Created（而不是笼统的 200），这是 REST 的约定 */
    @PostMapping("/notes")
    public ResponseEntity<Note> create(@RequestBody Note note) {
        Note created = noteService.create(note);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/notes/{id}")
    public Note update(@PathVariable long id, @RequestBody Note note) {
        return noteService.update(id, note);
    }

    /** 删除成功返回 204 No Content（没有响应体，因为确实没什么可返回的） */
    @DeleteMapping("/notes/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        noteService.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** 分类列表 + 每个分类的数量，前端分类药丸用 */
    @GetMapping("/categories")
    public List<CategoryStat> categories() {
        return noteService.categories();
    }

    /** 统计信息：总数、分类数、总字数、时间跨度 */
    @GetMapping("/stats")
    public Stats stats() {
        return noteService.stats();
    }

    /**
     * 导出静态站用的 data/notes.json（C 方案的桥梁接口）。
     *
     * 【为什么返回 String 而不是对象】
     *   普通接口返回对象时，Spring 用 Jackson 的“紧凑模式”输出一行 JSON，
     *   这种格式给人看、给 git diff 看都很难受。
     *   这里手动用 prettyPrinter 输出**带缩进的 JSON 文本**，
     *   再用 StringHttpMessageConverter 原样返回（Content-Type: application/json），
     *   所以浏览器里看到的就是可以直接另存为 notes.json 的内容。
     *
     * 用法：curl http://127.0.0.1:8080/api/export -o data/notes.json
     */
    @GetMapping(value = "/export", produces = "application/json;charset=UTF-8")
    public ResponseEntity<String> export() {
        try {
            // 【为什么要自定义 PrettyPrinter】
            //   Jackson 默认的缩进格式是 "id" : 1、" [ {" 这种风格，
            //   跟前端原来那个 data/notes.json（JSON.stringify(x, null, 2) 生成的
            //   "id": 1）不一致 —— 那样每次同步都会整文件重写，git diff 完全没法看。
            //   下面把分隔符改成「冒号后加空格」（AFTER），数组和对象都缩进 2 空格，
            //   输出就与现有文件逐字节同风格，只有真正改动的那几行才会出现在 diff 里。
            Separators separators = new Separators()
                    .withObjectFieldValueSpacing(Separators.Spacing.AFTER);
            DefaultPrettyPrinter printer = new DefaultPrettyPrinter()
                    .withSeparators(separators);
            printer.indentObjectsWith(new DefaultIndenter("  ", "\n"));
            printer.indentArraysWith(new DefaultIndenter("  ", "\n"));

            String json = objectMapper.writer(printer)
                    .writeValueAsString(noteService.exportForStatic());
            return ResponseEntity.ok()
                    .contentType(MediaType.valueOf("application/json;charset=UTF-8"))
                    .body(json);
        } catch (JsonProcessingException e) {
            // 序列化失败属于服务器内部问题，交给全局异常处理器变成 500
            throw new IllegalStateException("导出 JSON 失败", e);
        }
    }
}
