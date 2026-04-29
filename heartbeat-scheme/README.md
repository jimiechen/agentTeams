# 心跳检测方案 · 分块目录

## 项目概述

本方案设计了一套完整的分层心跳检测与自动恢复机制，用于监控 Trae Agent 的任务执行状态，处理五种常见的中断模式。

## 目录结构

```
heartbeat-scheme/
├── README.md                          # 本文档 - 目录级视图
├── part1-problem-diagnosis/           # 问题诊断与设计原则
├── part2-three-layer-architecture/    # 三层心跳架构设计
├── part3-health-state-machine/        # 健康状态机设计
├── part4-heartbeat-detector/          # 心跳探测器实现
├── part5-recovery-executor/           # 自动恢复执行器
├── part6-heartbeat-daemon/            # 心跳守护进程
├── part7-lark-notification/           # 飞书通知协议
├── part8-configuration-ops/           # 配置与运维
├── part9-integration/                 # 与现有架构的集成
├── part10-testing/                    # 测试与验证
└── part11-roadmap/                    # 实施路线图
```

---

## **Part 1：问题诊断与设计原则**

```
part1-problem-diagnosis/
├── 1.1-interrupt-modes.md            # 五种中断模式的本质差异
├── 1.2-heartbeat-limitations.md      # 为什么固定频率心跳不够用
├── 1.3-design-principles.md          # 心跳机制的三条核心设计原则
└── 1.4-existing-reuse.md             # 与现有 BUTTON_SCRIPTS_README 的复用关系
```

### 内容概览：
- 分析 model-stalled / terminal-hang / modal-blocking / model-queuing / task-interrupted
- 探讨不同模式的探测成本与时效性矛盾
- 定义分层采样、有限自治、可观测三条原则
- 建立与现有按钮脚本能力的映射关系

---

## **Part 2：三层心跳架构设计**

```
part2-three-layer-architecture/
├── 2.1-layer1-fast-heartbeat.md      # 快速心跳（5秒）：采集项、DOM选择器、成本
├── 2.2-layer2-content-heartbeat.md   # 内容心跳（15秒）：文本增量、停滞判定
├── 2.3-layer3-deep-heartbeat.md      # 深度心跳（60秒）：健康指标、metrics
├── 2.4-signal-passing.md             # 三层之间的信号传递与状态复用
└── 2.5-frequency-optimization.md     # 心跳频率调优策略
```

### 内容概览：
- Layer 1：5秒周期，低延迟，高频率但轻量
- Layer 2：15秒周期，文本增量变化检测
- Layer 3：60秒周期，深度健康评估
- 信号传递链路与状态复用机制
- 高压任务加速 / 空闲任务降频策略

---

## **Part 3：健康状态机设计**

```
part3-health-state-machine/
├── 3.1-health-modes.md               # 7种健康模式的定义与互斥关系
├── 3.2-state-transition-matrix.md    # 状态转移矩阵
├── 3.3-priority-rules.md             # 模式判定的优先级规则
└── 3.4-recovery-mechanism.md         # 状态回落机制
```

### 内容概览：
- 7种健康模式的完整定义
- 从 healthy 到各种异常模式的触发条件矩阵
- 多信号冲突时的裁决规则
- 异常恢复后回到 healthy 的路径

---

## **Part 4：心跳探测器实现**

```
part4-heartbeat-detector/
├── 4.1-class-structure.md            # HeartbeatDetector 类结构与核心接口
├── 4.2-layer1-fast-detection.md      # Layer 1 快速探测脚本
├── 4.3-layer2-content-detection.md   # Layer 2 内容探测脚本
├── 4.4-layer3-deep-detection.md      # Layer 3 深度探测脚本
└── 4.5-mode-decision-algorithm.md    # 模式判定算法
```

### 内容概览：
- CDP evaluate 实现的快速探测
- 文本增量 + 排队识别的内容探测
- 按钮快照 + token 估算的深度探测
- 综合模式判定算法

---

## **Part 5：自动恢复执行器**

```
part5-recovery-executor/
├── 5.1-permission-boundaries.md       # RecoveryExecutor 的权限边界
├── 5.2-workspace-strategies.md        # 工作区策略配置
└── 5.3-recovery-actions/              # 五种恢复动作的具体实现
    ├── 5.3.1-terminal-hang.md
    ├── 5.3.2-modal-blocking.md
    ├── 5.3.3-model-stalled.md
    ├── 5.3.4-task-interrupted.md
    └── 5.3.5-model-queuing.md
└── 5.4-debounce-idempotent.md         # 防抖与幂等性保护
```

### 内容概览：
- 白名单按钮清单
- PMCLI 保守 / DEVCLI 激进的策略配置
- 终端挂起：点击"后台运行"
- 弹窗阻塞：按策略点击"保留/删除"
- 模型停滞：stop + retry + 重试次数限制
- 任务中断：告警挂起，不自动恢复
- 模型排队：被动等待，不干预

---

## **Part 6：心跳守护进程**

```
part6-heartbeat-daemon/
├── 6.1-lifecycle-management.md        # HeartbeatDaemon 的生命周期管理
├── 6.2-timer-strategies.md            # 三层 Timer 的启动、暂停、停止策略
├── 6.3-waitresponse-integration.md    # 与 waitResponse 的集成点
├── 6.4-error-cleanup.md               # 异常退出与资源清理
└── 6.5-metrics-persistence.md         # metrics 持久化规范
```

### 内容概览：
- 任务开始时启动心跳，完成时停止
- 心跳退出时的资源清理
- runs/heartbeat.jsonl 格式规范

---

## **Part 7：飞书通知协议**

```
part7-lark-notification/
├── 7.1-notification-levels.md         # 通知分级（info / warning / critical）
├── 7.2-recovery-success.md            # 自动恢复成功的通知格式
├── 7.3-human-intervention.md          # 需要人工介入的告警格式
├── 7.4-rate-limiting.md               # 通知频率控制
└── 7.5-wikibot-integration.md         # 与 WikiBot 的联动
```

### 内容概览：
- 简短、非打扰的成功通知
- 详细、含排查链接的告警
- 同类异常 5 分钟内只通知一次
- 告警记录进入知识蒸馏

---

## **Part 8：配置与运维**

```
part8-configuration-ops/
├── 8.1-heartbeat-yaml.md             # heartbeat.yaml 配置文件设计
├── 8.2-env-vars.md                   # 环境变量与默认值
├── 8.3-runtime-adjustment.md         # 运行时参数动态调整接口
└── 8.4-dashboard.md                  # 心跳健康度仪表盘
```

### 内容概览：
- 完整的配置选项清单
- 动态调整心跳频率、阈值等
- 基于 heartbeat.jsonl 的可视化方案

---

## **Part 9：与现有架构的集成**

```
part9-integration/
├── 9.1-task-machine-mods.md          # task-machine.ts 的改造点
├── 9.2-chat-mutex-coordination.md     # 与 chat-mutex-machine 的并发协调
├── 9.3-multi-workspace.md            # 多工作区的心跳独立性
└── 9.4-runs-md-impact.md             # 对现有 runs/*.md 写入逻辑的影响
```

### 内容概览：
- 状态机集成点设计
- 并发控制协调策略
- 多工作区隔离机制

---

## **Part 10：测试与验证**

```
part10-testing/
├── 10.1-interrupt-triggers.md         # 五种中断模式的人工触发方式
├── 10.2-e2e-test-cases.md            # 端到端测试用例设计
├── 10.3-long-run-validation.md        # 24小时稳定性测试方案
└── 10.4-rollback-strategy.md         # 回滚策略
```

### 内容概览：
- 便于开发调试的触发方式
- 完整的测试用例矩阵
- 长时间运行验证
- 心跳机制故障时的安全降级

---

## **Part 11：实施路线图**

```
part11-roadmap/
├── 11.1-mvp-scope.md                 # MVP 范围（预计 3 天）
├── 11.2-full-scope.md                # 完整版范围（预计 7 天）
└── 11.3-optimization-iteration.md    # 优化迭代（预计 3 天）
```

### 内容概览：
- MVP：Layer 1 + 2 种恢复动作
- 完整：三层 + 五种恢复
- 优化：频率调优 + 仪表盘

---

## 下一步怎么走？

请告诉我你想先看哪些部分，可以按以下几种方式组合：

**按优先级**：比如 "先看 Part 1 + Part 2 + Part 3"

**按落地顺序**：比如 "先看 Part 4 + Part 5 + Part 6"

**按关注点**：比如 "先看 Part 5 + Part 7"

**全套输出**：比如 "所有 Part 按顺序展开"

选好后告诉我，我再展开具体内容。
