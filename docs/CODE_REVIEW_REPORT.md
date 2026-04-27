# MVP Runner 代码评审报告

**评审时间**: 2026-04-27  
**评审文档**:
- `TabAI会话_1777266160703.md` - 方向A完整代码（第一部分）
- `TabAI会话_1777266171586.md` - 方向A完整代码（第二部分）

---

## 1. 项目结构对比

### 文档定义的结构
```
mvp-runner/
├── package.json
├── tsconfig.json
├── .env                          # 飞书凭据
├── config/
│   ├── selectors.v2026-04-26.json  ✅ 已存在
│   └── pmbot.yaml                 ❌ 缺失
├── src/
│   ├── index.ts                   ❌ 缺失（服务入口）
│   ├── config.ts                  ❌ 缺失
│   ├── cdp/
│   │   └── client.ts              ✅ 已存在（功能对齐）
│   ├── selectors/
│   │   └── resolver.ts            ✅ 已存在（功能对齐）
│   ├── actions/                   ✅ 已存在
│   │   ├── switch-task.ts         ✅ 已存在
│   │   ├── fill-prompt.ts         ✅ 已存在
│   │   ├── submit.ts              ✅ 已存在
│   │   └── wait-response.ts       ✅ 已存在
│   ├── lark/                      ❌ 缺失（整个目录）
│   │   ├── client.ts
│   │   └── parser.ts
│   ├── mutex.ts                   ❌ 缺失
│   └── runner.ts                  ⚠️ 存在但功能不同
└── runs/                          ✅ 目录自动创建
```

### 当前项目实际结构
```
mvp-runner/
├── package.json                   ⚠️ 依赖不完整
├── tsconfig.json                  ✅ 存在
├── config/
│   └── selectors.v2026-04-26.json ✅ 存在
├── src/
│   ├── runner.ts                  ⚠️ 命令行批处理版本
│   ├── errors.ts                  ✅ 存在
│   ├── cdp/client.ts              ✅ 存在
│   ├── selectors/resolver.ts      ✅ 存在
│   └── actions/                   ✅ 存在
└── prompts.yaml                   ✅ 存在（命令行配置）
```

---

## 2. 依赖对比

### 文档要求的依赖
```json
{
  "dependencies": {
    "@larksuiteoapi/node-sdk": "^1.36.0",  ❌ 缺失
    "async-mutex": "^0.5.0",               ❌ 缺失
    "chrome-remote-interface": "^0.33.0",  ✅ 存在
    "debug": "^4.3.7",                     ✅ 存在
    "dotenv": "^16.4.5",                   ❌ 缺失
    "p-retry": "^6.2.0",                   ❌ 缺失
    "yaml": "^2.5.1"                       ✅ 存在
  }
}
```

### 当前实际依赖
```json
{
  "dependencies": {
    "chrome-remote-interface": "^0.33.2",
    "debug": "^4.3.4",
    "yaml": "^2.3.4"
  }
}
```

**缺失依赖**: `@larksuiteoapi/node-sdk`, `async-mutex`, `dotenv`, `p-retry`

---

## 3. 代码质量评审

### 3.1 ✅ 优秀对齐的部分

| 文件 | 对齐度 | 说明 |
|------|--------|------|
| `cdp/client.ts` | 95% | 功能完全对齐，现有代码添加了更完善的 TypeScript 类型定义 |
| `selectors/resolver.ts` | 90% | 功能对齐，实现方式略有不同但等效 |
| `actions/fill-prompt.ts` | 90% | 基本对齐，文档中的版本有额外的回读校验 |
| `actions/switch-task.ts` | 85% | 功能对齐，文档版本使用 SelectorResolver 类 |
| `actions/submit.ts` | 85% | 功能对齐，现有版本缺少坐标点击 |
| `actions/wait-response.ts` | 90% | 算法完全一致 |
| `errors.ts` | 95% | 错误类型定义对齐 |

### 3.2 ⚠️ 需要调整的部分

#### 1) `runner.ts` - 功能分叉
- **当前版本**: 命令行批处理工具（读取 YAML 配置顺序执行任务）
- **文档版本**: 飞书消息处理器（WebSocket 监听 + ChatMutex 串行化）
- **建议**: 保留当前版本为 `batch-runner.ts`，新增文档版本为 `lark-runner.ts`

#### 2) `actions/submit.ts` - 点击方式
- **当前**: `document.querySelector().click()`
- **文档**: 使用 CDP `Input.dispatchMouseEvent` 模拟真实点击
- **建议**: 统一使用文档版本的坐标点击方式

#### 3) `actions/fill-prompt.ts` - 验证逻辑
- **当前**: 简单的文本对比
- **文档**: 更完善的验证和警告日志
- **建议**: 合并文档版本的验证逻辑

---

## 4. 缺失文件清单（按优先级）

### P0 - 核心缺失（阻塞方向A实现）
1. `src/lark/client.ts` - 飞书 WebSocket 客户端
2. `src/lark/parser.ts` - @PMCLI 消息解析器
3. `src/mutex.ts` - ChatMutex 串行化锁
4. `src/config.ts` - 配置加载模块
5. `src/index.ts` - 服务入口文件

### P1 - 配置缺失
6. `.env` - 环境变量配置
7. `config/pmbot.yaml` - PMCLI 行为配置

### P2 - 依赖缺失
8. `@larksuiteoapi/node-sdk` - 飞书官方 SDK
9. `async-mutex` - 异步互斥锁
10. `dotenv` - 环境变量加载
11. `p-retry` - 重试逻辑

---

## 5. 文档一致性检查

### 5.1 文档间对齐
- ✅ 两篇文档代码衔接完整，无断裂
- ✅ 类定义、接口定义一致
- ✅ 导入路径一致（使用 `.js` 扩展名）

### 5.2 代码风格
- ✅ 统一使用单引号
- ✅ 统一使用 2 空格缩进
- ✅ 统一使用 `debug` 模块
- ✅ 统一错误处理方式

---

## 6. 风险识别

### 风险 1: 选择器版本兼容性
**问题**: `selectors.v2026-04-26.json` 中的选择器基于特定 Trae 版本  
**影响**: Trae 升级后可能失效  
**缓解**: 已实现 `resolver.ts` 的 fallback 机制

### 风险 2: 飞书权限配置
**问题**: 文档提到需要多个权限，但当前项目无飞书配置  
**影响**: 方向A无法运行  
**缓解**: 需补充 `.env` 和飞书开发者后台配置

### 风险 3: CDP 端口冲突
**问题**: 默认使用 9222 端口  
**影响**: 多实例运行会冲突  
**缓解**: 已支持通过配置自定义端口

---

## 7. 评审结论

### 总体评价
当前项目完成了 **方向A的 60%** - CDP 操作层（actions）基本完整，但 **飞书集成层完全缺失**。

### 对齐建议
1. **短期**: 将现有代码作为 "Batch Mode" 保留，补充飞书相关文件实现 "Lark Mode"
2. **中期**: 统一 actions 实现（采用文档版本的坐标点击）
3. **长期**: 抽象出 Core 层，支持多种触发方式（CLI/Batch/Lark/HTTP）

### 下一步行动
- [ ] 安装缺失依赖
- [ ] 创建 `src/lark/` 目录及相关文件
- [ ] 创建 `src/config.ts`, `src/mutex.ts`, `src/index.ts`
- [ ] 创建 `.env` 和 `config/pmbot.yaml` 模板
- [ ] 重构 `runner.ts` 分离 Batch 和 Lark 逻辑

---

## 8. 代码质量评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | 6/10 | CDP层完整，Lark层缺失 |
| 代码规范 | 8/10 | TypeScript 类型完善 |
| 文档对齐 | 7/10 | 核心逻辑对齐，结构有差异 |
| 可维护性 | 7/10 | 模块化良好，但版本管理需加强 |
| 风险管控 | 6/10 | 选择器 fallback 机制已实现 |

**综合评分**: 6.8/10

---

评审人: AI Agent  
评审完成时间: 2026-04-27
