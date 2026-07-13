# 固定版本发布检查清单

每个版本使用新的 `event-tracking.v<version>.js` 文件名，不覆盖旧文件。

## 契约与变更

- [ ] 版本号与产物文件名一致，迁移说明和 changelog 已审阅。
- [ ] 顶层稳定、扩展、deprecated API 变化均有快照测试和兼容说明。
- [ ] EventAction/EventType、事件字段、生命周期、隐私和 diagnostics 契约未漂移，
      或已有批准的 ADR 与迁移路径。
- [ ] Furion/UEM contract 来自指定版本的可验证文档；没有文档时保持外部阻塞，
      不添加候选方法或临时映射。
- [ ] 平台脚本 URL、origin、SRI、CSP/CORS/referrer policy 与发布环境一致。
- [ ] 组件库识别器有真实库版本、最小 DOM fixture、浏览器范围和 teardown 测试。

## 自动验证

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm run test:unit`
- [ ] `npm run test:e2e`
- [ ] `npm run build`
- [ ] `npm run smoke`
- [ ] `dist/index.d.ts`、IIFE 与 ESM 顶层 API 快照一致。

## 集成与回滚

- [ ] 在 Furion/UEM 官方沙箱或受控真实环境执行成功、未就绪、脚本失败和双平台 smoke。
- [ ] 检查 payload 不含未批准的 query/hash/user/session/device 或未脱敏文本。
- [ ] 至少一个真实共享组件库页面完成 checkbox/radio/select、ShadowRoot 和表格行操作验证。
- [ ] CDN 上传使用不可变路径；旧固定版本仍可访问。
- [ ] 记录采用方、升级窗口、回退到上一固定文件名的步骤和负责人。
