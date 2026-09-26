# SRT 字幕时间锚点校正工具

供纪录片剪辑师校正 SRT 字幕时间轴的网页工具。录入至少两个「原片时间 → 成片时间」锚点，
工具会对每条字幕的**开始时间和结束时间分别**做分段线性映射，生成与成片时间对齐的新 SRT。

技术栈：Node.js + Express + 原生 HTML/CSS/JavaScript（无前端构建步骤）。

## 功能说明

- **输入**：在页面中粘贴 SRT 文本，或上传 `.srt` 文件（上限 20MB）。
- **锚点**：至少两个；时间格式为 `HH:MM:SS,mmm`（句点或逗号作毫秒分隔符均可）。
  - 原片时间必须**严格递增**，否则明确报错并指出冲突的两个时间；
  - 成片时间同样必须**严格递增**，否则明确报错。
- **映射规则**（开始、结束时间分别处理）：
  - 时间落在相邻两个锚点之间时，按两锚点做**分段线性插值**；
  - 早于第一个锚点或晚于最后一个锚点时，**沿用最近锚点的固定偏移**（外推为常量偏移）；
  - 映射结果按毫秒 **`Math.round` 取整**。
- **导出校验**（出现任一问题即阻止下载并列出具体条目）：
  - 某条字幕映射后开始时间晚于结束时间（起止倒置）；
  - 相邻字幕映射后的开始时间发生倒序（字幕顺序倒置）；
  - 映射结果出现负时间。
- **结果展示**：表格逐条对照「原开始 → 新开始」「原结束 → 新结束」，保留原序号与多行正文。
- **输出**：校验通过后可一键下载 `corrected.srt`。

## 使用 Docker Compose 启动（推荐）

要求已安装 Docker 与 Docker Compose。镜像**构建时会安装依赖**（`npm install`）。

```bash
docker compose up --build
```

启动后在浏览器访问：

```
http://localhost:3000
```

端口映射为宿主机 `3000` → 容器 `3000`。后台运行可加 `-d`：

```bash
docker compose up --build -d
```

停止：

```bash
docker compose down
```

## 本地直接运行（不用 Docker）

需要 Node.js 18 及以上版本。

```bash
npm install
npm start
```

然后访问 http://localhost:3000 。

## 接口

`POST /api/correct`

请求体（JSON）：

```json
{
  "srt": "1\n00:00:01,000 --> 00:00:03,000\n你好",
  "anchors": [
    { "original": "00:00:10,000", "corrected": "00:00:12,500" },
    { "original": "00:01:00,000", "corrected": "00:01:05,000" }
  ]
}
```

返回：

```json
{
  "srt": "1\n00:00:03,500 --> 00:00:05,500\n你好\n",
  "entries": [
    { "index": 1, "oldStart": 1000, "oldEnd": 3000, "newStart": 3500, "newEnd": 5500, "text": "你好" }
  ],
  "anchors": [{ "original": 10000, "corrected": 12500 }],
  "errors": []
}
```

`errors` 非空表示存在起止倒置 / 顺序倒置 / 负时间等问题，前端会阻止导出。
锚点或 SRT 不合法（含时间未严格递增）时返回 HTTP 400，响应体 `error` 字段为中文原因。

## 目录结构

```
.
├── Dockerfile          # 镜像构建时安装依赖
├── compose.yaml        # docker compose 编排，暴露 3000 端口
├── package.json
├── server.js           # Express 服务与 /api/correct 接口
├── lib/
│   └── srt.js          # SRT 解析、锚点校验、分段线性映射核心逻辑
└── public/
    ├── index.html      # 单页界面
    ├── style.css
    └── app.js          # 原生 JavaScript 前端逻辑
```
