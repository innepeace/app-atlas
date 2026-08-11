# App Atlas

> 一个用于创建移动应用「可视化业务地图」的工具框架。将 App 每一屏的 UI 结构、交互热区、跳转关系和业务逻辑以地图形式呈现。

**拿到即用**——零 npm 依赖、零构建步骤，配置好源码路径即可让 AI Agent 自动采集，或手动编写。

---

## 快速开始

```bash
# 1. 克隆
git clone <repo-url> my-app-atlas
cd my-app-atlas

# 2. 配置源码项目路径
cp atlas.config.example.json atlas.config.json
# 编辑 atlas.config.json，填入你的 iOS/Android 项目本地路径
# { "sourceProject": "/Users/xxx/your-ios-project" }

# 3. 启动服务
node tools/serve.mjs 37421

# 4. 浏览器打开
open http://127.0.0.1:37421/web/
```

首次启动如果没有配置源码路径，页面会自动弹出配置对话框。

---

## 工作方式

### 方式一：AI Agent 自动采集（推荐）

将本项目作为 AI Agent（Claude Code / Kiro / Cursor 等）的工作目录。Agent 会：

1. 读取 `atlas.config.json` 中指定的源码项目
2. 逐文件分析 VC / ViewModel / Cell / API 源码
3. 自动生成 `manifest.json`（页面结构）+ `logic.md`（业务逻辑）
4. 更新 `data/registry.json` 注册表

对话示例：
```
你: 收集 trade 模块的下单页
AI: (读源码 → 产出 manifest.json + logic.md → 校验通过)
```

Agent 的详细工作规范见 `AGENTS.md`、`rules.md`、`docs/CONVENTIONS.md`。

### 方式二：手动创建

```bash
# 在 data/modules/ 下建目录
mkdir -p data/modules/myModule/screens/myScreen

# 创建 manifest.json 和 logic.md
# 更新 data/registry.json 添加对应条目
# 校验
node tools/validate.mjs
```

---

## 目录结构

```
app-atlas/
├── atlas.config.json        # 本地配置（sourceProject 路径，不提交 git）
├── atlas.config.example.json# 配置模板
├── data/
│   ├── registry.json        # 全局注册表（模块 → 屏幕列表）
│   ├── components.json      # 可复用组件目录
│   └── modules/             # 业务模块数据
│       └── <module>/
│           └── screens/
│               └── <screenId>/
│                   ├── manifest.json   # 页面结构 + 热区 + 状态
│                   └── logic.md        # 业务逻辑文档
├── web/                     # 前端可视化（纯静态，无构建）
│   ├── index.html
│   ├── app.js               # 主应用逻辑
│   ├── render.mjs           # 渲染引擎（线框图 + 热区 + 截图）
│   ├── search.mjs           # 全局搜索
│   ├── styles.css
│   └── assets/screens/      # 页面截图
├── lib/                     # 核心库
│   ├── config.mjs           # 配置读写
│   ├── validate.mjs         # 数据校验逻辑
│   ├── serve-core.mjs       # HTTP 服务核心
│   ├── screenshot.mjs       # 截图/多视图管理
│   ├── search.mjs           # 搜索引擎
│   ├── sync.mjs             # 源码同步检测
│   └── ...
├── tools/                   # CLI 工具
│   ├── serve.mjs            # 本地服务（含 Claude 收集能力）
│   ├── validate.mjs         # 校验所有数据
│   ├── sync.mjs             # 检测源码变更（陈旧标记）
│   ├── seed-skeleton.mjs    # 从路由文件生成骨架
│   └── screenshot.mjs       # 截图辅助
├── test/                    # 测试
├── AGENTS.md                # AI Agent 工作手册
├── rules.md                 # 规则总纲
└── docs/
    ├── CONVENTIONS.md       # 收集守则（质量标准）
    └── SYNC.md              # 同步机制说明
```

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `node tools/serve.mjs 37421` | 启动本地服务（含 Web 界面 + Claude 收集 API） |
| `node tools/validate.mjs` | 校验 registry + 所有 manifest 数据完整性 |
| `node --test` | 运行测试 |
| `node tools/sync.mjs` | 检测已收集屏的源码是否有变更 |
| `node tools/seed-skeleton.mjs` | 从路由文件批量生成模块骨架 |

---

## 核心数据格式

### manifest.json

描述一个页面的 UI 结构、交互热区、状态和跳转关系：

```jsonc
{
  "screen": {
    "id": "orderConfirm",           // 唯一 ID
    "module": "trade",              // 所属模块
    "title": "确认下单",             // 显示标题
    "route": "/trade/confirm",      // App 内路由
    "description": "..."            // 一句话描述
  },
  "source": {
    "vc": "OrderConfirmVC.swift",   // 主 ViewController
    "vm": "OrderConfirmVM.swift",   // ViewModel（可选）
    "files": ["..."],               // 涉及的源文件列表
    "rev": "a1b2c3d"                // 源码 git 短 SHA
  },
  "layout": [
    // UI 结构树（支持嵌套 children）
    { "type": "navbar", "id": "nav", "label": "← 确认下单", "children": [...] },
    { "type": "list", "id": "order-info", "label": "订单信息", "children": [...] },
    { "type": "button", "id": "btn-submit", "label": "提交订单" }
  ],
  "states": [
    // 页面状态列表
    { "id": "default", "label": "默认态", "note": "正常显示订单信息" },
    { "id": "loading", "label": "提交中", "note": "按钮 loading" }
  ],
  "hotspots": [
    // 可交互元素 — 每个对应 logic.md 中一个 ### 锚点
    {
      "id": "btn-submit",
      "label": "提交订单",
      "kind": "action",              // navigate / action / service
      "logic_ref": "#submit-order",  // 对应 logic.md 的 ### submit-order
      "branches": [
        { "condition": "校验通过", "label": "提交成功", "goto": "orderResult" },
        { "condition": "校验失败", "label": "弹出错误提示", "goto": "" }
      ]
    }
  ],
  "links": {
    "prev": ["orderEntry"],          // 从哪些页面可以跳到这里
    "next": ["orderResult"]          // 这里可以跳到哪些页面
  },
  "status": "collected"
}
```

### logic.md

Markdown 格式的业务逻辑文档，支持 Mermaid 流程图：

```markdown
# orderConfirm — 确认下单

## 概述
`OrderConfirmVC` 继承 `BaseVC`（push），从下单入口跳入。
核心交互：展示订单详情 → 确认 → 提交。

## 主流程
\`\`\`mermaid
flowchart TD
    A[从 orderEntry 跳入] --> B[加载订单数据]
    B --> C[展示确认信息]
    C --> D{用户点击提交}
    D -->|校验通过| E[调用下单接口]
    D -->|校验失败| F[弹出错误]
    E --> G[跳转 orderResult]
\`\`\`

## 分支逻辑

### submit-order
触发链：`submitBtn.rx.tap` → `viewModel.submitOrder()` → 校验 → API 调用

## 业务规则
- 金额不能超过可用余额
- 交易密码验证（首次下单）

## 相关代码
| 文件 | 职责 |
|------|------|
| OrderConfirmVC.swift | 主 VC |
| OrderConfirmVM.swift | 业务逻辑 |
```

### registry.json

全局注册表，列出所有模块和屏幕：

```jsonc
{
  "schemaVersion": 1,
  "roots": [],       // 首页入口（可选）
  "modules": [
    {
      "id": "trade",
      "name": "交易",
      "screens": [
        { "id": "orderConfirm", "title": "确认下单", "route": "/trade/confirm", "status": "collected" },
        { "id": "orderResult", "title": "下单结果", "route": "/trade/result", "status": "uncollected" }
      ]
    }
  ]
}
```

---

## Web 界面功能

- **导航树**：左侧按模块分组展示所有页面，点击切换
- **线框图模式**：结构化展示 layout + 可点击热区
- **图片模式**：展示真机截图 + 热区覆盖层
- **业务逻辑面板**：右侧展示 logic.md（支持 Mermaid 流程图渲染）
- **全局搜索**：搜索所有页面的标题、描述、逻辑文本
- **Claude 收集**：搜索无结果时可一键让 AI 去源码中采集
- **截图拖拽上传**：图片模式下拖入截图自动保存并关联热区
- **页面间跳转**：点击热区直接跳转到目标页面

---

## 适用场景

- iOS / Android / Flutter / React Native 等任意移动应用
- 团队新人快速了解 App 全貌和业务逻辑
- 业务评审、测试覆盖度参考
- AI Agent 辅助代码理解的知识库

---

## 配置说明

`atlas.config.json`（本地文件，不提交 git）：

```json
{
  "sourceProject": "/Users/xxx/your-project-root"
}
```

- `sourceProject`：目标 App 源码的本地绝对路径，AI Agent 会从中读取源码进行分析

---

## License

MIT
