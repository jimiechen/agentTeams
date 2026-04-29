# Heartbeat Scheme 方案评审报告

**版本**: v1.0
**日期**: 2026-04-29
**评审范围**:
- 方案文档: `heartbeat-scheme/` (61个文档文件)
- 实际代码: `mvp-runner/src/` (已实现的心跳检测代码)

---

## 一、方案概述

Heartbeat Scheme 是一个**三层心跳检测架构**设计文档，包含11个部分、61个详细设计文档：
- **Part 1**: 问题诊断（中断模式分析）
- **Part 2**: 三层架构（Layer 1/2/3 心跳检测）
- **Part 3**: 健康状态机
- **Part 4**: HeartbeatDetector 核心类
- **Part 5**: RecoveryExecutor 恢复执行器
- **Part 6**: HeartbeatDaemon 守护进程
- **Part 7**: 飞书通知集成
- **Part 8**: 配置与运维
- **Part 9**: 架构集成
- **Part 10**: 测试验证
- **Part 11**: 路线图

---

## 二、实际代码现状

当前 `mvp-runner/src/` 中已实现的心跳相关代码：

| 文件 | 功能 | 实现程度 |
|------|------|----------|
| `actions/wait-response.ts` | 心跳检查 + 任务完成检测 | ✅ 已实施（简化版） |
| `actions/state-probe.ts` | 状态探测（5信号检测） | ✅ 已实施（简化版） |
| `actions/recover.ts` | 恢复动作（停止按钮/ESC） | ✅ 已实施（简化版） |
| `cdp/client.ts` | CDP 连接 + 心跳定时器 | ✅ 已实施（30秒周期） |

### 2.1 当前实现的关键特性

**wait-response.ts**（L233-L265）:
- 30秒超时检测
- 5信号检测（terminalBtn, deleteCard, stopBtn, taskStatus, lastTurnText）
- 连续3次相同信号判定为卡住
- 心跳检查（30秒周期CDP evaluate）
- 超时后调用 recover()

**state-probe.ts**:
- 5信号探测（terminal-hang, modal-blocking, model-stalled, task-interrupted, model-queuing）
- 信号优先级排序
- 模式决策算法

**recover.ts**:
- 点击停止按钮（通过CDP Input.dispatchMouseEvent）
- 发送ESC键
- 权限边界检查（最小权限原则）

**cdp/client.ts**:
- 30秒心跳定时器
- CDP evaluate 检查页面响应性
- 连接断开检测

---

## 三、方案 vs 实际代码 对比评审

### 3.1 架构层面对比

| 维度 | 方案设计 | 实际代码 | 差距 |
|------|----------|----------|------|
| **检测层级** | 三层（Layer 1: 5秒 / Layer 2: 15秒 / Layer 3: 30-60秒） | 单层（30秒固定周期） | 🔴 大 |
| **检测粒度** | 分层递进（fast → content → deep） | 统一探测（5信号一次性检测） | 🔴 大 |
| **状态机** | 6状态健康状态机（normal/idle/background/frozen/crashed） | 无状态机，直接判定卡住/正常 | 🔴 大 |
| **信号系统** | 9种信号类型（thread_responsive, dom_changed 等） | 5种信号（基于DOM元素存在性） | 🟡 中 |
| **恢复执行器** | 完整权限边界（白名单+速率限制+审计日志+人工确认） | 简化版（直接点击停止按钮） | 🔴 大 |
| **守护进程** | HeartbeatDaemon 独立生命周期管理 | 集成在 CDPClient 中（30秒定时器） | 🟡 中 |
| **飞书通知** | 分级通知（info/recovery/critical） | 基础通知（任务完成/失败） | 🟡 中 |
| **配置系统** | 完整YAML配置 + 环境变量 + 运行时API | 环境变量 + 硬编码参数 | 🟡 中 |
| **测试验证** | 11个测试文件，覆盖手动/E2E/长期运行 | 无专门测试文件 | 🔴 大 |

### 3.2 详细差距分析

#### 🔴 差距1：三层架构未实现

**方案设计**:
```
Layer 1 (5秒): fastCheck() - 主线程响应性 + 基本DOM状态
Layer 2 (15秒): contentCheck() - CDP脚本执行 + 内容状态
Layer 3 (30-60秒): deepCheck() - 全面状态分析 + 内存/渲染管线
```

**实际代码**:
```typescript
// cdp/client.ts - 只有单层30秒心跳
this.heartbeatTimer = setInterval(() => this.checkHeartbeat(), 30000);
```

**影响**: 检测灵敏度不足，5-10秒的中断需要30秒才能发现。

#### 🔴 差距2：HeartbeatDetector 核心类未实现

**方案设计**:
- `HeartbeatDetector` 类协调三层检测
- 信号缓冲区（SignalBuffer）收集各层信号
- 模式判定算法（基于信号权重）
- 置信度评分系统

**实际代码**:
- 无 `HeartbeatDetector` 类
- 检测逻辑分散在 `wait-response.ts` 和 `state-probe.ts`
- 无信号权重和置信度概念

#### 🔴 差距3：RecoveryExecutor 权限边界不完整

**方案设计**:
- 按钮白名单（6种按钮，风险分级）
- 权限检查器（每小时点击上限）
- 速率限制器（冷却时间+窗口限制）
- 审计日志（JSONL格式持久化）
- 人工确认（高风险操作）

**实际代码**:
```typescript
// recover.ts - 仅实现基本点击
async function clickStopButton(cdp: CDPClient): Promise<boolean>
async function sendEscKey(cdp: CDPClient): Promise<boolean>
```

**缺失**:
- 无按钮白名单验证
- 无速率限制
- 无审计日志
- 无人工确认机制

#### 🟡 差距4：健康状态机未实现

**方案设计**:
```typescript
type HeartbeatMode = 'normal' | 'idle' | 'background' | 'frozen' | 'crashed';
```

**实际代码**:
- 只有二值判断：卡住 / 正常
- 无状态转换矩阵
- 无恢复机制（从异常状态回到正常状态的规则）

#### 🟡 差距5：配置系统不完整

**方案设计**:
- `heartbeat.yaml` 完整配置
- 环境变量覆盖
- 运行时管理API（动态调整参数）
- 健康仪表盘

**实际代码**:
- 硬编码参数（30秒周期、3次重试、5分钟超时）
- 仅通过环境变量配置基础项

---

## 四、已实现部分的评审

### 4.1 已实现的优秀实践 ✅

| 实践 | 实现文件 | 说明 |
|------|----------|------|
| **5信号检测** | state-probe.ts | 覆盖主要中断场景 |
| **连续信号确认** | wait-response.ts | 3次相同信号才判定卡住，避免误报 |
| **心跳与任务检测分离** | wait-response.ts | 心跳检查不阻塞任务完成检测 |
| **最小权限恢复** | recover.ts | 仅点击停止按钮和ESC，不执行高风险操作 |
| **CDP连接保活** | cdp/client.ts | 30秒心跳维持连接 |
| **工作区隔离日志** | workspace-logger.ts | 每个工作区独立日志文件 |

### 4.2 已实现的不足之处 ⚠️

| 问题 | 位置 | 建议 |
|------|------|------|
| 心跳周期固定30秒 | cdp/client.ts | 应支持分层动态周期 |
| 无信号权重系统 | wait-response.ts | 不同信号应有不同置信度 |
| 恢复动作无审计 | recover.ts | 应记录每次恢复操作 |
| 无状态持久化 | - | 重启后丢失检测状态 |
| 无长期运行验证 | - | 缺乏7x24小时稳定性测试 |

---

## 五、实施建议

### 5.1 短期（本周）- 补齐关键缺陷

| 优先级 | 任务 | 工时 | 文件 |
|--------|------|------|------|
| 🔴 P0 | 缩短心跳周期到10秒 | 1h | cdp/client.ts |
| 🔴 P0 | 增加信号计数器持久化 | 2h | wait-response.ts |
| 🟡 P1 | 添加恢复操作审计日志 | 2h | recover.ts + workspace-logger.ts |
| 🟡 P1 | 实现按钮白名单检查 | 2h | recover.ts |

### 5.2 中期（2周）- 核心架构升级

| 优先级 | 任务 | 工时 | 说明 |
|--------|------|------|------|
| 🔴 P0 | 实现 HeartbeatDetector 类 | 8h | 统一协调三层检测 |
| 🔴 P0 | 实现 Layer 1 快速检测（5秒） | 4h | 独立定时器，轻量级采集 |
| 🟡 P1 | 实现健康状态机 | 6h | 6状态 + 转换矩阵 |
| 🟡 P1 | 实现 RecoveryExecutor 完整版 | 8h | 权限边界 + 速率限制 |

### 5.3 长期（1个月）- 完整方案落地

| 优先级 | 任务 | 工时 |
|--------|------|------|
| 🟢 P2 | 实现 Layer 2 内容检测 | 8h |
| 🟢 P2 | 实现 Layer 3 深度检测 | 12h |
| 🟢 P2 | 飞书分级通知集成 | 6h |
| 🟢 P2 | 配置系统（YAML + 运行时API） | 8h |
| 🟢 P2 | 健康仪表盘 | 10h |
| 🟢 P2 | 完整测试套件 | 12h |

---

## 六、风险评估

### 6.1 当前代码风险

| 风险 | 等级 | 说明 |
|------|------|------|
| 30秒检测延迟过长 | 🔴 高 | 用户感知卡顿后需等待30秒才恢复 |
| 误报导致任务中断 | 🟡 中 | 连续3次信号可能误判正常慢任务 |
| 恢复动作无限制 | 🟡 中 | 可能频繁点击停止按钮 |
| 无审计追踪 | 🟡 中 | 无法分析恢复操作效果 |

### 6.2 方案实施风险

| 风险 | 等级 | 说明 |
|------|------|------|
| 三层架构复杂度 | 🟡 中 | 可能引入新的稳定性问题 |
| 性能开销 | 🟡 中 | Layer 1 每5秒采集，需控制成本<5ms |
| 状态机维护 | 🟢 低 | 状态转换逻辑需要充分测试 |

---

## 七、结论

### 7.1 总体评价

**方案质量**: ⭐⭐⭐⭐⭐（设计完整、考虑周全）
**实现程度**: ⭐⭐⭐☆☆（约40%，核心框架已搭建，关键特性未实现）
**对齐度**: ⭐⭐☆☆☆（实际代码与方案设计差距较大）

### 7.2 关键结论

1. **方案设计优秀**：Heartbeat Scheme 是一个工业级的三层心跳检测架构设计，覆盖了检测、恢复、通知、配置、测试全链路。

2. **实现进度滞后**：当前代码仅实现了方案的 **40%** 左右，核心类（HeartbeatDetector、RecoveryExecutor 完整版、HeartbeatDaemon）均未实现。

3. **最紧迫的改进**：
   - 缩短心跳周期（30秒 → 10秒）
   - 实现恢复操作审计日志
   - 添加按钮白名单和速率限制

4. **是否继续实施方案**：**推荐继续实施**，但建议分阶段推进：
   - Phase 1（本周）：补齐关键缺陷
   - Phase 2（2周）：核心架构升级
   - Phase 3（1个月）：完整方案落地

---

## 八、附录：文件映射表

| 方案文档 | 对应代码文件 | 实现状态 |
|----------|-------------|----------|
| `part2/2.1-layer1-fast-heartbeat.md` | `cdp/client.ts` | 🟡 部分实现 |
| `part2/2.2-layer2-content-heartbeat.md` | - | ❌ 未实现 |
| `part2/2.3-layer3-deep-heartbeat.md` | - | ❌ 未实现 |
| `part4/4.1-class-structure.md` | - | ❌ 未实现 |
| `part5/5.1-permission-boundaries.md` | `actions/recover.ts` | 🟡 部分实现 |
| `part6/6.1-lifecycle-management.md` | `cdp/client.ts` | 🟡 部分实现 |
| `part7/7.1-notification-levels.md` | `lark/client.ts` | 🟡 部分实现 |
| `part9/9.1-task-machine-changes.md` | `runner-multi.ts` | ✅ 已实现 |

---

**评审人**: AI Assistant
**评审日期**: 2026-04-29
**状态**: 待架构师确认
