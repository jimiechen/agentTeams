# 心跳检测方案评审材料汇总

**评审日期**: 2026-04-29  
**评审范围**: heartbeat-scheme 完整技术方案

---

## 一、方案概述

### 1.1 核心目标

将 Trae 任务执行过程中的**被动异常处理**转变为**主动心跳监控**，实现：

- **持续监控**：每 5 秒采集一次信号，主动发现异常
- **自动恢复**：对可恢复的异常（terminal-hang、modal-blocking）自动执行恢复动作
- **可观测性**：完整的心跳日志和告警机制

### 1.2 五种中断模式

| 模式 | 根因 | 时效性 | 自治可行性 |
|------|------|--------|-----------|
| **model-stalled** | 模型推理停滞 | 30s 识别 | ✅ stop+retry |
| **terminal-hang** | 终端执行挂起 | 5s 识别 | ✅ 点击后台运行 |
| **modal-blocking** | UI 弹窗阻塞 | 5s 识别 | ✅ 按策略点击 |
| **model-queuing** | 服务排队 | 无需干预 | ❌ 被动等待 |
| **task-interrupted** | 任务中断 | 立即识别 | ❌ 人工介入 |

---

## 二、文档结构

### 2.1 完整文档清单

```
heartbeat-scheme/
├── README.md                          # 总览文档
├── REVIEW.md                          # 评审意见
├── part1-problem-diagnosis/           # Part 1: 问题诊断与设计原则 (4个文件)
├── part2-three-layer-architecture/    # Part 2: 三层心跳架构设计 (5个文件)
├── part3-health-state-machine/        # Part 3: 健康状态机设计 (4个文件)
├── part4-heartbeat-detector/          # Part 4: 心跳探测器实现 (5个文件)
├── part5-recovery-executor/           # Part 5: 自动恢复执行器 (6个文件)
├── part6-heartbeat-daemon/            # Part 6: 心跳守护进程 (5个文件)
├── part7-lark-notification/           # Part 7: 飞书通知协议 (5个文件)
├── part8-config-ops/                  # Part 8: 配置与运维 (4个文件)
├── part9-architecture-integration/    # Part 9: 与现有架构的集成 (4个文件)
├── part10-testing-validation/         # Part 10: 测试与验证 (4个文件)
└── part11-roadmap/                    # Part 11: 实施路线图 (3个文件)
```

**总计**: 53 个 Markdown 文件

### 2.2 各 Part 核心内容

| Part | 主题 | 核心产出 |
|------|------|---------|
| **Part 1** | 问题诊断 | 五种中断模式定义、三条设计原则 |
| **Part 2** | 架构设计 | 三层心跳（5s/15s/60s）、信号传递机制 |
| **Part 3** | 状态机 | 7 种健康模式、状态转移矩阵、优先级规则 |
| **Part 4** | 探测器 | HeartbeatDetector 类、三层探测脚本 |
| **Part 5** | 执行器 | RecoveryExecutor 类、五种恢复动作实现 |
| **Part 6** | 守护进程 | HeartbeatDaemon 生命周期、Timer 管理 |
| **Part 7** | 通知协议 | 三级通知（info/warning/critical）、频率控制 |
| **Part 8** | 配置运维 | heartbeat.yaml 设计、环境变量管理 |
| **Part 9** | 架构集成 | task-machine 改造、chat-mutex 协调 |
| **Part 10** | 测试验证 | 人工触发方式、12 个 E2E 测试用例 |
| **Part 11** | 实施路线 | MVP 3 天计划、完整版 7 天计划 |

---

## 三、核心设计亮点

### 3.1 三层心跳架构

```
Layer 1 (5秒)  ─── 快速心跳 ─── 按钮类显式异常
Layer 2 (15秒) ─── 内容心跳 ─── 文本增量检测
Layer 3 (60秒) ─── 深度心跳 ─── 健康度指标采集
```

**设计优势**：
- 不同时效性需求采用不同频率
- 高频层只采轻量信号，低频层做重量级采集
- CPU 占用 < 3%

### 3.2 有限自治原则

```
┌─────────────────────────────────────────────────────────────┐
│  白名单内的异常模式 ───→ 自动恢复（有重试上限）              │
│  超出自治边界 ───→ 立即转人工告警                           │
└─────────────────────────────────────────────────────────────┘
```

**与 watchdog 的区别**：
- watchdog 追求自愈率
- 心跳追求可预测性

### 3.3 可观测优先

所有心跳决策写入 `heartbeat.jsonl`：
- 时间戳 + 工作区 + 模式 + 信号
- 人工排查时 10 秒内看清"系统看到了什么、做了什么"

---

## 四、风险评估

### 4.1 已识别风险

| 风险 | 级别 | 缓解措施 |
|------|------|---------|
| 心跳故障影响主流程 | 高 | 降级开关 `HEARTBEAT_ENABLED=false` |
| 状态机改造引入 Bug | 高 | 完整 E2E 测试、分阶段上线 |
| CDP 连接不稳定 | 中 | 重连机制、5 次失败后停止心跳 |
| 按钮选择器失效 | 中 | 多策略查找、fallback 机制 |

### 4.2 回滚策略

**三级降级机制**：
1. **L1 单动作降级**：某次恢复失败，跳过本次
2. **L2 工作区降级**：某工作区心跳异常，关闭该工作区心跳
3. **L3 全局降级**：心跳机制整体故障，关闭所有心跳

---

## 五、实施计划

### 5.1 MVP 阶段（3 天）

| 天数 | 目标 | 验收标准 |
|------|------|---------|
| Day 1 | Detector 抽象 + Daemon 挂载 | heartbeat.jsonl 有数据 |
| Day 2 | terminal-hang + modal-blocking 恢复 | 自动点击后台运行/保留 |
| Day 3 | 防抖保护 + 5 小时稳定性测试 | CPU < 1%、误操作 0 |

### 5.2 完整版阶段（7 天）

- Layer 2/3 心跳
- model-stalled 恢复
- 24 小时稳定性测试

---

## 六、评审要点

### 6.1 需要确认的问题

1. **Part 10 测试文档是否完整？** - 需要补充完整
2. **心跳看门狗机制是否需要？** - 建议增加
3. **下游代码兼容性清单是否完整？** - 需要盘点

### 6.2 评审结论选项

- [ ] **通过** - 方案完整，可以开始实施
- [ ] **有条件通过** - 需要补充 Part 10、增加看门狗
- [ ] **需要修改** - 存在重大设计问题
- [ ] **不通过** - 方案不可行

---

## 七、相关文档链接

| 文档 | 路径 |
|------|------|
| 方案总览 | [README.md](file:///workspace/heartbeat-scheme/README.md) |
| 评审意见 | [REVIEW.md](file:///workspace/heartbeat-scheme/REVIEW.md) |
| 问题诊断 | [part1-problem-diagnosis/](file:///workspace/heartbeat-scheme/part1-problem-diagnosis/) |
| 架构设计 | [part2-three-layer-architecture/](file:///workspace/heartbeat-scheme/part2-three-layer-architecture/) |
| 实施路线 | [part11-roadmap/](file:///workspace/heartbeat-scheme/part11-roadmap/) |

---

*评审材料版本: 2026-04-29*