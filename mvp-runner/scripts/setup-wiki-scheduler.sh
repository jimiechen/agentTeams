#!/bin/bash
# Wiki Scheduler Crontab 配置脚本
# 用法: chmod +x setup-wiki-scheduler.sh && ./setup-wiki-scheduler.sh

WORKING_DIR="/workspace/mvp-runner"
SCRIPT_PATH="$WORKING_DIR/scripts/wiki-scheduler.ts"
CRON_DISTILL="0 4 * * * cd $WORKING_DIR && npx tsx scripts/wiki-scheduler.ts distill >> logs/wiki-scheduler.log 2>&1"
CRON_MERGE="0 5 * * 0 cd $WORKING_DIR && npx tsx scripts/wiki-scheduler.ts merge >> logs/wiki-scheduler.log 2>&1"

echo "=== Wiki Scheduler Crontab 配置 ==="
echo ""

# 检查现有crontab
EXISTING=$(crontab -l 2>/dev/null || true)

# 检查是否已存在wiki-scheduler条目
if echo "$EXISTING" | grep -q "wiki-scheduler"; then
    echo "⚠️  已存在wiki-scheduler任务，跳过添加"
    echo ""
    echo "当前wiki-scheduler任务:"
    echo "$EXISTING" | grep "wiki-scheduler"
else
    # 添加新任务
    {
        echo "$EXISTING"
        echo ""
        echo "# === Wiki Scheduler (LLM Wiki v2.0) ==="
        echo "# 每天凌晨4:00执行蒸馏"
        echo "$CRON_DISTILL"
        echo ""
        echo "# 每周日凌晨5:00执行合并"
        echo "$CRON_MERGE"
    } | crontab -

    echo "✅ 已添加wiki-scheduler任务到crontab"
    echo ""
    echo "新增任务:"
    echo "  每日蒸馏: $CRON_DISTILL"
    echo "  每周合并: $CRON_MERGE"
fi

echo ""
echo "当前所有wiki-scheduler任务:"
crontab -l | grep "wiki-scheduler" || echo "  (无)"

echo ""
echo "如需手动删除，执行: crontab -e 并删除对应行"
