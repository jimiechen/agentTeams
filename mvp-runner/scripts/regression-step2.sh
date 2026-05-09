#!/usr/bin/env bash
# Step 2 双任务并发：在 PMCLI 思考期间塞入 DEVCLI 干扰任务
# 验证修复后：飞书收到的 PMCLI 回复必须是 PRD 摘要，而不是"现在几点"

set -e
cd "$(dirname "$0")/.."

OUT=comms/reports/regression-2026-05-09/step2
mkdir -p "$OUT"

PMCLI_PROMPT="写一份 500 字的 PRD 摘要，主题是任务隔离漏洞修复，需要包含背景、核心方案、验收标准三段，每段不少于 150 字"
DEVCLI_PROMPT="现在几点"

echo "$PMCLI_PROMPT" > "$OUT/pmcli-prompt.txt"
echo "$DEVCLI_PROMPT" > "$OUT/devcli-prompt.txt"

echo "[step2] launching PMCLI long task..."
npx tsx scripts/inject-prompt.ts \
  --task PMCLI \
  --prompt "$PMCLI_PROMPT" \
  --wait --timeout 240000 \
  --trace-id step2-pmcli \
  > "$OUT/pmcli-reply.txt" 2> "$OUT/pmcli-stderr.txt" &
PMCLI_PID=$!

# 给 PMCLI 5 秒进入 thinking 状态
sleep 5

echo "[step2] injecting DEVCLI distractor..."
npx tsx scripts/inject-prompt.ts \
  --task DEVCLI \
  --prompt "$DEVCLI_PROMPT" \
  --wait --timeout 30000 \
  --trace-id step2-distractor \
  > "$OUT/devcli-reply.txt" 2> "$OUT/devcli-stderr.txt" || true

echo "[step2] waiting PMCLI to finish..."
wait $PMCLI_PID || true

echo "[step2] outputs in $OUT"
