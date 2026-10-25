# B站海外直播线路修复（Bilibili Live Route Repair）

用于**部分海外网络下，B站网页直播起播失败**的实验性油猴脚本。保留原来的直播格式、编码、画质和服务器列表，为特定 fMP4 线路加入一个备用 CDN。

**目前有一例德国移动网络经 CPE 上网的恢复播放反馈。它不是所有海外直播问题的通用修复，也没有足够数据估计这类故障的发生率。**

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 在 Chrome / Edge 的扩展详情里确认脚本管理器获准运行用户脚本；具体选项取决于浏览器版本。
3. 点击 **[安装脚本](https://raw.githubusercontent.com/Linwj0207/bilibili-live-route-repair/main/bilibili-live-route-repair.user.js)**，在脚本管理器的安装页面确认安装。
4. 使用普通浏览器窗口打开 B站直播间，刷新页面。

如果安装链接显示代码而没有出现安装页面，可以在脚本管理器里新建脚本，复制该文件全部内容，替换默认示例后保存。

如果之前手动安装过 `0.2.0` 的“B站直播线路临时修复”，请先停用旧脚本，再安装 GitHub 版。只启用一份。

### 与其他工具配合

初次测试时，建议关闭其他脚本的直播加速功能，包括线程撕裂者的“直播加速”。其普通投稿视频加速可以继续保留。确认恢复播放后，再单独测试是否需要叠加其他功能。

本脚本只在 `live.bilibili.com` 生效，不处理普通投稿视频，也不提供 Windows 原生客户端补丁。

## 它处理哪一种问题？

已确认的个案表现为：

- 普通投稿视频正常，多个直播间无法播放，曾显示 `92002`。
- 无痕窗口、播放器主线及各备线均未解决。
- 直播播放地址接口正常，但分配到的部分媒体服务器连接超时。
- 同一直播的 `cn-gotcha204` fMP4 播放列表及视频数据样本可取得。
- 加入该备用节点后，使用者确认恢复播放。

这些现象支持“当前网络到部分直播节点的连接有问题”的判断，不能据此确定是运营商、终端网络设备还是 CDN 服务端导致。

`92002` 本身不能用来确诊这个问题。网站接口异常、账号权限、编码兼容性等情况需要另行排查。

## 工作原理与边界

脚本处理播放地址接口和页面中预载的播放信息。只有同时符合以下条件才修改：

1. 接口没有返回业务错误，且包含 HLS 的 `fmp4` 格式。
2. 视频路径属于 `/live-bvc/`。
3. 原服务器列表包含 `d1--ov-gotcha207.bilivideo.com` 或 `d1--ov-gotcha207b.bilivideo.com`。
4. 列表中尚未包含备用服务器。

满足条件时，将 `https://d1--cn-gotcha204.bilivideo.com` 加到对应 fMP4 服务器列表最前面，沿用原路径和查询参数。原服务器仍保留供播放器回退。

脚本保留全部原有流格式、编码、画质及请求参数，不强制 TS，不提供会员、登录或地区权限解锁。其他服务器、FLV、TS 和不符合结构的响应原样交给播放器。

**备用节点是固定的，不会自动测速、探测所有 CDN 或自动寻找新节点。** 不同直播、地区、时段的签名接受情况和节点可用性可能变化。播放器是否实际尝试备用节点、以及失败后是否回退，由播放器决定。

相关节点及接口行为不是 B站提供的稳定兼容承诺，后续变更可能使脚本失效。

## 怎么判断是否生效？

页面左下角会短暂显示状态：

- **等待直播播放地址**：脚本已载入，尚未处理到符合条件的信息。
- **已加入 fMP4 备用节点**：已修改播放地址列表。它不代表播放器已选择该节点或已经播放成功。

最终以出现画面并持续播放为准。这个修复不依赖 BTR 的线程数。

## 无效时怎么办？

1. 确认只有一份本脚本在运行，并刷新直播页面。
2. 初次排查先关闭其他直播加速或播放地址改写脚本。
3. 如果持续显示“等待直播播放地址”，可能没有命中目标线路，也可能页面或接口已变化。
4. 如果已加入备用节点但仍失败，请停用本脚本、刷新，再与原始情况对比。
5. 通过 [问题反馈](https://github.com/Linwj0207/bilibili-live-route-repair/issues/new/choose) 提供现象和已脱敏的信息。

请勿公开 Cookie、访问令牌、授权请求头、完整的媒体播放 URL 或未脱敏的网络记录。

### 卸载

在脚本管理器中停用或删除本脚本，然后刷新直播页面。脚本不修改系统代理、DNS 或路由器配置。

## 隐私与更新

- 脚本没有遥测、远程依赖、数据上报服务器或额外测速请求。
- 修改后的媒体请求由原播放器发往上述 B站 CDN。
- 安装的 GitHub 版包含指向本仓库的更新地址，由脚本管理器处理更新检查；这与脚本内的数据上报无关。
- 项目不包含使用者的账号截图、Cookie、真实签名播放地址或私人浏览记录。

## 验证与开发

详细证据与限制见 [验证记录](docs/validation.md)。自动测试使用合成数据，不访问 B站网络，不等同于真实直播播放验证。

需要 Node.js 20 或更新版本，无需安装项目依赖：

```sh
npm run check
npm test
```

目前自动检查覆盖请求透传、原格式/编码/画质保留、Fetch / XHR、预载信息、异常响应和重复处理等情况。GitHub Actions 在推送和拉取请求上运行相同检查。

欢迎提供其他国家、网络或浏览器的可复现反馈，详见 [贡献说明](CONTRIBUTING.md)。

## 相关项目

- [wronps/BilibiliAbroad](https://github.com/wronps/BilibiliAbroad)：海外观看与 CDN 配置经验。
- [MrTangLuyao/Bilibili-thread-ripper](https://github.com/MrTangLuyao/Bilibili-thread-ripper)：视频分片下载调度与实验性直播加速。

本项目针对的是播放地址候选节点这一较窄的环节。它是独立维护的辅助脚本，不代表上述项目或 B站官方。不同工具在某一个网络中没有解决问题，不代表对其他使用者无效。

## English summary

An experimental userscript for a narrow class of Bilibili web live-stream startup failures on overseas networks. It prepends an official fallback CDN to matching HLS fMP4 entries while retaining all original protocols, formats, codecs, qualities, signatures and fallback URLs.

Current matching hosts: `ov-gotcha207` / `ov-gotcha207b`; fallback: `cn-gotcha204`. There is one reported successful recovery on a German mobile network via CPE. Broader compatibility and long-term reliability are unverified. No telemetry or additional CDN probing is performed. This is not a permissions or region-unlocking tool.

## 许可证

[MIT](LICENSE)。
