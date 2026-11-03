# Super Assintant 前端

React + TypeScript + Vite，独立运行的本地个人助手界面。

采用 Warm Neumorphism（温润新拟物）设计系统，默认暖灰与陶土橙，可在设置切换浅深主题。
使用现有真实接口，不包含演示任务或虚构执行过程。完整说明见 [前端工作台](../docs/frontend-workbench.md)，后端缺项与优化顺序见 [八项能力核查](../docs/capability-audit.md)。

## 启动

先在项目根目录启动后端：

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

另开终端：

```powershell
cd front
npm install
npm run dev
```

浏览器打开 http://localhost:5173 。页面需通过开发服务打开，不支持双击 HTML。
开发服务默认监听 `0.0.0.0:5173`，同一局域网的设备可访问
`http://本机局域网IPv4:5173`（运行 `ipconfig` 查看连接 Wi-Fi 或网线的适配器地址）。
修改此配置后需重启 `npm run dev`。Windows 若提示防火墙访问，请允许当前可信局域网访问；
若无法连接，检查 TCP 5173 的入站规则以及路由器是否启用了访客网络或设备隔离。
手机访问可显式运行 `npm run dev:lan`；保持该终端运行，手机使用电脑的 Wi-Fi IPv4 地址，不能使用 `localhost`、`127.0.0.1` 或 `0.0.0.0`。完整排查见 [手机访问说明](../docs/mobile-access.md)。
后端仍只需监听 `127.0.0.1:8000`，局域网请求通过 Vite 代理转发。
默认通过 Vite 把 `/api/*` 请求去掉 `/api` 前缀后转发到 `http://127.0.0.1:8000`。
如需更换后端，将 `.env.example` 复制为 `.env.local` 并调整 `BACKEND_URL`，然后重启开发服务。
此变量只用于开发服务器；不要把模型密钥放入前端配置。

## 使用范围

- 默认知识库模式，可切换普通聊天；同一服务器会话延续上下文，知识库每轮重新检索。
- 侧栏支持折叠、已加载会话标题搜索；顶部全局搜索可定位会话、上传文档及入库任务。页面使用 hash 路由，刷新可恢复位置。
- 从输入区“全部资料”选择已入库文档，或在文件库点击“用于问答”；新建/切换会话会清除临时检索范围。重试始终复用原请求范围。
- 会话及引用保存在服务器 SQLite，局域网设备共享；浏览器只保留草稿、模式、选中会话和待核对请求标识。较早历史整理为可查看的摘要。
- 旧 localStorage 会话通过“导入本机旧对话”手动导入，不自动上传或清除原记录。删除会话会从服务器删除，其他设备同步生效。
- 输入区附件入口和文件库均可上传资料。任务中心、文件库与详情共享每两秒刷新的服务器状态；支持搜索、筛选、列表/网格、信息详情及失败重试。原文件保存在项目 data/uploads，状态保存在 data/documents.sqlite3；目前无原文件预览、下载和删除接口。
- 请求错误真实显示，不用演示答案替代；输入期间支持中文输入法和 Shift+Enter 换行。
- Markdown 不启用原始 HTML；引用编号可打开原文面板。
- 回答支持复制、继续追问和浏览器 Markdown 导出，代码块可单独复制；这不会创建服务器生成产物记录。
- 当前使用非流式 API，所以显示“正在处理”，不伪造检索或生成阶段。
- Agent 执行、MCP、通用任务、跨会话长期记忆、自动化及媒体生成尚未接入，设置页面明确说明能力边界。

## 验证

```powershell
npm test
npm run build
# 浏览器接口夹具回归：自动启动并关闭 Vite；不调用真实模型
node scripts/check-workbench.mjs
```

构建输出在 `dist/`，生产部署需要另行配置 API 反向代理；本次提供本地开发运行方式。

界面回归覆盖 360–1440px 的布局、主题、引用与摘要、检索范围、代码复制、Markdown 下载和导航焦点，截图与报告位于 `artifacts/workbench/`。默认使用本机 Chrome；可通过 `CHROME_PATH` 指定路径。指定 `FRONT_URL` 时使用已有服务，不自动启动 Vite。

先在项目根目录执行 `python -m scripts.check_live_conversations` 完成真实模型联调（会产生模型请求并保留测试会话）。
启动前后端后可运行 `node scripts/browser-check.mjs`，读取真实会话验证摘要、引用、刷新恢复和手机布局，不生成模拟答案。
默认使用 Windows 已安装的 Chrome，可通过 `CHROME_PATH` 指定其他本机 Chrome 路径，`FRONT_URL` 指定页面地址。
截图及报告在 Git 忽略的 `artifacts/` 目录。更多接口及配置见 [多轮上下文](../docs/conversations.md)。
