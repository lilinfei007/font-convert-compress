# 字体转换与子集压缩工具

一个基于 Node.js 的本地字体处理工具，提供浏览器界面，可用于：

- 字体格式转换
- 字体子集压缩
- 增量更新已有子集字体
- 自动保存和匹配原始全量字体
- 压缩完成后由服务端自动上传到 CDN

当前界面地址默认是：

```text
http://127.0.0.1:3101/
```

## 功能概览

- 支持上传原始全量字体，生成新的子集字体
- 支持“增量更新”模式：基于现有子集字体补充新字符
- 支持从网络 URL 读取当前子集字体
- 支持自动匹配此前保存过的原始全量字体
- 支持保留或去除 `hinting` / `kerning`
- 支持输出结果字符预览
- 支持服务端自动上传到 CDN
- 支持自定义 CDN 请求体
- 支持在“增量更新 + 网络 URL + 自动上传 CDN”场景下选择：
  - 沿用当前 URL 文件名
  - 生成新的随机文件名

## 支持格式

支持读取的字体格式：

- `ttf`
- `otf`
- `woff`
- `woff2`
- `eot`
- `svg`

支持输出的字体格式：

- `ttf`
- `woff`
- `woff2`
- `eot`
- `svg`

说明：

- 当前依赖库暂不支持导出 `otf`

## 环境要求

- Node.js 18 或更高版本
- Windows / macOS / Linux 均可运行

## 安装与启动

首次安装依赖：

```bash
npm install
```

启动服务：

```bash
npm run dev
```

或：

```bash
npm start
```

默认端口由 `server.js` 中的 `PORT` 决定，未配置时为 `3000`。如果需要固定到 `3101`，可以在环境变量或 `.env.local` 中设置：

```ini
PORT=3101
```

启动后打开：

```text
http://127.0.0.1:3101/
```

## 项目目录

```text
public/                    前端页面与样式
charsets/                  系统预设字符集
data/source-fonts/         服务端保存的原始字体
data/font-library.json     原始字体与子集匹配记录
server.js                  Node 服务入口
.env.example               CDN 配置示例
.cdn-upload-body.example.json
.cdn-upload-form.example.json
```

## 使用流程

### 1. 新建子集

适用于第一次压缩一个原始全量字体。

操作步骤：

1. 打开页面后，选择 `新建子集`
2. 上传原始全量字体，或从“已保存原始字体”中选择一份
3. 选择输出格式
4. 选择字符来源
5. 点击“转换并下载”

字符来源支持四种方式：

- `完整字体`：不做字符裁剪
- `系统预设`：使用常用 3500 字或扩展 6500 字
- `手动输入`：直接输入需要保留的字符
- `上传字符集文件`：从文本文件中提取字符

默认字符来源是：

- `手动输入`

### 2. 增量更新

适用于已经有一份子集字体，希望在原有字符基础上继续追加新字符。

操作步骤：

1. 选择 `增量更新`
2. 在“当前子集字体”区域二选一：
   - 填写网络 URL
   - 上传本地子集字体
3. 系统会先读取当前子集字体里已有的字符
4. 系统会尝试自动匹配之前保存过的原始全量字体
5. 如果自动匹配失败，再手动上传原始全量字体，或从已保存字体里指定
6. 选择本次新增字符来源
7. 点击“增量更新并下载”

增量模式的特点：

- 当前子集字体里的已有字符会被保留
- 本次新增字符会与已有字符做并集
- 如果本次不新增字符，也可以重新生成一份同字符集的新输出格式文件

### 3. 原始字体自动保存与自动匹配

每次完成转换后，服务端会自动：

- 保存原始全量字体到 `data/source-fonts/`
- 记录原始字体信息到 `data/font-library.json`
- 记录子集输出与原始字体之间的匹配关系

这样在下次做增量更新时：

- 如果当前子集字体曾由本工具生成
- 或其指纹能够命中已有记录

系统就可以自动找回对应的原始全量字体。

### 4. 输出预览

转换完成后，页面会展示：

- 输出文件大小变化
- 子集字符数量
- 增量模式下合并后的字符数量
- 输出字体字符预览

## 瘦身选项说明

### 保留 hinting

- 打开后，尽量保留字体的 hinting 数据
- 优点是显示更稳
- 缺点是输出文件通常会更大

### 保留 kerning

- 打开后，尽量保留 kerning 字距信息
- 优点是字距更完整
- 缺点是输出文件通常会更大

说明：

- 有些源字体本身不包含这些数据
- 即使勾选，也不一定会影响输出结果

## CDN 自动上传

页面中的“压缩完成后自动上传 CDN”开关由服务端配置决定：

- 如果服务端未配置 CDN，开关会禁用
- 如果服务端已配置 CDN，浏览器只知道“能不能上传”
- 真实的上传地址、鉴权头、Token 都只保存在服务端

这意味着：

- 敏感信息不会暴露到前端页面
- 浏览器不会直接拿到 CDN 密钥

## CDN 配置方式

建议新建本地配置文件：

```text
.env.local
```

可以先参考：

- `.env.example`
- `.cdn-upload-body.example.json`
- `.cdn-upload-form.example.json`

### 最小配置示例

```ini
PORT=3101

CDN_UPLOAD_LABEL=My CDN
CDN_UPLOAD_URL_TEMPLATE=https://upload.example.com/fonts/{cdnFilename}
CDN_PUBLIC_URL_TEMPLATE=https://cdn.example.com/fonts/{cdnFilename}
CDN_UPLOAD_METHOD=POST

CDN_AUTH_HEADER=Authorization
CDN_AUTH_TOKEN=Bearer replace-with-real-token

CDN_AUTO_UPLOAD_DEFAULT=false
CDN_UPLOAD_TIMEOUT_MS=20000
CDN_UPLOAD_BODY_MODE=form
CDN_UPLOAD_FORM_FILE_FIELD=file
CDN_UPLOAD_FORM_FILENAME_FIELD=filename
CDN_UPLOAD_FILENAME_TEMPLATE=/temp/{{dateCompact}}/{{uuid}}.{{ext}}
```

修改 `.env.local` 后请重启服务，新的 CDN 配置才会生效。

## CDN 请求体模式

当前支持四种请求体模式：

- `raw`
  - 直接把压缩后的字体二进制作为请求体上传
- `json`
  - 根据 JSON 模板生成请求体
- `text`
  - 根据文本模板生成请求体
- `form`
  - 生成 `multipart/form-data`

### 适合你当前场景的 multipart/form-data

如果你的 CDN 接口需要：

- `file`：字体二进制
- `filename`：形如 `/temp/20260610/uuid.ttf`

可以这样配置：

```ini
CDN_UPLOAD_BODY_MODE=form
CDN_UPLOAD_FORM_FILE_FIELD=file
CDN_UPLOAD_FORM_FILENAME_FIELD=filename
CDN_UPLOAD_FILENAME_TEMPLATE=/temp/{{dateCompact}}/{{uuid}}.{{ext}}
```

这时服务端会自动构造一个 multipart 请求：

- `file` 为压缩后的字体文件
- `filename` 为按模板生成的远端文件名

## CDN 文件名模板

远端文件名由下面这个配置控制：

```ini
CDN_UPLOAD_FILENAME_TEMPLATE=/temp/{{dateCompact}}/{{uuid}}.{{ext}}
```

常见变量：

- `{{dateCompact}}`：当前日期，格式如 `20260610`
- `{{uuid}}`：随机生成的 32 位 UUID
- `{{ext}}`：本次实际输出格式扩展名
- `{{cdnFilename}}`：最终用于上传的远端文件名
- `{{cdnBasename}}`：最终远端文件名的 basename
- `{{cdnDirname}}`：最终远端目录部分

说明：

- `{{filename}}` 表示本工具本地输出文件名
- `{{cdnFilename}}` 表示最终上传到 CDN 的文件名
- 推荐在 CDN 相关模板里优先使用 `{{cdnFilename}}`

## 增量更新时的 CDN 文件名策略

当同时满足以下条件时，页面会显示“CDN 文件名策略”：

- 当前模式是 `增量更新`
- 当前子集字体来源是网络 URL
- 已勾选“自动上传 CDN”

你可以选择两种策略。

### 1. 沿用当前 URL 文件名

适合：

- 你希望覆盖同一个线上文件
- 下游引用地址不想变化

行为：

- 服务端会读取当前子集字体 URL 的路径名
- 上传时直接沿用这个路径
- 如果本次输出格式变了，会自动替换扩展名

例如：

- 当前 URL：`https://cdn.example.com/temp/20260609/original-name.ttf`
- 本次输出格式：`woff`
- 最终上传 filename：`/temp/20260609/original-name.woff`

### 2. 生成新的随机文件名

适合：

- 你不想覆盖旧版本
- 你希望每次发布都产生一个新地址

行为：

- 服务端继续按 `CDN_UPLOAD_FILENAME_TEMPLATE` 生成远端文件名

例如：

- 模板：`/temp/{{dateCompact}}/{{uuid}}.{{ext}}`
- 本次输出格式：`ttf`
- 最终上传 filename：`/temp/20260610/6837536c65a34aaab0307890afc228c4.ttf`

## JSON / 文本模板变量

当你使用 `json`、`text`、`form` 模板时，可用变量包括：

- `filename`
- `basename`
- `ext`
- `hash`
- `sourceHash`
- `size`
- `sourceBytes`
- `subsetCount`
- `newSubsetCount`
- `existingSubsetCount`
- `operationMode`
- `contentType`
- `publicUrl`
- `fileBase64`
- `dateCompact`
- `uuid`
- `cdnFilename`
- `cdnBasename`
- `cdnDirname`
- `cdnFilenameMode`

其中：

- `cdnFilenameMode` 的值为：
  - `existing`
  - `template`

## 表单字段模板示例

如果你除了 `file` 和 `filename` 之外，还想额外附带其他表单字段，可以新建一个本地 JSON 文件，例如：

```json
{
  "filename": "{{cdnFilename}}",
  "scene": "font",
  "operationMode": "{{operationMode}}"
}
```

然后在 `.env.local` 中指定：

```ini
CDN_UPLOAD_BODY_TEMPLATE_FILE=.cdn-upload-form.local.json
```

注意：

- `file` 字段始终由服务端自动注入
- 如果你启用了 `CDN_UPLOAD_FORM_FILENAME_FIELD=filename`
- 那么模板里可以不再重复写 `filename`

## 系统预设字符集

当前内置两套系统预设：

- `常用汉字集`
  - 覆盖 3500 个常用汉字
- `扩展汉字集`
  - 覆盖 6500 个汉字

字符集文件位于：

```text
charsets/
```

## API 概览

服务端当前暴露的主要接口如下：

- `GET /api/health`
  - 返回服务状态、支持格式、CDN 开关状态
- `GET /api/charsets`
  - 返回系统预设字符集列表
- `GET /api/source-fonts`
  - 返回服务端已保存原始字体列表
- `POST /api/convert`
  - 执行字体转换、压缩、增量更新、可选 CDN 上传
- `POST /api/source-fonts/delete`
  - 删除已保存原始字体
- `POST /api/source-match`
  - 根据子集指纹查找原始字体匹配
- `POST /api/font-fingerprint`
  - 读取网络字体并计算指纹
- `POST /api/font-preview`
  - 生成字符预览

## 常见问题

### 1. 为什么 CDN 开关是灰的

说明服务端没有配置可用的 CDN 上传参数。请检查：

- `.env.local` 是否存在
- `CDN_UPLOAD_URL_TEMPLATE` 是否已填写
- 服务是否已经重启

### 2. 为什么增量更新时还要求原始全量字体

因为增量更新不仅需要当前子集字体里的已有字符，还需要原始全量字体作为真正的字形来源。

如果系统自动匹配不到原始字体，就需要你手动提供：

- 上传原始全量字体
- 或从已保存原始字体列表里手动指定

### 3. 为什么我选了“沿用原文件名”，结果扩展名变了

这是正常行为。

如果当前 URL 是 `.ttf`，但你这次输出的是 `woff`，系统会把远端文件名自动改成 `.woff`，避免上传一个内容是 `woff`、文件名却还叫 `.ttf` 的文件。

### 4. 为什么上传成功了，但页面没有公开地址

可能原因：

- 你没有配置 `CDN_PUBLIC_URL_TEMPLATE`
- 你的上传接口和公开访问地址不是同一套规则
- 你采用的是“沿用当前 URL 文件名”，但没有额外配置公开地址模板

如果是“沿用当前 URL 文件名”，服务端会尽量根据当前子集字体 URL 推导公开地址。

## 开发建议

- 本地真实配置写入 `.env.local`
- 不要把 Token、鉴权头、上传地址中的敏感参数提交到 Git
- 如果要对接新 CDN，优先从 `form` 模式开始
- 如果第三方接口不是标准表单上传，再切换到 `json` 或 `text` 模式

## 许可证

当前仓库未单独声明许可证。如需开源发布，建议补充 `LICENSE` 文件。
