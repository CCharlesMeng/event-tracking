# SDK 优化路线图

本文件记录三轮优化的范围、验收状态和后续问题。第一、二轮已完成；第三轮仓库内
可执行项已完成，真实平台与组件库专用实现保留为有明确输入要求的外部阻塞。

## 第一轮：结构、命名与公共边界

状态：已完成并通过验收（typecheck、全量测试、build、IIFE smoke）。

- 公共入口保持 `src/index.ts`；顶层运行时导出和类型导出由契约测试锁定。
- `wiring.ts` 更名为根目录 `bootstrap.ts`，继续作为唯一组合根。
- `auto/` 更名为 `auto-tracking/`；职责文件更名为 `inference.ts`、
  `error-state.ts`、`recognizers/registry.ts` 和 `recognizers/generic-dom.ts`。
- 共享脚本平台基类更名为 `adapters/script-platform-adapter.ts`。
- `PlatformAdapter`、`PipelineHook`、`ModuleInferrer` 集中到
  `core/ports.ts`；core 不再从 adapters 或 Tracker 实现反向取得端口类型。
- 顶层 API 分为稳定、扩展、内部兼容三层；第一轮未删除任何顶层导出。
- 默认配置、初始化组合顺序、订单导出端到端行为和 IIFE API 纳入验收安全网。

## 第二轮：契约、安全与运行可靠性

状态：已完成。契约取舍见
[ADR 0005](./adr/0005-第二轮契约隐私与生命周期.md)。

### 领域契约

- `EventAction` 保持 22 个交互动作，`SystemEventAction.EXPOSE` 是唯一系统动作；
  `EventType` 为封闭联合，README、lint、平台 payload 与测试已同步。
- eventCategory/eventType/eventPath、`businessType`、`serviceName` 已增加不抛异常
  的运行时校验；无效 config 不初始化，无效事件安全丢弃并记本地诊断。
- `data-track-*` 常量、最近祖先/行优先级、空值和回退规则已集中定义。

### 生命周期

- `destroy` 已完整清理监听器、Observer、Panel、dispatch 订阅、hooks、adapters、
  buffers 和 config；允许 re-init，期间 track 按预初始化语义有界缓冲。
- `onDispatch` 返回幂等 unsubscribe；自动采集返回实例 handle，已移除模块级
  active/lastKey/lastAt，多 root 与多 Tracker 隔离。
- 平台适配器支持可选 teardown；destroy 后手动 track、二次 init、多实例隔离
  已覆盖。

### 隐私与诊断

- 脱敏覆盖 eventPath、字符串 eventValue 与 eventCustom 深层字符串。
- 第二轮曾将平台上下文限制为 timestamp/pageUrl/appId 白名单；第三轮因无真实平台
  资料进一步收紧为 SDK 不自动补上下文，避免把临时映射当成平台契约。
- mask 失败采用 fail-closed，整条事件丢弃，不放行原文。
- 本地 diagnostics 聚合丢弃、缓冲溢出、adapter 未就绪、无效 config 和内部异常；
  不保存 payload，默认不联网。

### 路由与缓冲

- 去重统一归上报路由器，窗口 300ms；稳定指纹含 EC/ET/EP/EV/eventCustom。
- async setup resolve 或 adapter onReady 后主动 flush，不依赖下一条事件。
- 同名 adapter 忽略后者；长期未就绪/脚本失败保持有界等待；200 条溢出丢最旧，
  destroy 丢弃剩余缓冲，全部进入聚合诊断。
- overflow、async-ready、不同 custom、enabled=false、仅 UEM、
  debug/error-state wiring 与异常路径测试已补齐。

## 第三轮：平台、识别器与发布

状态：仓库内可执行项已完成；真实平台和库专用识别器按下述外部资料阻塞。决策见
[ADR 0006](./adr/0006-显式平台契约与识别器注册.md)。

### 平台契约

- 已检索仓库和可用公开资料，未找到能唯一对应目标 Furion/UEM 的成套正式前端 SDK
  文档。华为云 APM 的
  [Web&H5 SDK 文档](https://support.huaweicloud.com/usermanual-apm2/apm_07_0203.html)
  提到“furion 探针”并公开 `__rum.log(key, value)`，但仓库没有证据确认它就是本项目
  Furion，且该页面也未定义 UEM 或本项目统一字段映射；另有同名 .NET Furion。
  因此不能据任一结果推导目标平台签名。
- 已删除 `report/track/send` 候选方法和临时字段映射。两平台改用同一个
  `PlatformSdkContract` 边界，由集成方显式实现 readiness、调用和 payload；
  无 contract 时不就绪且不加载脚本。
- SDK 只向 contract 交付已校验和脱敏的统一事件，不再自动补 timestamp/pageUrl/
  appId/user/session/device。appId 仅作为显式 contract context；新增字段由平台/
  contract 所有者承担语义和隐私责任。
- Furion/UEM 已有对称本地 contract 测试和双平台 e2e。脚本加载只接受无凭据 HTTPS，
  支持精确 origin allowlist、SRI、nonce、CORS、referrer policy，并覆盖拒绝路径、
  去重、load/error、teardown。
- 外部阻塞：真实集成 smoke 仍需要每个平台的准确产品名与 SDK 版本、官方/内部文档
  URL、全局实例或初始化方式、就绪条件、上报方法签名、完整 payload/schema、
  timestamp/page/session/user/device 归属、正式 CDN URL 与 SRI/CSP 要求，以及可验证
  的 sandbox/测试账号和“事件已入库”判定方式。在资料齐全前不得把 fake fixture
  描述为真实平台验证。

### 识别器产品化

- `registerRecognizer/unregisterRecognizer` 已作为顶层扩展 API 暴露；高 priority
  优先、同 priority 保持注册顺序、重名/`generic` 保留名拒绝、handle/名称注销
  幂等、成功注销 teardown 恰好一次，识别/teardown 异常不进入宿主。
- `generic-dom` 固定最后兜底。checkbox/radio/select、Element 自定义 root、
  ShadowRoot 隔离和测试 fixture 已补齐，控件 value 不进入事件。
- 外部阻塞：无法选择 2–3 个实际组件库，因为仓库没有共享库名称、版本、采用系统
  清单或代表性 DOM。需要每个库的准确包名/版本范围、至少表格/按钮/表单/分页/
  弹层 fixture、Shadow DOM 模式、主题/国际化变体、浏览器支持范围和维护负责人；
  获取后按每库一个可卸载 recognizer + 对称 fixture 契约测试实现，不按 class 名猜测。

### 发布治理

- 已增加 GitHub Actions CI：`npm ci`、typecheck、unit、e2e、build、IIFE/ESM
  API 快照和运行 smoke，10 分钟超时避免无期限等待；本地 `npm run verify` 对齐。
- 本轮不新增 advanced 子入口，也不删除 `createTracker/wireTracker/EventBuffer/
  ReportRouter` 等 deprecated 顶层兼容导出；需取得使用方清单并经过完整兼容周期后
  再决策。
- CONTEXT、README、ADR、[迁移指南](./migration-v1.md) 和
  [固定版本发布检查清单](./release-checklist.md) 已更新。

## 三轮总验收

状态：仓库内标准已满足；上述两类真实外部集成项明确阻塞，不伪造完成。

- 目录职责、单一顶层入口和无无意义单文件层级保持第一轮结果。
- 稳定/扩展/deprecated API 均有源码与构建产物快照；第三轮只新增 recognizer 和
  平台契约扩展，不删除兼容导出。
- 事件、生命周期、隐私、路由、平台契约、识别器和发布流程均有对应测试或明确外部
  阻塞。第一、二轮遗留的候选平台签名与自动上下文字段已在本轮关闭。
- 2026-07-10 最终本地验收：typecheck 通过；unit 17 文件/181 项、e2e 1 文件/5 项、
  全量 18 文件/186 项全部通过；IIFE、ESM、`.d.ts` 构建成功；IIFE/ESM API 快照、
  生命周期、显式平台契约、脱敏和 diagnostics smoke 通过。CI 会对每次 push/PR
  重复同一门禁。
