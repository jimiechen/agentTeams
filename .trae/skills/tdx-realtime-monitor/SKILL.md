---
name: "tdx-realtime-monitor"
description: "Monitor real-time stock prices for TDX custom sectors during trading hours. Invoke when user needs to monitor stocks in custom sectors like '3倍量YYYYMMDD' and get alerts when price rise exceeds threshold."
---

# TDX Real-time Sector Monitor

## Overview

This skill monitors real-time stock prices for TDX (通达信) custom sectors during trading hours. It retrieves stock lists from specified sectors, polls market data periodically, and triggers alerts when stock price rises exceed the configured threshold.

## Use Cases

- Monitor stocks in "3倍量" sectors created by triple-volume stock picker
- Track price movements of historical sector stocks during trading hours
- Get real-time alerts when stocks show significant price increases

## Features

- **Sector-based monitoring**: Monitor stocks by sector name (e.g., "3倍量20260226")
- **Multi-sector support**: Monitor multiple historical sectors simultaneously
- **Batch data retrieval**: Efficiently fetch market data for all stocks in sectors
- **Price rise alerts**: Configurable threshold (default 5%)
- **Debounce mechanism**: Prevent duplicate alerts within 10 seconds
- **Trading hours check**: Only monitor during market hours (9:30-11:30, 13:00-15:00)
- **Feishu notifications**: Optional webhook integration for alerts

## Usage

### Command Line

```bash
# Monitor a specific sector
python tdx_sector_monitor.py --sector "3倍量20260226"

# Monitor recent N days of sectors
python tdx_sector_monitor.py --days 5

# Custom threshold and interval
python tdx_sector_monitor.py --sector "3倍量20260226" --threshold 3.0 --interval 3
```

### Parameters

- `--sector`: Sector name to monitor (e.g., "3倍量20260226")
- `--days`: Monitor sectors from last N trading days (alternative to --sector)
- `--threshold`: Price rise threshold percentage (default: 5.0)
- `--interval`: Polling interval in seconds (default: 5)
- `--output`: Output directory for logs (default: ./output/realtime_monitor)
- `--feishu-webhook`: Feishu webhook URL for notifications (optional)

## Output

- Console output with real-time monitoring status
- Log file with timestamped alerts
- Feishu notifications (if webhook configured)

## Requirements

- TDX financial terminal must be running
- Python 3.8+
- tqcenter module from TDX
