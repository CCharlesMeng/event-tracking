# event-tracking-sdk

面向上百个共享 2-3 套组件库的 B 端系统的框架无关自动化埋点 SDK。

## 概念模型：三问

每条埋点事件，就是**转述用户在页面上做的一件事**——只回答三个问题，然后告诉上游系统。

| 问题 | 含义 | 字段 |
| --- | --- | --- |
| **谁？** | 哪个业务、哪个服务、哪个页面 | `eventCategory` = `businessType_serviceName[_module]` |
| **干了什么？** | 一个动词：点了、搜了、提交了、勾选了… | `eventType` = 封闭 `EventType` |
| **在哪？** | 具体到组件和控件 | `eventPath` = `组件[.实例].控件[:文本]` |

答完三问，可选附带 **值**（`eventValue`，如搜索词）和 **补充说明**（`eventCustom`，如表格行上下文），经脱敏与校验后，**告诉谁**——扇出到 Furion / UEM 等平台。

```
听说（采集）→ 说清楚（三问）→ 检查后说（脱敏/拦截）→ 告诉总部（多平台上报）
```

**铁律**：SDK 永远不向宿主页面抛异常——埋点不能比业务更先挂。

### 三问 → 代码映射

| 三问 | 谁负责答 | 模块 |
| --- | --- | --- |
| 谁？ | init 配置前两段 + 路由/`data-track-module` 推断第三段 | `config` · `auto-tracking/inference` |
| 干了什么？ | 控件语义 + 文本动词映射 → `EventAction` | `auto-tracking/scope` · `auto-tracking/recognizers` |
| 在哪？ | 组件识别 + 标题推断 → `eventPath` | `auto-tracking/recognizers` · `auto-tracking/inference` |
| 检查后说 | 正则脱敏 + 字段黑名单 + `beforeReport` | `privacy/mask` · `config.beforeReport` |
| 告诉谁 | 1→N 扇出，各平台独立就绪与缓冲 | `core/router` · `adapters/*` |

---

## Language

**集成方**: 引入本 SDK 的某个 B 端宿主系统，通过本地 init 配置声明自己的业务标识与启用平台。
_Avoid_: 宿主、业务方、接入方

**组件库识别器**: 从被交互的 DOM 元素识别出所属组件（Table/Form/Tabs…）及其控件语义的可插拔单元，链上最后是基于原生 DOM 语义的通用回退。回答「在哪？」的组件段。
_Avoid_: recognizer、解析器

**平台适配器**: 把统一事件交给某个埋点平台（Furion/UEM）SDK 的适配单元，
负责探测复用页面已有平台实例或按安全策略加载平台脚本。具体方法调用与字段映射
只能来自平台 SDK 契约，不由适配器猜测。回答「告诉谁」的具体投递。
_Avoid_: adapter、平台插件

**平台 SDK 契约**: 集成方依据可验证的官方或内部平台文档提供的 readiness、
调用和字段映射边界。没有契约时平台适配器保持未就绪且不加载脚本；SDK 不猜测
report/track/send，也不自动补 timestamp/page/session/user/device。
_Avoid_: 候选方法、临时映射

**上报路由器**: 把一条统一事件扇出到全部已注册平台适配器的分发单元，上报处不感知目的地。
_Avoid_: router、分发器

**零侵入推断**: 不要求集成方写任何标注，纯靠 DOM 结构、就近标题与 URL 路由推导事件语义的机制。自动回答「谁？」的 module 段与「在哪？」的实例段。
_Avoid_: 自动推断、智能识别

**data-track-\* 覆盖**: 集成方在 HTML 上用 `data-track-name/-control/-module/-row-label/-ignore` 属性显式指定语义、压过零侵入推断结果的机制。
_Avoid_: 手动标注、埋点属性

**eventCategory**: 事件归属类目，形如 `businessType_serviceName[_module]`，前两段来自 init 配置、第三段推断。即「谁？」。
_Avoid_: EC（正文中）、类别

**eventType**: 封闭事件动作类型。交互事件取 EventAction 22 项之一；SDK 异常态
曝光只取 SystemEventAction.EXPOSE。即「干了什么？」。
_Avoid_: ET（正文中）、动作

**eventPath**: 事件发生位置，形如 `组件[.实例名].控件[:文本]`。即「在哪？」。
_Avoid_: EP（正文中）、路径

**eventValue**: 事件伴随的可选业务值（如搜索词）。
_Avoid_: EV（正文中）、值

**eventCustom**: 事件的可选扩展对象，承载行上下文等结构化附加信息。
_Avoid_: 自定义字段、extra

**EventAction**: 规范约定的 22 个交互动作枚举（CLICK/SEARCH/DOWNLOAD/SUBMIT…），
eventType 的交互取值域。
_Avoid_: 动作枚举、事件类型表

**SystemEventAction**: SDK 自有的非交互动作；当前仅 EXPOSE，用于可选异常态曝光，
不计入 22 个规范交互动作。
_Avoid_: 自定义动作、扩展 eventType

**标识列**: 表格行的身份来源列，默认取首个非交互文本列，与当页行号一起构成无主键行的标识。
_Avoid_: 主键列、行标识字段

**就绪缓冲**: 平台 SDK 尚未就绪（或 init 尚未调用）期间暂存事件、就绪后按序补发的有界队列。
_Avoid_: 缓存、事件队列

**识别器注册句柄**: `registerRecognizer` 返回的注册所有权；记录是否注册成功并
提供幂等 `unregister`。成功注销恰好执行一次 teardown。优先级高者先运行，重名
不覆盖，`generic-dom` 永远最后兜底。
_Avoid_: 全局清空、隐式替换
