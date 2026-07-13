# event-tracking-sdk

面向上百个 B 端前端系统的框架无关自动化埋点 SDK：统一事件模型（EC/ET/EP/EV/eventCustom）+ 自动采集（全局事件委托 + 组件库识别器 + 零侵入语义推断）+ 上报路由器 1..N 扇出到 Furion / UEM 平台适配器。隐私脱敏默认开启，所有内部异常静默处理，绝不阻断宿主页面。

## 快速开始

引入固定版本的单文件产物（IIFE，挂载全局 `EventTracking`），然后在页面尽早调用 `init`：

```html
<script src="https://cdn.example.com/event-tracking.v1.0.0.js"></script>
<script>
  EventTracking.init({
    businessType: "biz",          // EC 第一段
    serviceName: "orderService",  // EC 第二段（第三段 module 自动从路由推断）

    // 平台选择：写哪个就扇出到哪个；两个都写 = 双平台扇出。
    // 平台方法名和字段映射必须来自已核验的官方/内部文档。
    // verifiedFurionContract / verifiedUemContract 由集成方实现并测试；
    // SDK 不探测 report/track/send 等候选方法。
    platforms: {
      furion: {
        contract: verifiedFurionContract,
        appId: "your-furion-app",
        script: {
          url: "https://cdn.example.com/furion.js",
          allowedOrigins: ["https://cdn.example.com"],
          integrity: "sha384-REPLACE_WITH_RELEASE_HASH",
        },
      },
      uem: { contract: verifiedUemContract },
    },

    autoTrack: true,              // 自动采集，默认 true
    debug: false,                 // true 时挂调试面板 + 命名规范 lint 告警 + 内部 warn 日志
    trackErrorStates: false,      // true 时采集 错误/空态/无权限 曝光，默认关闭（保守）
    fieldBlacklist: ["phone", "idCard"],  // eventCustom 中这些字段的值替换为 "***"

    // 上报前最后一道钩子：返回修改后的事件继续，返回 null/false 丢弃
    beforeReport: (event) => event,
  });

  // 自定义埋点（自动采集覆盖不到的交互）
  EventTracking.track({
    eventType: EventTracking.EventAction.CONFIRM,
    eventPath: "Modal.批量导出.确认",
  });

  // 完整拆除当前运行；之后允许再次 init。
  // destroy 到下一次 init 之间的 track 会进入 200 条有界预初始化缓冲。
  // EventTracking.destroy();
</script>
```

## 公共 API

集成方应只依赖稳定 API：

- 运行时：`init`、`track`、`destroy`、`EventAction`、`SystemEventAction`
- 类型：`InitConfig`、`PlatformConfig`、`PlatformsConfig`、`TrackEvent`、`EventType`

高级扩展 API 用于接入自定义平台或流水线能力：`registerAdapter`、`use`、
`registerRecognizer`、`unregisterRecognizer`、`setModuleInferrer`、`onDispatch`、
`getConfig`、`getDiagnostics`，以及对应的 `PlatformAdapter`、
`PlatformSdkContract`、`PlatformScriptConfig`、`Recognizer`、
`RecognizerRegistration`、`PipelineHook`、`ModuleInferrer`、`Tracker` 类型。
它们保持顶层导出，但生命周期契约可能在后续版本中收紧。

`createTracker`、`wireTracker`、`WiredSdk`、`EventBuffer`、`ReportRouter` 是为
现有使用方保留的内部兼容 API，已标记为待废弃。新集成不要依赖它们；第一轮
优化不会删除或改变这些顶层导出。

### 平台 SDK 契约与安全加载

Furion/UEM 的正式前端 SDK 文档和真实集成环境尚未提供，因此本仓库不声明任何
平台方法名或平台 payload。每个平台配置必须提供经文档核验的
`PlatformSdkContract`：

```ts
const verifiedContract: PlatformSdkContract = {
  isReady(instance) {
    return vendorReadinessCheckFromOfficialDocs(instance);
  },
  report(instance, event, { appId }) {
    const payload = mapExactlyAsVendorDocsRequire(event, { appId });
    callDocumentedVendorReportMethod(instance, payload);
  },
};
```

缺少 `contract` 时适配器保持未就绪且不会加载外部脚本。`report` 接收的统一事件
已经完成校验与脱敏；contract 额外添加的 timestamp/page/session/user/device
上下文由平台或集成方负责并接受其自己的隐私审查，SDK 不重复采集。

`script.url` 仅接受无用户名/密码的 HTTPS URL；`allowedOrigins` 做精确源白名单，
并可设置 `integrity`、`nonce`、`crossOrigin`、`referrerPolicy`。`cdnUrl` 暂时
作为兼容别名保留并执行同样的 HTTPS 校验，后续主版本移除。

### 组件库识别器

```ts
const registration = EventTracking.registerRecognizer(
  {
    name: "company-ui-v2",
    recognize(target) {
      return recognizeUsingVerifiedCompanyUiDom(target);
    },
    teardown() {
      releaseRecognizerResources();
    },
  },
  { priority: 100 },
);

registration.unregister(); // 幂等；成功注销时 teardown 恰好执行一次
```

优先级数值越大越先执行，同优先级按注册顺序；重名和保留名 `generic` 会被安全
拒绝，不替换现有项。所有自定义项之后固定执行 `generic-dom` 兜底。注册独立于
SDK `init/destroy`，需要由持有者通过 handle 或 `unregisterRecognizer(name)`
注销。仓库尚未得到实际共享组件库的名称、版本、DOM fixture 和浏览器范围，因此
没有虚构 2–3 个库专用实现；补齐资料后的接入步骤见优化路线图。

### data-track-* 覆盖

零侵入推断打底，推断不准时集成方用 HTML 属性覆盖，无需改 JS：

| 属性 | 作用 |
| --- | --- |
| `data-track-name="订单表"` | 覆盖 eventPath 的实例名段 |
| `data-track-control="exportBtn"` | 覆盖 eventPath 的控件段（原文本变为 `:文本` 后缀） |
| `data-track-module="orderList"` | 覆盖 EC 第三段（module），优先于 URL 路由推断 |
| `data-track-row-label="金额"` | 指定表格标识列（列头名或 0 起列下标） |
| `data-track-ignore` | 整棵子树不采集 |

空属性按未设置处理。ignore 任一祖先存在即生效；name/control 取最近祖先并优先于
推断；module 取文档中首个非空值并优先于 URL；row-label 先取当前行，再取所属表格。

## 事件结构

所有事件（自动采集与手动 `track`）统一为：

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| `eventCategory` (EC) | `businessType_serviceName[_module]`，前两段来自 init 配置，module 自动推断 | `biz_orderService_orderList` |
| `eventType` (ET) | 封闭 `EventType`：22 个 `EventAction` 交互动作或 SDK 系统动作 `EXPOSE` | `DOWNLOAD` |
| `eventPath` (EP) | `组件[.实例名].控件[:文本]`，实例名取就近标题 | `Table.订单列表.导出` |
| `eventValue` (EV) | 可选值（如搜索词），字符串会先过脱敏 | `手机壳` |
| `eventCustom` | 可选扩展对象（如表格行上下文），深度脱敏 + 字段黑名单 | `{ rowIndex: 1, rowLabel: "SO20260708002", buttonText: "导出" }` |

`EventAction` 共 22 项：

`INIT` `CLICK` `SEARCH` `ON` `OFF` `SELECT` `CHECK` `UNCHECK` `REFRESH` `BLUR` `DOWNLOAD` `BATCH` `HOVER` `SLIDE` `DRAG` `ADD` `REDUCE` `CHANGE` `SUBMIT` `FOCUS` `UPLOAD` `CONFIRM`

`EXPOSE` 不计入上述 22 个交互动作，仅由开启的异常态观察器通过
`SystemEventAction.EXPOSE` 发送；任意其他 eventType 会在运行时安全丢弃。
businessType、serviceName 与 eventCategory 各段必须字母开头且仅含字母数字；
无效 init 保持未初始化，无效 EC/ET/EP 事件不向页面抛异常并直接丢弃。

## 生命周期、隐私与诊断

`destroy()` 会清理自动采集、Observer、调试面板、dispatch 订阅、hooks、平台
适配器、全部缓冲和 config。随后可再次 `init()`；自定义 adapter/hook/订阅需重新
注册。`onDispatch` 返回幂等 unsubscribe。

默认脱敏覆盖 eventPath、字符串 eventValue 和 eventCustom 深层字符串；mask
内部失败时整条事件 fail-closed。SDK 不向平台 payload 自动补 timestamp/page/
session/user/device；这些字段只能由经核验的平台契约明确处理。

唯一去重位于上报路由器，300ms 指纹包含 EC/ET/EP/EV/eventCustom；不同 custom
不会误去重。平台未就绪时每个平台独立缓冲 200 条，溢出丢最旧，async setup 或
onReady 后主动补发。`getDiagnostics()` 返回实例本地聚合计数（丢弃、溢出、未就绪、
内部异常等），不保存事件 payload，也不联网。

## 固定版本交付

产物文件名自带版本号（`event-tracking.v1.0.0.js`），各系统引用固定版本，发布新版本另起文件名，**不做滚动覆盖**，各系统按自己的节奏切换版本号升级。SDK 无远程运行时配置、无远程止血开关，因此默认参数一律保守：脱敏默认开启、异常态采集默认关闭、任何内部错误静默吞掉。

发布前按 [固定版本发布检查清单](./docs/release-checklist.md) 执行；从候选平台
探测版本迁移时参阅 [迁移指南](./docs/migration-v1.md)。本轮继续保留单一顶层入口，
不新增尚无消费证据的 advanced 子入口。

## 构建与测试

```bash
npm install
npm run typecheck     # 类型检查
npm run test:unit     # 单元/契约测试
npm run test:e2e      # 端到端 DOM → 双平台契约
npm run build         # IIFE + ESM + .d.ts
npm run smoke         # 构建后 IIFE/ESM API 快照与运行冒烟
npm run verify        # 本地完整验收
```
