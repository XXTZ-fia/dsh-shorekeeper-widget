# 更新日志

本项目从上游 `dsh-whale-widget` 0.4.2 移植并独立发展，版本号从 **1.0.0** 重新起算。

## 1.0.0 — 首个独立版本

### 新增

- **启动动画**：打开 DSH 主界面时播放一段守岸人过场（星海底 + 立绘 + 标题 + 进度条），
  点击任意处或按 `Esc` / 空格 / 回车跳过；每个标签页只播一次，站内切页不重复。
  - 三种样式：`深海微光` / `星海夜幕` / `极简留白`
  - 时长 0.8–6.0 秒可调，默认 2.6 秒
  - 支持系统「减少动态效果」；开启后自动降级为 0.7 秒的静态过场
  - 入口：菜单 →「启动动画」开关 + 「设置」（时长 / 样式 / 预览）
- **备份与迁移**：菜单 →「备份与迁移」可把外观开关、泡泡配置、模型注册表与账本导出成一个 JSON，
  在另一台机器导入即可原样恢复。导出内容**不含任何密钥**（模型表里只有凭据名）。
  导入前会在同目录留一份 `*.before-import` 备份。
- **旧数据自动迁移**：首次启动时若发现上游 `dsh-whale-widget` 的数据（`.dshw-*` 文件、`whale-roles` /
  `whale-audio` / `whale-bubble-imgs` 目录），自动**复制**到本插件的新前缀下，不删旧文件、不覆盖已有新数据。
- **安装脚本** `install.ps1`：自动识别桌面端 / Web 形态，按当前形态给出可执行步骤。

### 变更

- 包名、插件 id、仓库名统一为 `dsh-shorekeeper-widget`；宿主插件名 `shorekeeper-balance-widget`。
- 路由前缀 `/dsh-whale/*` → `/dsh-shorekeeper/*`。
- 数据文件前缀 `.dshw-*` → `.skdw-*`；资源目录 → `shorekeeper-roles` / `shorekeeper-audio` / `shorekeeper-bubble-imgs`。
- 浏览器端全局前缀 `skdw*` / CSS 类 `skdwv*`，与上游并存时不打架。
- 环境变量 `DSHW_TRUSTED_HOSTS` / `DSHW_ADMIN_HOSTS` → `SKDW_TRUSTED_HOSTS` / `SKDW_ADMIN_HOSTS`。
- 立绘文件名 `DSniang1.png` / `DSniang02.png` → `shorekeeper.png` / `shorekeeper-alt.png`。
- 版本号 1.0.0；README / PROVENANCE / CHANGELOG 重写。

### 移除

- 上游 README 用的展示图（`DSH2.png`）—— 那是小鲸鱼题材，与本项目角色无关。

### 保留

- 上游 0.4.2 的全部既有能力：余额与峰谷定价、今日已用记账、每轮消耗、泡泡系统（模块 / 随机 / 图片 /
  并列加权）、提醒、音效与角色管理、多厂商余额与额度、Codex 本地统计等。
