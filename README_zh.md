<div align="center">

![AuraTranslate — 让语言不再打断阅读](docs/assets/hero.svg)

[English](README.md) · **简体中文**

**原文与译文，就在眼前。**

在网页中双语阅读，在视频里跟上课程。<br>
连接自己的 AI 服务，也可以用免 Key 的 Google 翻译先试试网页翻译。

[![MIT 许可证](https://img.shields.io/badge/License-MIT-82cafa?style=flat-square)](LICENSE)
![Manifest V3](https://img.shields.io/badge/Extension-Manifest_V3-b19afa?style=flat-square)
![自选翻译 API](https://img.shields.io/badge/API-OpenAI_compatible-70e7c5?style=flat-square)

[快速开始](#快速开始) · [网页翻译](#网页翻译) · [视频工具](#视频工具) · [浏览器支持](#浏览器支持) · [开发](#开发)

</div>

AuraTranslate 是一款开源浏览器扩展，适合阅读外文文章、观看带字幕的课程。网页译文直接出现在原文旁边；视频工具把双语字幕、可搜索的字幕列表和 AI 总结带到播放器中。

| 功能 | 你可以做什么 |
| --- | --- |
| 网页翻译 | 双语对照或仅显示译文，保留链接与常见行内格式。 |
| 页面上下文 | 让 AI 先理解页面主题、建立共享术语表，再翻译各段。 |
| 划词翻译 | 选中词语或段落，点击选区旁的按钮查看译文；AI 会结合附近上下文判断含义。 |
| 生词本 | 收藏原文、译文、上下文和来源，搜索词条、保存笔记、标记已掌握，导入和导出备份。 |
| 视频字幕 | 将 YouTube 已有英文字幕、Google Drive 可访问的转写稿翻译为简体或繁体中文。 |
| 字幕列表与总结 | 在 YouTube 中搜索字幕、点击时间跳转、跟随播放，按需生成总结。 |
| 自选翻译服务 | 接入 OpenAI Completion、OpenAI Responses、Anthropic Messages 或 Gemini API，管理模型目录，为网页和字幕选择不同服务。 |
| 本地缓存 | 复用保存在浏览器中的译文与总结。 |

## 快速开始

### 1. 加载扩展

[下载源码 ZIP](https://github.com/cai2761m/auratranslate/archive/refs/heads/main.zip) 并解压，或克隆仓库：

```sh
git clone https://github.com/cai2761m/auratranslate.git
```

在桌面 **Chrome** 或 **Edge** 中：

1. 打开 `chrome://extensions` 或 `edge://extensions`。
2. 开启 **开发者模式**，点击 **加载已解压的扩展程序**。
3. 选择解压后包含 `manifest.json` 的文件夹。
4. 将 AuraTranslate 固定到工具栏，点击打开弹窗。

仓库已包含构建好的弹窗和设置页，**安装使用不需要 Node.js 或 npm**。Firefox 的安装方式不同，见[浏览器支持](#浏览器支持)。

### 2. 选择翻译服务

**先试试网页翻译：** 在弹窗选择 **Google 翻译 · 免 Key**，点击 **翻译当前网页**。无需填写密钥，但网络限制与接口限流可能影响可用性。

**使用 AI 网页翻译、视频字幕或总结：**

1. 打开 **设置 → 翻译服务**。
2. 点击 **添加自定义供应方**。
3. 选择供应方的 API 协议，填写接口地址、自己的 API Key，并添加至少一个完整模型 ID。
4. 在 **实时字幕** 中选择该供应方与模型。**沉浸式翻译** 默认沿用这一选择，也可以单独指定供应方和模型。

| 字段 | 填写内容 |
| --- | --- |
| 供应方名称 | 方便辨认的名字 |
| API 地址 | 与所选 API 协议对应的基础地址，示例见下表 |
| 密钥 | 你自己的 API Key |
| 模型目录 | 完整模型 ID，可另设显示名称；也可以获取模型列表或测试模型。 |

根据接口格式选择协议，不能只根据模型名称判断。不同协议使用不同的认证、请求内容与响应解析：

| API 协议 | 官方服务基础地址 | 生成接口 |
| --- | --- | --- |
| [OpenAI Completion](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) | 服务商提供的兼容接口基础地址 | `/chat/completions` |
| [OpenAI Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses) | `https://api.openai.com/v1` | `/responses` |
| [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create) | `https://api.anthropic.com/v1` | `/messages` |
| [Google Gemini](https://ai.google.dev/api/generate-content) | `https://generativelanguage.googleapis.com/v1beta` | `/models/{model}:generateContent` |

使用中转或本地服务时，填写该服务自己的基础地址并选择它支持的协议。兼容接口地址如 `https://api.example.com/v1`，会请求 `https://api.example.com/v1/chat/completions`；此地址仅作示例。也接受完整的生成接口地址。获取模型列表与测试模型同样按所选协议执行。[Ollama](https://docs.ollama.com/api/openai-compatibility) 可使用 OpenAI Completion，基础地址为 `http://localhost:11434/v1`，密钥可填写 `ollama` 等占位值。

Responses 与 Anthropic 的 JSON 输出模式使用结构化 Schema；所选模型或中转接口不支持时，请关闭该选项。

![翻译服务设置页，使用空密钥和示例模型展示](docs/assets/settings.png)

设置自动保存。**扩展不附带 API Key 或接口额度。** 翻译、模型测试、智能断句、页面上下文分析与新总结可能产生服务商费用。免 Key 的 Google 选项用于网页；视频翻译与总结使用你配置的 AI 服务。

### 3. 翻译网页或打开视频

- **网页：** 点击悬浮 **A**，或在弹窗点击 **翻译当前网页**。默认自动检测原文，翻译为简体中文。
- **YouTube：** 打开带英文字幕的视频，点击播放控制栏中的 AuraTranslate 图标，使用字幕设置、悬浮字幕列表和 AI 总结。
- **Google Drive：** 打开具有可访问转写稿的视频。扩展会短暂打开转写面板读取文本，再恢复面板原来的状态。

当前弹窗与设置页使用中文界面，文档中的按钮名称与界面一致。

## 网页翻译

AuraTranslate 优先处理当前可见文字，匹配的缓存译文先显示。对于提取器支持的页面结构，标题、列表、链接与行内代码保留原有排版。

![翻译网页，再隐藏和恢复双语内容的操作动图](docs/assets/immersive-demo.gif)

[查看静态截图](docs/assets/immersive-preview.png)。

- **对照原文：** 使用弹窗中翻译按钮旁的图标，切换双语对照与仅译文。
- **隐藏与恢复：** 翻译完成后，再点悬浮 A 即可隐藏或显示已有译文。
- **按网站自动翻译：** 展开 **更多功能**，选择跟随全局、自动翻译当前网站或不自动翻译。全局自动翻译默认关闭。
- **关闭悬浮小球：** 点击小球上的关闭按钮，选择本次关闭（刷新后恢复）或禁用本网站；也可在 **设置 → 沉浸式翻译 → 禁用小球的网站** 中管理域名。
- **统一术语：** 开启 AI 深度理解上下文后，各批次共享页面术语表。首次翻译会增加分析步骤，长页面使用抽样摘录。

悬浮 A 自动适配页面背景，支持拖动、键盘操作与系统的减少动画偏好。

<details>
<summary><strong>查看极光小球效果</strong></summary>

![极光小球在深浅色背景下，从待命到翻译中、再到完成的状态动图](docs/assets/aurora-demo.gif)

动图放大展示控件，实际大小为 44 px。[查看静态截图](docs/assets/aurora-preview.png)。

</details>

## 划词翻译与生词本

1. 在网页中选中单词、短语或段落，点击选区旁的翻译图标。每次最多 3000 个字符。
2. 划词翻译沿用弹窗中的网页翻译服务和语言设置。选中文字本身不会发起接口请求；AI 翻译会携带附近的上下文。
3. 点击译文浮窗中的 **收藏到生词本**，保存原文、译文、上下文、来源链接和收藏时间。
4. 从弹窗的 **生词本** 或 **设置 → 生词本** 打开收藏列表，可搜索、添加笔记、标记已掌握、删除及撤销最近一次删除。

生词本保存在当前浏览器的本地扩展存储中，最多保存 5000 条。相同原文和译文会去重，同一单词的不同释义分别保留。**导出 JSON** 可完整备份，**导入 JSON** 合并词条且保留已有学习状态；**导出 CSV** 可在表格软件中查看。清空翻译缓存不会删除生词本。

划词翻译默认开启，可在 **设置 → 划词翻译** 关闭。输入框和可编辑区域不会显示划词翻译按钮。

默认工具栏为小巧的 28px 图标。在 **设置 → 划词翻译 → 自定义划词工具栏** 中，可添加复制、生词本和关闭按钮，调整按钮顺序、28/32/40px 尺寸、文字标签和选区上方或下方的位置。修改自动保存并同步到已打开的网页，支持实时预览和恢复默认。

## 视频工具

AuraTranslate 翻译**已有字幕或转写稿**，不会录音，也不会为无字幕视频进行语音转写。

![课程示意画面上的双语字幕](docs/assets/subtitles.png)

字幕默认方向为**英语 → 简体中文**，也支持繁体中文。拖动字幕叠加层可调整位置，在设置中可修改字号。

在 **YouTube** 播放控制栏中打开 AuraTranslate：

| 工具 | 操作 |
| --- | --- |
| 视频字幕 | 开启或关闭翻译字幕叠加层。 |
| 字幕样式 | 选择双语、仅译文或仅原文，调整字号、文字颜色和背景不透明度，重置位置。 |
| 悬浮字幕列表 | 搜索字幕、跟随播放、点击时间跳转、拖动面板；关闭翻译字幕后仍可使用。 |
| AI 总结 | 点击 **生成总结**，基于已有字幕生成内容总结并复制结果。 |

打开总结面板只检查本地缓存。生成新总结时调用所选字幕供应方与模型，失败后不会自动重复请求。目前整段总结最多接受 **12 万字符、20000 条字幕**。

**Google Drive** 的字幕翻译依赖播放器中可访问的转写稿。上表中的悬浮字幕列表与总结控件用于 YouTube。

截图与动图使用原创演示素材、示例文字和模拟接口响应，通过真实 UI 或渲染脚本制作；用于展示交互，不代表真实 API 速度、翻译质量或设备兼容性。详见[素材生成说明](docs/assets/README.md)。

## 浏览器支持

| 浏览器 | 安装方式与当前范围 |
| --- | --- |
| 桌面 Chrome / Edge | 按快速开始中的步骤，通过开发者模式加载解压后的仓库文件夹。 |
| 桌面 Firefox | Manifest 声明最低版本 **140+**。开发时可[临时加载](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)，重启 Firefox 后失效；常规分发需要 Mozilla 签名包。 |
| Firefox for Android | Manifest 声明最低版本 **142+**。长期安装需要签名包，见 [Mozilla 安装说明](https://extensionworkshop.com/documentation/publish/install-self-distributed/)；源码测试使用 [Mozilla 的 Android 开发流程](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/)。 |

**源码 ZIP 不是经过 Mozilla 签名的 XPI。** Manifest 的最低版本声明不代表所有设备均已验证，Android 兼容性仍需要真机测试。扩展作用于浏览器内的网页，包括移动版 YouTube 页面，不会修改 YouTube 原生 App。

## 默认设置与接口用量

| 设置 | 默认值与可选项 |
| --- | --- |
| 网页显示 | 双语对照，也可仅显示译文 |
| 网页自动翻译 | 关闭，可按全局或网站配置 |
| 字幕翻译范围 | 省 token 模式，预翻译未来 **2 分钟**；可选 1 / 2 / 3 分钟或整片 |
| 字幕字号 | `1.00×`，范围 `0.30×–3.00×` |
| AI 智能断句 | 开启，调用字幕 API，将零碎字幕合并为句子 |
| 字幕文本纠错 | 开启，让 AI 修正已有字幕中的明显错误 |
| 保留专业术语原文 | 开启，在译文旁保留对应原文术语 |
| AI 深度理解上下文 | 开启，先分析页面主题与术语，成功的分析结果会缓存 |
| JSON 输出模式 | 开启，接口不兼容时可关闭 |
| 界面外观 | 跟随系统，也可选择亮色或暗色 |

省 token 模式处理当前播放位置附近的字幕，跳转后调整待处理任务；整片模式先处理附近内容，再翻译其余部分。已经发出的请求仍可能完成并产生费用。

切换显示模式、修改字幕大小、隐藏或恢复译文会复用已完成的结果。更换模型、接口、语言、原文或相关处理设置，可能需要重新生成。缓存有容量限制，较旧记录可能被淘汰。

## 隐私与权限

无需注册 AuraTranslate 账号。网页文字与字幕会发送到你选择的翻译服务。AI 智能断句将字幕发送到字幕服务；深度理解上下文将页面标题与原文摘录发送到网页 AI 服务。Google 模式将网页文字发送到 Google 公开翻译接口，请求不携带浏览器 Cookie。

设置、API Key、字幕位置、译文和总结保存在**浏览器扩展本地存储**中。扩展没有对 API Key 额外加密，密码输入框只遮挡显示内容。

| 权限 | 用途 |
| --- | --- |
| `storage` | 本地保存设置、缓存与生词本 |
| HTTP / HTTPS 网站访问 | 读取网页文字和字幕、显示译文、访问配置的服务，包括本地 API 地址 |

在 **设置 → 通用设置 → 清空翻译缓存** 中可删除已保存的结果，后续翻译可能重新请求接口。

## 常见问题

| 现象 | 检查方法 |
| --- | --- |
| 安装或更新后扩展未出现 | 在扩展管理页重新加载，再刷新已经打开的标签页。 |
| 看不到悬浮 A | 检查禁用小球的网站列表和网站权限。浏览器内部页面不在扩展的 HTTP/HTTPS 作用范围内。 |
| AI 接口报错 | 检查基础地址、完整模型 ID、API Key 和模型权限；接口拒绝 JSON 输出模式时关闭该选项。 |
| Google 翻译失败 | 检查网络与限流情况，或切换到已配置的 AI 服务。 |
| 视频没有翻译字幕 | 开启视频字幕，确认视频有英文字幕或可访问的 Drive 转写稿。 |
| 部分网页文字没有翻译 | 表单、代码块与排除区域会跳过；图片、画布、嵌套框架或不支持的页面结构中的文字可能无法提取。 |

如果网页请求超时且结果不明，扩展会检查晚到的缓存结果，不会自动重发该请求。已经完成的段落继续保留。切回标签页可恢复结果，必要时手动继续缺失内容。已经发往服务商的请求仍可能完成并产生费用。

## 开发

弹窗、设置页以及所有页面内 UI（字幕层、播放器工具、划词工具栏与卡片、沉浸式悬浮控件）均使用 **React + esbuild** 编写。页面内组件共用同一份 React 运行时（`ui/content/vendor.js`），因此同一页面加载多个内容脚本时只会初始化一次。控制器保留对宿主元素的所有权（拖拽几何、定位、Shadow Root、YouTube 控制栏），React 负责渲染其中的结构与事件。翻译引擎、字幕发现、缓存与后台脚本仍使用原生 JavaScript。

Node.js 需满足锁定的 jsdom 依赖要求：`^22.22.2 || ^24.15.0 || >=26.0.0`。

```sh
npm ci
npm run build
npm test
npm run test:ui:browser
```

浏览器检查需要已安装的 Chrome。设置 `UI_BROWSER=msedge` 可使用已安装的 Edge；PowerShell 中使用 `$env:UI_BROWSER = "msedge"`。如果 PowerShell 阻止 `npm.ps1`，请改用 `npm.cmd`。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 监听并重新构建 React 界面 |
| `npm run build:check` | 检查已提交的 UI 产物与源码是否一致，`npm test` 前也会自动执行 |
| `npm run preview` | 在 `http://127.0.0.1:5174` 预览弹窗和设置页，模拟浏览器 API |
| `npm run test:ui:browser` | 在浏览器中检查真实 UI、悬浮控件、播放器工具和设置页 |
| `npm run test:vocabulary:browser` | 在独立 Chrome 中加载真实扩展，检查划词、生词本、备份及移动端布局；翻译服务使用本地测试数据 |
| `npm run icons` | 重新生成扩展图标 |

| 目录 | 内容 |
| --- | --- |
| `ui/` | React 弹窗、设置页与页面内 UI 组件（`ui/content` 共用一份 React 运行时） |
| `src/` | 网页提取、翻译请求、字幕、缓存与 UI 控制器 |
| `src/ui/` | 由内容脚本加载的页面内 React 构建产物 |
| `popup/`、`options/` | 扩展页面与生成的 UI 产物 |
| `scripts/` | 构建、预览、浏览器检查、基准测试与素材生成 |
| `test/` | 自动化测试与样例 |
| `docs/assets/` | README 图片与动图 |

请修改 React 源码，再重新构建并提交界面产物；不要直接修改生成的 `popup/popup.js`、`options/options.js` 或 `src/ui/*.js`。本地预览和浏览器检查使用模拟存储与接口响应，真实服务商、网站与移动设备验证需要另行执行。

## 参与贡献

欢迎[提交 Issue](https://github.com/cai2761m/auratranslate/issues)，附上页面地址、浏览器及版本、复现步骤和错误文本。日志与截图中请移除 API Key 和私人内容。也欢迎提交聚焦的修复、文档改进与可复现样例。

本项目采用 [MIT 许可证](LICENSE)。
