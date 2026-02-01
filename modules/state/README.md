# @webauto/state

WebAuto 统一状态管理模块（唯一实现）。

## 职责

- 统一状态文件落盘与原子写入（atomic write）
- 统一下载目录路径解析（跨平台：macOS/Windows/Linux）
- 提供小红书采集任务的 `.collect-state.json` **唯一 schema + 兼容迁移**

> UI 只做状态展示/参数输入；业务执行仍由 scripts + blocks 完成。UI 读取状态时也应复用本模块（或通过调用脚本间接复用）。

## 状态文件

- 小红书采集任务状态：`~/.webauto/download/xiaohongshu/{env}/{keyword}/.collect-state.json`

## 开发

- 单测：`npm run test:modules:unit`
- 覆盖率：`npm run test:state:coverage`

