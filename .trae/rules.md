# Trae Agent Team 全局规则
# 位置：.trae/rules.md
# 作用：所有智能体共享的约束与上下文

## 📜 全局约束（DoD 核心）

### 通用 DoD（所有模块必须满足）
1. 代码通过 ESLint 检查（零 error）
2. 所有测试通过
3. 测试覆盖率达标（核心 ≥90%，一般 ≥80%）
4. TypeScript 类型检查通过
5. 无新增 TODO/FIXME
6. 关键路径有测试覆盖
7. AI 生成代码已审查
8. 文档同步更新
9. 结构化日志输出
10. 错误路径有告警

### AI 编码专项 DoD
A1. AI Prompt 可追溯（标注 `@ai-gen`）
A2. 测试先行（功能代码与测试同步提交）
A3. 边界用例覆盖（空输入、超长、并发、超时）
A4. 无魔法数字（超时/重试提取为配置）
A5. 降级路径可测试（fallback 可 mock 触发）
A6. 禁止硬编码凭证（通过 secret-manager 加载）

## 🔒 安全红线

- 禁止硬编码 App Secret / Token
- 禁止 `rm -rf /`、`sudo`、`chmod 777` 等危险命令
- CDP 端口仅绑定 127.0.0.1
- 禁止 `console.log/error`，使用 `logger`
- 敏感信息使用加密存储

## 📂 项目上下文

- PRD: `trae-agent-team-prd.md`
- DoD: `docs/DO_AND_TESTING_SPEC.md`
- CDP Mock: `docs/CDP_MOCK_STRATEGY.md`
- 执行卡片: `exec-units/*.yaml`
- AI 指令: `.ai-prompts/executable-contract.md`

## 🔄 工作流

1. 需求拆解 → @architect 生成执行卡片
2. 代码生成 → @core-dev 按卡片实现
3. 质量验证 → @qa-expert + @security-reviewer 审查
4. 工程交付 → @devops-eng + @pm-lead 验收
