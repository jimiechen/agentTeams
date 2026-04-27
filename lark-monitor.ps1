# 飞书群聊消息监听脚本
param(
    [string]$ChatId = "oc_9f741c1f2d5b1fc1e98a0b42c04283c5",
    [string]$BotName = "PMCLI"
)

$processedIds = @()

Write-Host "=== 飞书群聊消息监听 ===" -ForegroundColor Cyan
Write-Host "群聊ID: $ChatId" -ForegroundColor Gray
Write-Host "监控关键字: @$BotName" -ForegroundColor Gray
Write-Host "按 Ctrl+C 停止监听" -ForegroundColor Yellow
Write-Host ""

while ($true) {
    try {
        $result = lark-cli im chat-messages-list --chat-id $ChatId --page-size 20 2>$null | ConvertFrom-Json
        
        if ($result.ok) {
            $messages = $result.data.items
            
            foreach ($msg in $messages) {
                $msgId = $msg.message_id
                
                if ($processedIds -contains $msgId) {
                    continue
                }
                
                $content = $msg.content
                $sender = $msg.sender.name
                
                if ($content -match "@$BotName") {
                    Write-Host ""
                    Write-Host "========================================" -ForegroundColor Green
                    Write-Host "  收到 @$BotName 消息!" -ForegroundColor Green
                    Write-Host "========================================" -ForegroundColor Green
                    Write-Host "时间: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray
                    Write-Host "发送者: $sender" -ForegroundColor Yellow
                    Write-Host "内容: $content" -ForegroundColor White
                    Write-Host "消息ID: $msgId" -ForegroundColor Gray
                    Write-Host "========================================" -ForegroundColor Green
                    Write-Host ""
                }
                
                $processedIds += $msgId
            }
            
            if ($processedIds.Count -gt 100) {
                $processedIds = $processedIds | Select-Object -Last 100
            }
        }
    }
    catch {
        Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] 错误: $_" -ForegroundColor Red
    }
    
    Start-Sleep -Seconds 5
}
