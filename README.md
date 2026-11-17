# 字体转换与子集压缩工具

前端和后端通过一个 Cloudflare Worker 一起部署，使用同一个域名，无需另行运行 Node 服务器或部署 Cloudflare Pages。

**默认无需 R2 即可部署。** 未配置 R2 时，使用临时处理模式：上传、预览、转换、下载和手动增量更新照常工作，但不保存原始字体、别名或子集匹配历史。下次使用时需重新提供原始字体。以后可以按下文步骤启用 R2。

- **Workers Static Assets**：托管 `public/` 中的页面、JavaScript 和样式。
- **Worker API + Durable Object**：处理 `/api/*` 请求、字体转换、增量更新和字体库操作。
- **可选 R2**：启用后保存原始字体文件。
- **Durable Object SQLite**：协调处理请求；启用 R2 后保存字体索引、别名和子集匹配关系。跳过 R2 时仍保留 Durable Object 绑定。

字体处理使用 `fonteditor-core` 和打包进 Worker 的 WOFF2 WebAssembly 模块，不依赖服务器文件系统、原生扩展或外部转换服务。浏览器请求使用同源相对地址。

## 功能

支持读取 TTF、OTF、WOFF、WOFF2、EOT、SVG；支持输出 TTF、WOFF、WOFF2、EOT、SVG。依赖库不支持导出 OTF。

1. **准备字体**：选择“制作小字体”并上传完整字体；或选择“更新小字体”，先载入已有小字体，再提供对应的完整字体。启用 R2 后可自动匹配或复用保存的来源。
2. **编辑字符**：输入文案、导入文本文件、选择系统字集，或保留全部。实时网格显示实际字形；更新时同时展示旧字符，并标记新增、已存在和缺失字符。在同一页选择输出格式及可选的 hinting / kerning 设置。
3. **下载结果**：生成后查看实际输出字符、比较体积并下载。顶部状态栏持续提示加载、缺字、失败和完成状态。

增量模式会合并当前子集和新增字符。当前子集可以来自本地文件或公开 HTTP/HTTPS 地址。临时模式需手动提供原始字体；启用 R2 后，此前生成过的子集可按指纹匹配原始字体，并可管理字体别名和删除记录。

**旧的小字体无法恢复已裁掉的字形，新增字符需要对应的完整字体。** 如果完整字体中缺少旧字符或本次输入字符，页面会提示；缺失字符不会写入输出。预览按 Unicode 字符展开，默认显示 200 个，可继续加载；输入时只在浏览器内计算，不会触发转换或保存。SVG/EOT 会由只读预览接口生成浏览器可加载的 WOFF 字形。

## 本地开发

使用 Node.js 22 或更新的版本：

```bash
npm ci
npm run dev
```

打开 `http://127.0.0.1:3000/`。Wrangler 自动构建 Worker，在本地运行 Durable Objects。默认使用临时处理模式；添加 R2 绑定后，Wrangler 会模拟本地 R2，持久化数据保存在被 Git 忽略的 `.wrangler/state/` 中，不会写入线上 R2 字体库。

指定其他端口：

```bash
npm run dev -- --port 3101
```

项目也提供同步的 `pnpm-lock.yaml`；使用 pnpm 时执行 `pnpm install --frozen-lockfile` 和 `pnpm dev`。

## 部署到 Cloudflare

默认配置不设置 `limits.cpu_ms`，使用平台默认限制，可用于 Workers Free。免费套餐不支持自定义 CPU 上限，即使将数值改小也会导致部署报错 `100328`；如使用旧配置，请删除整个 `limits` 字段后重新部署。只有升级 Workers Paid 后才可添加自定义 CPU 上限。

字体转换在使用 SQLite 的 Durable Object 中执行，该类型支持 Workers Free，需保留 `FONT_LIBRARY` 绑定和 `new_sqlite_classes` migration。字体复杂度、平台内存及套餐额度仍可能影响处理结果；本地部署预检不代表已通过线上账号套餐和运行限制校验。

首次部署（跳过 R2）：

```bash
npm ci
npx wrangler login
npm run deploy
```

默认 `wrangler.jsonc` 中没有启用 `r2_buckets`，不需要创建 bucket 或开通 R2。不要为了跳过 R2 删除 `FONT_LIBRARY` 绑定或 `migrations`，字体处理仍使用 Durable Object。

`npm run deploy` 会构建 TypeScript 后端和 WOFF2 模块，上传前端资源，建立 `ASSETS`、`FONT_LIBRARY` 绑定，并通过 `v1` migration 创建使用 SQLite 的 `FontLibrary` Durable Object 类。只有启用 R2 后才会添加 `FONTS` 绑定。

部署后访问 Wrangler 输出的 `https://font-convert-compress.<你的子域>.workers.dev`，该地址同时提供页面和 API。后续更新只需再次运行 `npm run deploy`。修改 Worker 名称、Durable Object 类名或 migration 之前，应先确认已有字体索引的迁移方案。

### GitHub 自动部署

可以使用 Cloudflare Workers Builds：连接 GitHub 仓库后，每次推送到指定分支，Cloudflare 就会构建并部署前后端，无需每次在本地执行 `npm run deploy`。GitHub 在这里托管项目代码；应用运行时的字体存储仍由临时模式或可选 R2 处理。

已有 Worker 时，在 Cloudflare 控制台进入 **Workers & Pages → font-convert-compress → Settings → Builds → Connect**，授权 GitHub 并选择本项目仓库。配置如下：

| 设置 | 值 |
| --- | --- |
| 生产分支 | `main` |
| 项目根目录 | 仓库根目录 `/` |
| 构建命令（Build command） | `npm run build` |
| 部署命令（Deploy command） | `npm run deploy` |

控制台 Worker 名称应与 `wrangler.jsonc` 中的 `name` 一致。构建命令不要留空：Workers Builds 不采用 Wrangler 的 Custom Builds 配置，需要在控制台明确执行构建，生成 `dist/index.js` 和 WOFF2 模块。默认配置无需创建 R2 bucket。

首次连接前先提交并推送本地修改，确保仓库包含 `src/`、`scripts/`、`public/`、`charsets/`、`package.json`、锁文件、`tsconfig.json` 和 `wrangler.jsonc`。后续每次完成更新后提交并推送到 `main` 即可；只在本地提交还不会触发部署。构建结果可在 Worker 的部署历史中查看。

还没有 Worker 时，可从 **Workers & Pages → Create application → GitHub** 导入仓库，按上述命令创建 Workers 项目。

官方说明：<https://developers.cloudflare.com/workers/ci-cd/builds/>、<https://developers.cloudflare.com/workers/ci-cd/builds/configuration/>。

### 后期启用 R2

1. 在账号中开通 R2，并创建 bucket；已有同名 bucket 时跳过创建命令：

```bash
npx wrangler r2 bucket create font-convert-compress-fonts
```

2. 取消 `wrangler.jsonc` 中 R2 示例的注释，或将以下字段合并到现有配置的顶层：

```json
{
  "r2_buckets": [
    { "binding": "FONTS", "bucket_name": "font-convert-compress-fonts" }
  ]
}
```

3. 再次部署：

```bash
npm run deploy
```

若修改 bucket 名称，请同步修改 `bucket_name`；绑定名称保持 `FONTS`。无需新建 Durable Object 类或追加 migration。部署后重新加载页面，即可自动使用 R2 字体库。

启用后，新转换会保存原始字体与匹配记录。此前临时处理的文件和历史不会自动补存，需要重新上传并生成一次。

### 访问范围

启用后的字体库由站点访问者共享，与原工具的单库行为一致，没有账号隔离。个人使用时，在公开站点入口配置 Cloudflare Access，让页面和 `/api/*` 都受同一访问策略保护；若使用自定义域名访问策略，也要关闭或保护可绕过该策略的 `workers.dev` 入口。

接口校验 JSON、字体大小、存储模式和指纹；拒绝跨站 Origin、私网字面地址和非标准下载端口，且对每次远程重定向重新校验。字体下载设置超时。最多同时接收四个待处理字体库请求，超出返回 429；API 返回 `no-store`，前端资源带安全响应头。

## 从旧 Node 版本迁移

旧的 `server.js`、`PORT` 和 `FONT_DATA_DIR` 配置已由 Wrangler 替代。旧 `data/` 文件不会被删除，但不会自动上传至 Cloudflare。

- 保留整个旧数据目录作为备份。临时模式可以直接上传并处理其中的字体；启用 R2 后，重新上传并生成一次才会保存到字体库。原本地别名和子集匹配历史不会自动迁入。
- 启用 R2 后，`wrangler dev` 的本地 R2/SQLite 与线上数据独立，部署代码不会上传开发字体库。
- 如先前配置过 `FONT_REPOSITORY_*` 环境变量或 Secret，可从 Cloudflare 和本地 `.dev.vars` 中移除；当前版本不再读取这些配置。

## 资源限制

- 单个原始字体或子集字体：**16 MiB**。
- JSON 请求体：**24 MiB**，包含 Base64 编码后的原始字体、子集和字符文本。
- WOFF / WOFF2 声明的解压大小：最大 **24 MiB**。
- WOFF2 适配器的 WASM 内存上限：64 MiB；整个 Worker / Durable Object 仍受平台内存限制。

这些限制用于降低内存耗尽的风险，并不保证所有上限以内的复杂字体都能处理。字体解析会生成字形对象，实际占用可能大于文件体积；大型中文全量字体可能需要先准备较小的源字体。原版“60 MB”提示已同步调整为 16 MB。

WOFF2 加载器的适配只在构建时生成，使用静态 WASM 导入和闭包替换动态代码生成。依赖 `fonteditor-core` 固定为 `2.6.3`；升级时需重新检查适配器，构建脚本会拒绝未知版本。输出的 WASM 向量会及时释放，避免多次转换累积泄漏。

## API 示例

所有接口与页面同源，不开放跨域访问。`POST` 使用 `Content-Type: application/json`。可选 `X-Font-Storage-Mode: none` 或 `r2` 指定临时模式或字体库。不传时有 R2 绑定就使用 R2，否则使用临时模式。显式指定 `r2` 但未绑定 R2 时返回 400；旧 `local` 值有 R2 时使用 R2，否则回退到临时模式。`remote` 已不再支持，指定该值返回 400。

`GET /api/health` 的 `defaultStorage` 返回 `none` 或 `r2`，`r2Storage.available` 表示是否已绑定 R2。临时模式下字体列表为空，子集匹配返回空结果，不支持仅凭 `sourceFontHash` 复用字体。

| 接口 | 用途 |
| --- | --- |
| `GET /api/health` | 支持格式、上传限制、R2 配置状态 |
| `GET /api/charsets` | 系统预设字符集列表 |
| `GET /api/source-fonts` | 字体库列表 |
| `POST /api/convert` | 字体转换、子集压缩和增量更新 |
| `POST /api/font-preview` | 字形预览和字符信息 |
| `POST /api/font-fingerprint` | 下载公开 URL 字体并计算指纹 |
| `POST /api/source-match` | 查找子集对应原始字体 |
| `POST /api/source-fonts/alias` | 设置或清除别名 |
| `POST /api/source-fonts/delete` | 删除原始字体和匹配记录 |

`/api/font-preview` 可传 `includePreviewFont: true`，返回用于浏览器渲染的 `previewFont: { type, base64Data }`。SVG/EOT 的预览资产会转换为 WOFF；响应中的原始类型、指纹与 `base64Data` 不变，`includeData: false` 仍可省略原始字节。这个接口不会保存字体。`/api/charsets` 的每个预设包含 `characters` 字符串，供前端本地实时预览。

```bash
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/source-fonts
```

转换请求 `request.json` 的字段示例：

```json
{
  "filename": "example.ttf",
  "data": "替换为字体文件的标准 Base64 内容",
  "operationMode": "fresh",
  "outputType": "woff2",
  "subsetMode": "manual",
  "subsetText": "你好 ABC123",
  "keepHinting": false,
  "keepKerning": false,
  "optimize": true
}
```

```bash
curl http://127.0.0.1:3000/api/convert -H "Content-Type: application/json" --data-binary @request.json --output result.woff2
```

成功返回字体二进制，响应头包含 `X-Source-Hash`、`X-Output-Hash`、`X-Subset-Count` 和体积信息。临时模式仍返回实际字体指纹，但 `X-Server-Source-Saved` / `X-Server-Match-Saved` 为 `false`，对应 `Action` 为 `skipped`；指纹不代表已保存。

启用字体库后，复用字体时可以 `sourceFontHash` 替代 `filename` / `data`。增量更新设置 `operationMode: "incremental"`，并传入 `existingSubsetFilename` / `existingSubsetData`，或 `existingSubsetUrl`；临时模式还需提供原始字体的 `filename` / `data`。

失败返回 JSON，例如：

```json
{ "error": "字体文件最大 16 MB。" }
```

常用状态码：400 参数无效、403 跨站请求、404 字体或接口不存在、413 超出大小限制、415 请求类型不符、422 无效字体、429 队列已满、502 字体下载失败或已保存字体校验失败。

## 验证

```bash
npm run check
npm run deploy:check
```

`check` 运行严格 TypeScript 检查及本地 workerd 集成测试，覆盖无 R2 时的临时转换、手动增量更新和不保存行为，以及显式启用本地 R2 后的往返解析、重启持久化、并发写入、别名、删除和输入校验。R2 测试使用测试专用绑定和独立临时目录，不要求开通线上 R2，也不会修改实际字体库。Cloudflare 线上资源不属于离线测试范围。

`deploy:check` 构建并验证 Cloudflare 上传包，不发布线上服务，也不创建线上资源。

## 项目结构

```text
src/index.ts          Worker 入口、API、字体处理与 Durable Object
src/assets.d.ts       文本资源类型声明
scripts/build.mjs     构建及 WOFF2 Workers 适配
public/               前端页面、脚本、样式和安全响应头
charsets/             内置字符集
tests/                workerd 集成测试与样例字体
wrangler.jsonc        Cloudflare 部署配置与绑定
dist/                 生成的 Worker 和 WASM（不提交）
.generated/           构建中间文件（不提交）
.wrangler/            本地运行数据（不提交）
```

## 参考

- Cloudflare Workers Static Assets：<https://developers.cloudflare.com/workers/static-assets/>
- Workers WebAssembly：<https://developers.cloudflare.com/workers/runtime-apis/webassembly/>
- Workers 资源限制：<https://developers.cloudflare.com/workers/platform/limits/>
- Durable Objects SQLite：<https://developers.cloudflare.com/durable-objects/api/sql-storage/>
- Durable Objects 资源限制：<https://developers.cloudflare.com/durable-objects/platform/limits/>

本仓库尚未单独声明许可证；发布前请确认代码和字体的授权。
