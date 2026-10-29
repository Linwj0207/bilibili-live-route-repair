# B站海外直播线路修复（Bilibili Live Route Repair）

针对部分海外网络中 **B站海外直播黑屏、92002、无法播放** 的实验性油猴脚本，处理其中由部分媒体线路不可用引起的情况。**0.3.0 改用播放地址接口当次提供的官方 FLV 线路**，保留所选线路原有的编码、画质、服务器和签名。

**目前有一例德国移动网络经 CPE 上网的恢复播放反馈；同一使用者确认 0.3.0 解决了旧方案失效后的再次故障。它不是所有海外直播问题的通用修复，也没有足够数据估计这类故障的发生率。**

## 安装或更新

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 在 Chrome / Edge 的扩展详情里确认脚本管理器获准运行用户脚本；具体选项取决于浏览器版本。
3. 点击 **[安装 / 更新脚本](https://raw.githubusercontent.com/Linwj0207/bilibili-live-route-repair/main/bilibili-live-route-repair.user.js)**，在脚本管理器的安装页面确认安装或更新。
4. 确认版本为 `0.3.0`，使用普通浏览器窗口打开 B站直播间，刷新页面。

如果安装链接显示代码而没有出现安装页面，可以在脚本管理器里新建脚本，复制该文件全部内容，替换默认示例后保存。

GitHub 版保留原名称、命名空间和更新地址，已有安装可以通过脚本管理器检查更新。如果之前手动安装过名为“B站直播线路临时修复”的本地版，请先停用该版本，再安装 GitHub 版。**只启用一份。**

### 与其他工具配合

初次测试时，建议关闭其他脚本的直播加速功能，包括线程撕裂者的“直播加速”。其普通投稿视频加速可以继续保留。确认恢复播放后，再单独测试是否需要叠加其他功能。

本脚本只在 `live.bilibili.com` 直播页面及其同源播放器 iframe 生效，不处理普通投稿视频，也不提供 Windows 原生客户端补丁。

## 它处理哪一种问题？

已确认的个案表现为：

- 普通投稿视频正常，多个直播间无法播放，曾显示 `92002`。
- 无痕窗口、播放器主线及各备线均未解决。
- 直播播放地址接口正常，但部分默认 fMP4 媒体服务器连接超时。
- 旧版加入 `cn-gotcha204` 备用节点后曾恢复播放；再次故障时，该备用节点在检查中返回 HTTP 403。
- 同次接口返回的官方 FLV 线路可读取并解码，0.3.0 改用该线路后，独立 Chrome 与使用者实际浏览器均恢复播放。

这些现象支持“当前网络下部分媒体线路不可用”的判断，不能据此确定是运营商、终端网络设备、CDN 服务端还是签名校验导致。

`92002` 本身不能用来确诊这个问题。网站接口异常、账号权限、编码兼容性等情况需要另行排查。

## 工作原理与边界

脚本处理播放地址接口和页面中预载的播放信息。只有响应成功，且包含以下条件的线路时才筛选播放选项：

1. 协议为 `http_stream`，格式为 `flv`。
2. 至少有一项 AVC 编码，其媒体路径属于 `/live-bvc/`。
3. 该 AVC 编码的服务器列表非空，均为 HTTPS 的 `bilivideo.com`、`bilivideo.cn` 或 `bilivideo.net` 域名，并有原始查询参数字段。

满足条件时，只向播放器提供符合条件的 FLV 格式，移除响应中的 HLS 等其他选项，避免播放器继续选择故障线路。**保留所选 FLV 的原编码列表、画质、服务器、路径和签名；不同格式提供的画质选项和延迟可能不同。** 缺少合适 FLV 或已经只有目标 FLV 时保留原响应。

脚本不修改发往播放接口的请求参数，不缓存签名地址、不固定 CDN 主机、不自动测速，也不强制 TS。它不提供会员、登录或地区权限解锁。

播放地址来自每次接口响应；接口分配到 FLV 并不代表该线路在所有网络可用。B站接口和播放器行为变化仍可能使脚本失效。

## 怎么判断是否生效？

页面左下角会短暂显示状态：

- **直播线路修复 0.3：等待直播播放地址**：脚本已载入，尚未筛选到符合条件的信息。
- **直播线路修复 0.3：已选用官方 FLV 线路**：播放选项已筛选。它不代表媒体已连接成功或画面已经播放。

最终以出现画面并持续播放为准。这个修复不依赖 BTR 的线程数。如果仍看到“已加入 fMP4 备用节点”，说明旧版还在运行。

## 无效时怎么办？

1. 确认版本为 `0.3.0`，只有一份本脚本在运行，并刷新直播页面。
2. 初次排查先关闭其他直播加速或播放地址改写脚本。
3. 如果持续显示“等待直播播放地址”，可能没有合适的 FLV，或脚本未进入播放器 iframe，也可能页面或接口已变化。
4. 如果已选用 FLV 但仍失败，请停用本脚本、刷新，再与原始情况对比。
5. 通过 [问题反馈](https://github.com/Linwj0207/bilibili-live-route-repair/issues/new/choose) 提供现象和已脱敏的信息。

请勿公开 Cookie、访问令牌、授权请求头、完整的媒体播放 URL 或未脱敏的网络记录。

### 卸载

在脚本管理器中停用或删除本脚本，然后刷新直播页面。脚本不修改系统代理、DNS 或路由器配置。

## 隐私与更新

- 脚本没有遥测、远程依赖、数据上报服务器或额外测速请求。
- 媒体请求由原播放器发往当次播放接口提供的 B站 CDN。
- 安装的 GitHub 版包含指向本仓库的更新地址，由脚本管理器处理更新检查；这与脚本内的数据上报无关。
- 项目不包含使用者的账号截图、Cookie、真实签名播放地址或私人浏览记录。

## 验证与开发

详细证据与限制见 [验证记录](docs/validation.md)。14 项自动测试使用合成数据，不访问 B站网络，不等同于真实直播播放验证。另已在独立 Chrome 中验证实际赛事页面持续播放超过一分钟，并收到使用者恢复播放的反馈。

需要 Node.js 20 或更新版本，无需安装项目依赖：

```sh
npm run check
npm test
```

目前自动检查覆盖官方 FLV 筛选、所选流数据保留、请求透传、Fetch / XHR、预载信息、异常响应、每次请求的新地址，以及赛事页同源空白 iframe。GitHub Actions 在推送和拉取请求上运行相同检查。

欢迎提供其他国家、网络或浏览器的可复现反馈，详见 [贡献说明](CONTRIBUTING.md)。

## 相关项目

- [wronps/BilibiliAbroad](https://github.com/wronps/BilibiliAbroad)：海外观看与 CDN 配置经验。
- [MrTangLuyao/Bilibili-thread-ripper](https://github.com/MrTangLuyao/Bilibili-thread-ripper)：视频分片下载调度与实验性直播加速。

本项目针对播放选项和媒体线路选择。它是独立维护的辅助脚本，不代表上述项目或 B站官方。不同工具在某一个网络中没有解决问题，不代表对其他使用者无效。

## English summary

An experimental userscript for some Bilibili web live-stream startup failures on overseas networks. Version 0.3.0 selects official FLV entries from each successful play-info response when suitable AVC media URLs are present. It removes other format options while preserving the selected FLV entries, codecs, qualities, servers, paths and signatures. Outgoing API requests remain unchanged; no fixed CDN host, telemetry or additional probing is used.

The former fixed fMP4 fallback stopped working in the reported case. The FLV update restored playback for the same user on a German mobile network via CPE. Playback was also verified for over one minute in an isolated Chrome session. Broader compatibility and long-term reliability are unverified. This is not a permissions or region-unlocking tool.

## 许可证

[MIT](LICENSE)。
