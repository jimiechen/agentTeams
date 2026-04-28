# Wiki Scheduler Windows 任务计划配置脚本
# 以管理员身份运行 PowerShell 执行此脚本

$TaskName = "WikiScheduler-DailyDistill"
$TaskNameMerge = "WikiScheduler-WeeklyMerge"
$WorkingDir = "D:\TraeProject\agentTeams\mvp-runner"
$ScriptPath = "D:\TraeProject\agentTeams\mvp-runner\scripts\wiki-scheduler.ts"

# 检查是否以管理员身份运行
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "请以管理员身份运行此脚本！"
    exit 1
}

Write-Host "=== Wiki Scheduler 任务计划配置 ===" -ForegroundColor Cyan

# 每日凌晨4:00执行蒸馏
$ActionDistill = New-ScheduledTaskAction -Execute "npx" -Argument "tsx scripts/wiki-scheduler.ts distill" -WorkingDirectory $WorkingDir
$TriggerDistill = New-ScheduledTaskTrigger -Daily -At "04:00"
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# 注册每日蒸馏任务
Register-ScheduledTask -TaskName $TaskName -Action $ActionDistill -Trigger $TriggerDistill -Settings $Settings -Force
Write-Host "✅ 已创建每日蒸馏任务: $TaskName (每天 04:00)" -ForegroundColor Green

# 每周日凌晨5:00执行合并
$ActionMerge = New-ScheduledTaskAction -Execute "npx" -Argument "tsx scripts/wiki-scheduler.ts merge" -WorkingDirectory $WorkingDir
$TriggerMerge = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At "05:00"

# 注册每周合并任务
Register-ScheduledTask -TaskName $TaskNameMerge -Action $ActionMerge -Trigger $TriggerMerge -Settings $Settings -Force
Write-Host "✅ 已创建每周合并任务: $TaskNameMerge (每周日 05:00)" -ForegroundColor Green

Write-Host ""
Write-Host "任务列表:" -ForegroundColor Cyan
Get-ScheduledTask -TaskName "WikiScheduler-*" | Select-Object TaskName, State, NextRunTime | Format-Table

Write-Host ""
Write-Host "如需删除任务，请执行:" -ForegroundColor Yellow
Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName' -Force"
Write-Host "  Unregister-ScheduledTask -TaskName '$TaskNameMerge' -Force"
