# Trae Agent Team — 项目总览

> **版本**: v0.10 Pre-MVP | **状态**: ✅ Day 0 Go | **日期**: 2026-04-26
> Day 0 验证通过，Phase 1 启动中 | MVP 预估 3-5 工作日

> ⚠️ **风险免责**：本系统可能违反 Trae 服务条款（ToS），使用后果自负，不得公开传播。

---

## 1. Day 0 验证结论

**决策**: ✅ **Go** — CDP 自动化操控 Trae IDE 物理可行。

| 验证项 | 结果 | 关键发现 |
|--------|------|---------|
| CDP 连接 | ✅ | 9222 端口，1 个 page Target |
| DOM 穿透 | ✅ | 第 1 层，无 Shadow DOM |
| 文本注入 | ✅ | `innerText` + `InputEvent`（`Input.insertText` 无效） |
| 提交触发 | ✅ | 发送按钮 `.chat-input-v2-send-button` 点击（Enter 键无效） |
| 任务切换 | ✅ | `.index-module__task-item___zOpfg[index].click()`，100% 成功 |
| 响应检测 | ✅ | 轮询 `.chat-turn` 数量变化，25-40 秒 |

**端到端耗时**: ~36 秒/任务（含 30 秒 AI 响应等待）

---

## 2. 核心链路（已验证）

```
Trae --remote-debugging-port=9222
→ CDP 连接（chrome-remote-interface）
→ 任务切换（.task-item click）
→ 聚焦输入框（.chat-input-v2-input-box-editable focus）
→ 填充 Prompt（innerText + InputEvent）
→ 点击发送按钮（.chat-input-v2-send-button click）
→ 等待响应（轮询 .chat-turn 数量变化）
→ 抓取响应文本（.chat-turn:last innerText）
```

---

## 3. 核心交付物

| 文件 | 说明 | 状态 |
|------|------|:----:|
| `DAY0_GO_NOGO_REPORT.md` | Day 0 最终验证报告 | ✅ |
| `selectors.v2026-04-26.json` | 真实 DOM 选择器映射 | ✅ |
| `exec-units/chat-fill.yaml` | Chat 填充执行卡片（v3.0 已验证版） | ✅ |
| `day0-mvp-prd.md` | Day 0 验证 PRD（10 个 probe） | ✅ |
| `day0-report-templates.md` | 报告模板 | ✅ |
| `trae-agent-team-prd.md` | 主 PRD v0.10 Pre-MVP | ✅ |

---

## 4. Phase 1 计划（3-5 工作日）

| 天数 | 交付物 |
|------|--------|
| D1 | 拟人化模块（§5）+ 配额感知（§6）集成 |
| D2 | lark-cli 单终端 + 角色路由 + 飞书回报 |
| D3 | taskMachine（纯 TS）+ async-mutex + Git 自动提交 |
| D4 | 人机共享 UI（§8）+ 端到端冒烟测试 |
| D5 | Bug 修复 + MVP 发布 |

---

## 5. 四大生存模块

- §5 拟人化反检测 → 让系统"像人"
- §6 配额感知 → 让系统"不贪"
- §7 选择器自适应 → 让系统"不瞎"
- §8 人机共享 UI → 让系统"不抢"

---

## 6. 评审历史

| 版本 | 结论 | 主要变更 |
|------|------|---------|
| v2.3→v3.0 | ✅ | 10 轮完整版设计迭代 |
| v0.9 Beta | 🧪 | 战略降级：砍 40% + 新增 4 个生存模块 |
| v0.10 Pre-MVP | 🔬 | 深度精简：22→10 章，Day 0 物理验证 |
| **Day 0 验证** | **✅ Go** | **全部 6 项验证通过，Phase 1 启动** |
