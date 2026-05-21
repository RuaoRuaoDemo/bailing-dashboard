# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## 项目定位

这是一个**纯前端、零构建**的单页工作量分析工具——"百灵工作量仪表盘"。它把 `百灵数据/` 下从业务系统导出的 3 份报表（工作量、非任务工时、工时利用率底表）与排班表合并分析，呈现工时利用率、标准条异常、班表矩阵等视图。所有逻辑在浏览器本地运行，数据通过 `localStorage` 持久化，不依赖任何后端或 npm 工具链。

## 运行 / 调试

```
# 直接用浏览器打开（推荐 Chrome/Edge，需要联网以加载 CDN）
start bailing-dashboard.html        # Windows
```

- 无 `package.json`，**没有** build / lint / test 脚本。
- 依赖通过 CDN 注入：`tailwindcss`、`chart.js@4.4`、`xlsx@0.18.5`（见 `bailing-dashboard.html` 顶部）。
- HTML `<meta>` 强制 `no-cache`；静态资源通过 `?v=xxx` query 手动打版本号，修改 JS/CSS 时升级版本可避免浏览器缓存旧文件。
- **公式回归自测**：在浏览器 Console 执行 `BailingFormulas.selfTest()`（别名 `BF.selfTest()`），会跑 `core/formulas.js` 内置断言并在 Console 打印通过/失败。**这是唯一的测试入口**，任何修改公式/阈值的 PR 必须保证它全绿。
- 其他调试钩子：`App`（全局状态）、`window._ntUnmatched`（非任务表未匹配到工作量行的诊断数据）、`BailingStore`、`BailingPersistence.clear()`（清空本地缓存）。

## 数据流（读多文件才能看懂的主干）

```
用户上传 xlsx/csv ──► parseWorkbook() / 排班 csv parser  (bailing-dashboard.html)
                        │
                        ▼
            normalizeSheetRows(sheet, WORKLOAD_RULES|NONTASK_RULES)
                        │  按中文表头别名把列映射成 _emp/_empEn/_uin/_dateStr/_eff/_tong/_nontong/_minutes/_origStd …
                        ▼
         App.rawRows / App.nontaskRows / App.utilRows / App.scheduleMap
                        │
                        ▼
                     calcAll()                            ← bailing-dashboard.html ~L2317
          · BailingStore.rebuildEmpMaps()  重建中英文/UIN 三向员工映射
          · 对每条工作量行调用 BailingFormulas.calcRow()  求标准条构成
          · 用英文名/中文名/UIN 多键候选把非任务行合并进当日工作量
          · 合并工时利用率底表（_utilRate 优先，缺数据时回退到公式估算）
                        │
                        ▼
              App.dailyData  (员工×日期 聚合行)
                        │
                        ▼
  视图层（全部定义在 bailing-dashboard.html 的 <script> 里）
   · renderTable()        —— 每日汇总表格、异常筛选
   · 主看板图表（Chart.js）—— utilTrend / workloadPie / personPie / audit* 等实例存在 App 上
   · renderScheduleView() —— 班表矩阵（双向 sticky，节假日/周末高亮）
                        │
                        ▼
         BailingPersistence.save()  ──► localStorage('bailing_data','bailing_schedule')
```

## 架构要点

### 1. 分层约定（重要！）

`core/` 与 `data/` 下的 6 个 JS 是 V8.1 引入的**可复用底座**；`bailing-dashboard.html` 内联的大量 `<script>` 是**视图层**。约定：

- **任何数值/公式计算**必须走 `BailingFormulas`（`core/formulas.js`）。该文件文档头明确要求：
  - 125 标准条/小时 的换算基准（历史 ×1000 的写法是 bug，见 V8.70 注释）
  - 非任务→有效工时权重 0.8125、利用率达标线 81.25%/预警 70%/超标分级 100/102/105 等阈值全部集中在 `CONSTANTS`
  - 任何改动跑 `BailingFormulas.selfTest()` 做回归
- **所有跨模块共享状态**挂在 `BailingStore.App`（`core/store.js`），`window.App` 是同一对象的别名。`calcAll()` 开头必须调用 `BailingStore.rebuildEmpMaps()`，否则 `localStorage` 恢复后员工映射表会空掉导致合并失败。
- **持久化**只走 `BailingPersistence.save / load / clear`（`data/persistence.js`）。只序列化原始行 + 用户选择/阈值，不存派生数据——重载后由 `calcAll()` 重算。
- **通用 UI 控件**：`BailingMultiSelect`（`core/multi-select.js`，带搜索/分组/全选反选的多选下拉）、`BailingRangePicker`（`core/range-picker.js`，双月日期范围选择，自动隐藏原始 date input，`syncAll()` 批量刷新显示）。新增筛选器请复用这两个，不要再写一份。
- 视图层禁止直接访问 `localStorage`、禁止就地硬编码阈值、禁止重复写标准条公式。

### 2. 员工标识三向映射（踩坑重点）

原始报表里员工可能用中文名 `_emp`、英文名 `_empEn`、工号 `_uin` 中任意一种标识，三张表之间经常对不上。`App.empUinMap / uinToEmpMap / empEnMap / enToCnMap` 这四张 Map 由 `rebuildEmpMaps` 重建，`calcAll` 里把非任务行合并到工作量行时会生成**多个候选 key**（中/英/UIN 直接匹配 + 通过映射表互转），最终命中同一 `dayMap` 条目。未匹配的非任务行记到 `window._ntUnmatched` 供诊断。

### 3. 数据读取优先级

- 总标准条：Excel 原始 `_origStd` 与公式结果差异 > 5% 时**信任 Excel**，按构成比例回填（见 `calcRow` 注释）。
- 工时利用率：底表 `_utilRate` 字段优先，缺失或与 `calcUtilRateByHours` 偏差 > 1% 时改用公式值，避免脏数据（V8.71 注释）。
- `utilRate` 底表同时接受 0~1 小数、0~100 百分比、带 `%` 字符串——解析层已统一 ×100 标准化。

### 4. 视图切换

顶部导航按 `data-view="dashboard|audit|schedule"` 切换；三个 `<section class="view-section">` 通过 `.active` 控制显隐，详情页 `viewDetail` 由表格行点击触发。不要直接 `display:block`，用 `.active` 类。

### 5. 班表

`parseScheduleSheet(jsonRows, csvText)` 同时尝试 JSON 行和 CSV 文本两种解析路径（不同导出格式兼容）。班次代码集合（早/午/晚/休/假）对应 CSS `.shift-morning/afternoon/night/rest/leave`。矩阵使用双向 sticky（首列 + 表头），节假日/周末列有 `.col-weekend / .col-holiday` 背景区分。异常跳转靠 `.cell-flash` 动画定位。

## 版本与变更记录

- HTML 首行的版本号（当前 `V8.71`）和文件顶部注释会逐版累积说明，阅读某块代码前先在附近搜 `V8.xx`，可以快速理解当初为什么这样写（很多看似奇怪的写法都是修某个数据源问题）。
- 修改 `core/` 或 `data/` 下文件后，请在 `bailing-dashboard.html` 对应 `<script src="...?v=XXX">` 里升版本号，避免用户浏览器命中旧缓存。

## 编辑 `bailing-dashboard.html` 的注意事项

- 文件 ~11200 行、单文件巨型 HTML，**不要整体重写或大段移动**。用精确上下文的局部替换，避免破坏手写缩进和 V8.x 注释。
- 样式规则里对 `.bms-item` / `.multi-check-*` 有大量 `!important` 是为了抵消 Tailwind + 表单默认样式之间的冲突，删除 `!important` 会破坏多选控件外观。
- Chart.js 实例存在 `App.*Chart` 字段里，重绘前必须 `destroy()` 旧实例，否则有内存泄漏。
