# 心跳检测方案 · 完整技术文档

## 概述

本方案为 Trae Agent Team MVP 项目设计的心跳检测机制，用于自动识别和处理任务执行过程中的异常状态，实现有限自治和可观测性。

## 目录结构

```
heartbeat-scheme/
├── README.md                                    # 本文档
├── REVIEW.md                                    # 评审意见文档
├── part1-problem-diagnosis/                     # Part 1: 问题诊断与设计原则
│   ├── 1.1-interrupt-modes.md                   # 五种中断模式的本质差异
│   ├── 1.2-heartbeat-limitations.md             # 固定频率心跳的局限性
│   ├── 1.3-design-principles.md                 # 心跳机制三条核心设计原则
│   └── 1.4-existing-reuse.md                    # 与现有脚本能力的复用关系
├── part2-three-layer-architecture/              # Part 2: 三层心跳架构设计
│   ├── 2.1-layer1-fast-heartbeat.md             # Layer 1 快速心跳（5秒）
│   ├── 2.2-layer2-content-heartbeat.md          # Layer 2 内容心跳（15秒）
│   ├── 2.3-layer3-deep-heartbeat.md             # Layer 3 深度心跳（60秒）
│   ├── 2.4-signal-passing.md                    # 三层信号传递机制
│   └── 2.5-frequency-optimization.md            # 频率动态调优策略
├── part3-health-state-machine/                  # Part 3: 健康状态机设计
│   ├── 3.1-health-modes.md                      # 7种健康模式定义
│   ├── 3.2-state-transition-matrix.md           # 状态转移矩阵
│   ├── 3.3-priority-rules.md                    # 模式判定优先级规则
│   └── 3.4-recovery-mechanism.md                # 状态回落机制
├── part4-heartbeat-detector/                    # Part 4: 心跳探测器实现
│   ├── 4.1-class-structure.md                   # HeartbeatDetector 类结构
│   ├── 4.2-layer1-fast-detection.md             # Layer 1 快速探测脚本
│   ├── 4.3-layer2-content-detection.md          # Layer 2 内容探测脚本
│   ├── 4.4-layer3-deep-detection.md             # Layer 3 深度探测脚本
│   └── 4.5-mode-decision-algorithm.md           # 模式判定算法
├── part5-recovery-executor/                     # Part 5: 自动恢复执行器
│   ├── 5.1-permission-boundaries.md             # 权限边界
│   ├── 5.2-workspace-strategies.md              # 工作区策略配置
│   ├── 5.3-recovery-actions/                    # 五种恢复动作
│   │   ├── 5.3.1-terminal-hang.md
│   │   ├── 5.3.2-modal-blocking.md
│   │   ├── 5.3.3-model-stalled.md
│   │   ├── 5.3.4-task-interrupted.md
│   │   └── 5.3.5-model-queuing.md
│   └── 5.4-debounce-idempotent.md               # 防抖与幂等性保护
├── part6-heartbeat-daemon/                      # Part 6: 心跳守护进程
│   ├── 6.1-lifecycle-management.md              # 生命周期管理
│   ├── 6.2-timer-strategies.md                  # Timer 启停策略
│   ├── 6.3-waitresponse-integration.md          # 与 waitResponse 集成
│   ├── 6.4-error-cleanup.md                     # 异常退出与资源清理
│   └── 6.5-metrics-persistence.md               # metrics 持久化
├── part7-lark-notification/                     # Part 7: 飞书通知协议
│   ├── 7.1-notification-levels.md               # 三级通知分级体系
│   ├── 7.2-info-recovery-format.md              # info 级消息格式
│   ├── 7.3-critical-alert-format.md             # critical 级告警格式
│   ├── 7.4-frequency-control.md                 # 通知频率控制机制
│   └── 7.5-wikibot-integration.md               # 与 WikiBot 的知识联动
├── part8-config-ops/                            # Part 8: 配置与运维
│   ├── 8.1-heartbeat-yaml.md                    # heartbeat.yaml 配置文件
│   ├── 8.2-env-variables.md                     # 环境变量管理
│   ├── 8.3-runtime-admin-api.md                 # 运行时动态调整接口
│   └── 8.4-health-dashboard.md                  # 心跳健康度仪表盘
├── part9-architecture-integration/              # Part 9: 与现有架构的集成
│   ├── 9.1-task-machine-changes.md              # task-machine.ts 改造点
│   ├── 9.2-chat-mutex-coordination.md           # chat-mutex 并发协调
│   ├── 9.3-runner-multi-isolation.md            # 多工作区隔离
│   └── 9.4-runs-write-impact.md                 # runs/*.md 写入逻辑影响
├── part10-testing-validation/                   # Part 10: 测试与验证
│   ├── 10.1-manual-trigger-modes.md             # 五种中断模式的人工触发
│   ├── 10.2-e2e-test-cases.md                   # 端到端测试用例
│   ├── 10.3-long-running-validation.md          # 24 小时稳定性测试
│   └── 10.4-rollback-strategy.md                # 回滚与降级策略
└── part11-roadmap/                              # Part 11: 实施路线图
    ├── 11.1-mvp-scope.md                        # MVP 范围与 3 天落地计划
    ├── 11.2-full-version.md                     # 完整版能力与 7 天计划
    └── 11.3-iteration-plan.md                   # 优化迭代与长期演进
```

## 核心设计

### 五种中断模式

| 模式 | 根因层 | 时效性要求 | 自治可行性 |
|------|-------|----------|----------|
| model-stalled | 模型推理层 | 30s 内识别 | ✅ stop+retry |
| terminal-hang | 工具执行层 | 5s 内识别 | ✅ 点击按钮 |
| modal-blocking | UI 交互层 | 5s 内识别 | ✅ 按策略点击 |
| model-queuing | 服务容量层 | 无需干预 | ❌ 只能等待 |
| task-interrupted | 系统异常层 | 立即识别 | ❌ 人工介入 |

### 三层心跳架构

| 层级 | 频率 | 职责 |
|------|------|------|
| Layer 1 | 5秒 | 快速检测按钮类显式异常 |
| Layer 2 | 15秒 | 检测文本增量和排队状态 |
| Layer 3 | 60秒 | 采集健康度指标 |

### 三条核心设计原则

1. **分层采样**：按"发现时效性 × 采集成本"矩阵分层
2. **有限自治**：白名单内异常模式 + 重试上限
3. **可观测优先**：所有决策写入 heartbeat.jsonl

## 实施路线图

| 阶段 | 时间 | 目标 |
|------|------|------|
| MVP | 3 天 | Layer 1 + terminal-hang + modal-blocking |
| 完整版 | 7 天 | Layer 2/3 + model-stalled + model-queuing |
| 优化迭代 | 长期 | 策略自适应 + 可观测增强 + 知识沉淀 |

## 文档统计

- **总文件数**：51 个
- **总目录数**：12 个
- **覆盖范围**：问题诊断 → 架构设计 → 代码实现 → 测试验证 → 实施落地

---

*文档版本: 2026-04-29*  
*最后更新: 完整版*
