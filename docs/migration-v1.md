# 第三轮迁移指南

本指南面向曾使用第三轮前候选平台适配器的集成方。稳定的
`init/track/destroy/EventAction` 及第一轮保留的顶层兼容导出没有删除。

## 平台配置

以前仅写 `{ platforms: { furion: {} } }` 会探测候选方法并使用临时 payload。
该行为没有可验证的 SDK 文档支撑，现已移除。迁移步骤：

1. 从平台所有者取得准确的 SDK 名称、版本、全局实例、就绪条件、上报签名、字段
   约束和上下文归属。
2. 实现 `PlatformSdkContract.isReady/report`，并用平台提供的 fixture 或沙箱对称
   验证成功、未就绪、抛错和 teardown。
3. 把 contract 放入对应平台配置；需要 SDK 自加载时改用 `script` 安全配置。
4. 在真实集成环境确认事件到达、字段含义和隐私审查后，才把该 contract 作为组织内
   的固定版本模块发布。

`cdnUrl` 暂时仍可用，但只接受 HTTPS，建议迁移为：

```ts
script: {
  url: verifiedReleaseUrl,
  allowedOrigins: [verifiedReleaseOrigin],
  integrity: verifiedReleaseIntegrity,
}
```

`appId` 不再被 SDK 猜测性地塞入 payload，只作为 `report` 第三个参数中的 context
提供；是否使用及目标字段由已核验 contract 决定。SDK 不再自动补 timestamp/page/
session/user/device。

## 组件库识别器

`registerRecognizer` 和 `unregisterRecognizer` 现为正式顶层 API。注册返回
`RecognizerRegistration`：

- priority 越高越先执行；相同 priority 保持注册顺序。
- 重名或 `generic` 保留名不会覆盖现有识别器，返回 `registered: false`。
- handle 与按名称注销均幂等；成功注销恰好调用一次 `teardown`。
- 注册不会随 SDK `destroy()` 自动清除，所有者必须显式注销。
- `generic-dom` 固定最后运行。

自动采集 root 现支持 `Document`、`Element` 和 `ShadowRoot`。checkbox、radio、
select 均只采集控件语义，不采集原始 value。

## 入口与弃用

本版本不增加 advanced 子入口。`createTracker`、`wireTracker`、`WiredSdk`、
`EventBuffer`、`ReportRouter` 继续从顶层导出并保持 deprecated 标记；是否在后续
主版本删除，必须先取得使用方清单并提供一个完整兼容周期。
