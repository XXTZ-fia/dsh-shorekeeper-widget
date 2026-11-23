# 素材来源与许可范围（PROVENANCE）

本仓库的**代码**按 MIT 许可（见 [`LICENSE`](LICENSE)）。`assets/` 下的**美术与音频素材不是 MIT**，按下面说明「原样提供」。

## 一、许可范围

| 范围 | 许可 |
|---|---|
| `lib/`、`cordis.patch.yml`、`package.json`、`tools/`、文档 | **MIT**（见 `LICENSE`） |
| `icon.png`（插件列表图标） | **不适用 MIT**：与 `assets/` 同为随包素材，仅用于标识本插件；不授予再许可。 |
| `assets/**`（立绘、动图、音效） | **不适用 MIT**：随插件 as-is 分发，仅用于运行本插件；不授予再许可，也不声明为原创作品。 |

划分原因：代码可以明确授权，而美术素材的来源与权利状态往往无法逐一举证 —— 与其给一个站不住的授权，不如如实标注范围，并承诺收到权利主张就处理（见第四节）。

## 二、与上游的关系

本项目是 [`MeteorNOX/DeepSeek-Balance-Whale-Widget`](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（MIT，0.4.2）的**独立衍生项目**：

- 宿主插件（`lib/index.js`）与浏览器端（`assets/shorekeeper-widget.js`）基于上游 0.4.2 移植；
- 上游的 MIT 版权声明保留在 `LICENSE` 中；
- 本项目更换了包名、插件 id、路由前缀（`/dsh-shorekeeper/*`）、数据文件前缀（`.skdw-*`）与资源目录名，
  以便与上游**同时安装**时互不覆盖；
- 新增了启动动画、备份与迁移、旧数据自动迁移等能力（见 `CHANGELOG.md`）。

上游的完整生成说明（架构、行为规格、踩坑结论）见其仓库的 `whale-widget-prompt.md`，本项目不再重复。

## 三、逐项素材来源

| 文件 | 来源 / 说明 |
|---|---|
| `shorekeeper.png`（挂件本体立绘） | 由项目维护者提供的**同人向图片**，经挑选与裁切。 |
| `shorekeeper-alt.png` | 同上（备用整图）。 |
| `icon.png`（256×256 图标） | 由上述立绘裁切 / 缩放而来。 |
| `bubble-petpet.gif`、`bubble-money1.gif` | 内置泡泡动图素材（沿用上游随包素材）。 |
| `Ya1.mp3` / `Ya2.mp3`、`D1.mp3` / `D2.mp3` | 内置按压 / 松开音效（沿用上游）。 |
| `minecraft-exp-orb.wav`、`task-end-a.wav` | 任务结束音（沿用上游）。 |
| `approve-default.wav`、`ask-default.wav`、`cost-default.wav` | 提示音（沿用上游）。 |
| `startup-hd.mp4` | **启动影片**（1600×900 / 60fps）。由本地「守岸人主题」插件里的 10 秒原片（30fps）插帧、调色、重编码而来。 |
| `startup-sd.mp4` | 同一段影片的 1280×720 / 30fps 版本，供低配设备与省流量模式。 |
| `startup-poster.jpg` | 影片首帧海报（约 90 KB），用于视频解码前的即时画面。 |

> **角色形象声明**：`shorekeeper.png` / `shorekeeper-alt.png` / `icon.png` 描绘的角色「守岸人」出自游戏《鸣潮》，
> 其形象与相关权利归 **库洛游戏（Kuro Games）** 所有。本仓库随包分发这些图片**仅用于个人、非商业的界面装饰**，
> 不代表权利人授权，也不构成任何形式的官方关联。你若再分发或商用，请自行确认授权。
>
> **启动影片声明**：`startup-hd.mp4` / `startup-sd.mp4` / `startup-poster.jpg` 同样来自《鸣潮》的影像素材，
> 版权归库洛游戏所有，随包分发的用途与上面图片一致（个人、非商业的界面装饰）。这三份文件**不适用 MIT**。

## 四、元数据清理

随包 PNG 在入库 / 打包前会剥离 `eXIf` / `iTXt` / `tEXt` / `zTXt` 等元数据块，只保留渲染必需的块
（`IHDR` / `sRGB` / `gAMA` / `pHYs` / `IDAT` / `IEND`），避免把设计工具的账号、模板名等信息带进公开发布的仓库。

## 五、权利主张 / Takedown

若你认为 `assets/` 中有素材侵犯了你的权利，请在本仓库开一条 issue，说明**文件名**与**依据**；
核实后会**立即替换或移除**，不附加其它条件。也欢迎直接提供可自由再分发的替代素材。
