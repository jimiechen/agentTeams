# 通达信3倍量选股定时任务
$ErrorActionPreference = "Stop"

# 设置工作目录
$workDir = "D:\agentsTeam\skills\nanobot\feishu-bitable-manager\scripts"
Set-Location $workDir

# 执行选股脚本
& python tdx_to_bitable.py

# 记录日志
$logDir = "D:\agentsTeam\output\logs"
if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force
}
$logFile = "$logDir\triple_volume_$(Get-Date -Format 'yyyyMMdd').log"
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] 定时任务执行完成" | Out-File -Append -FilePath $logFile
