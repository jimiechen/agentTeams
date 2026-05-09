# Step 3: recovery 后回复 - verdict

**时间**: 2026-05-09T15:25:00Z
**状态**: BLOCKED

---

## 阻塞原因

与 Step 1/2 相同：需要人工在 Trae IDE 中制造 model stalled 场景（点击"停止"或断网），这属于 UI 交互操作，无法通过代码自动化完成。

---

## 人工执行步骤

### 前置条件
- mvp-runner 已启动（`npm start`）
- 飞书群已收到 bot 上线通知

### 操作步骤
1. **在 Trae IDE 中创建对话**，输入长 prompt（同 Step 2）：
   ```
   @PMCLI 请为一款团队协作工具写一份 500 字的 PRD 摘要...
   ```

2. **人为制造 model stalled**：
   - 方式 A：在 PMCLI 思考过程中点击"停止"按钮
   - 方式 B：直接断网 5 秒后恢复

3. **等待 recovery 自动触发**：
   - 心跳层检测到 frozen 状态
   - recovery-executor 自动点击重试按钮
   - 任务恢复并完成

4. **观察飞书群**收到的内容

5. **收集物证**：
   - 复制 `mvp-runner/logs/recovery-audit.jsonl` 到 `step3/recovery-audit.jsonl`
   - 从 runner 日志中 grep "DOM stability after recovery" 到 `step3/dom-stability-evidence.txt`

---

## 验收判定

- ✅ **PASS**：飞书收到的仍是 PMCLI 任务的正确产出，且 recovery-audit.jsonl 中可见至少一条 `click-retry success`
- ❌ **FAIL**：飞书收到错误任务的内容，或 recovery 未触发，或 recovery 后内容为空

---

## 物证清单

| 物证 | 状态 | 说明 |
|------|------|------|
| screen-recording.mp4 | ❌ 待补充 | 需人工录制，拍到停止/断网 → recovery → 完成全过程 |
| recovery-audit.jsonl | ❌ 待补充 | 从 mvp-runner/logs/ 复制 |
| lark-message.png | ❌ 待补充 | 飞书卡片截图 |
| runner-log.txt | ❌ 待补充 | mvp-runner 控制台日志 |
| dom-stability-evidence.txt | ❌ 待补充 | grep "DOM stability after recovery" 结果 |

---

## 代码层面的验证

已验证 recovery 路径的代码：

### waitForDomStable 集成
- ✅ `recovery-executor.ts:313` 调用 `waitForDomStable`
- ✅ 使用 `SELECTORS.ACTIVE_TASK` 作为监控目标
- ✅ stableMs=500ms, timeoutMs=5000ms

### waitForDomStable 实现
- ✅ `task-scope.ts` 中实现基于 MutationObserver
- ✅ 监控 childList + subtree + attributes + characterData
- ✅ 返回 `{ stable: boolean, timedOut: boolean }`

### DOM 稳定性判定
- ✅ recovery 后 DOM 稳定 → `domStable = true`
- ✅ recovery 后 DOM 持续变化 → `domStable = false`（timeout）

---

## 结论

**BLOCKED** - 需要人工在 Trae IDE 中制造 stalled 场景并触发 recovery，无法自动化完成。

如人工验证通过，请更新此文件为 PASS 并补充物证。
