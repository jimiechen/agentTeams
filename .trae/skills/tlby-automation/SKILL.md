---
name: tlby-automation
description: "自动化操作天龙博弈股票软件，输入股票代码截图并分析生成报告。Use for querying stock data from TLBY software and generating analysis reports."
always: true
metadata: {"nanobot":{"emoji":"📈","os":["windows"],"requires":{"bins":["python"]},"install":[{"id":"pip","kind":"pip","packages":["pyautogui","Pillow","pygetwindow"],"label":"Install Python GUI dependencies"}],"always":true}}
---

# 天龙博弈自动化 (TLBY Automation)

使用Python GUI自动化操作天龙博弈股票软件，输入股票代码后截图，并通过nanobot的AI能力分析生成markdown报告。

## 功能特性

- 🚀 自动启动或激活天龙博弈软件
- ⌨️ 自动输入股票代码并确认
- 📊 自动切换到日K线图
- 📸 **双截图功能**：
  - 切换日K线前：截取**分时图**（实时走势）
  - 切换日K线后：截取**日K线图**（技术分析）
- 🤖 使用AI分析股票数据（D标识、亮灯数等）
- 📝 生成结构化markdown分析报告

## 安装依赖

```bash
pip install pyautogui Pillow pygetwindow
```

## 使用方法

### 基础使用（软件已启动）

```bash
python scripts/tlby_auto.py --code 002735 --no-launch
```

### 完整流程（自动启动软件）

```bash
python scripts/tlby_auto.py --code 002735
```

### 指定输出目录

```bash
python scripts/tlby_auto.py --code 002735 --output-dir ./stock_reports
```

## 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--code` | 股票代码（必填） | - |
| `--output-dir` | 输出目录 | `./output` |
| `--no-launch` | 跳过启动软件（软件已在运行） | `False` |
| `--wait-time` | 等待数据加载时间（秒） | `3` |
| `--app-path` | 天龙博弈程序路径 | `C:\Program Files (x86)\天龙博弈\bin\tlby.exe` |

## 输出文件

运行后会生成以下文件：

- `intraday_{股票代码}_{时间戳}.png` - **分时图截图**（切换日K线前，显示当日实时走势）
- `daily_{股票代码}_{时间戳}.png` - **日K线图截图**（切换日K线后，显示技术分析指标）
- `analysis_{股票代码}_{时间戳}.md` - AI分析报告（包含两张截图的分析要点）

## 分析报告内容

AI分析报告包含：

### 基本信息
- 📊 股票代码、分析时间、数据来源

### 分时图分析（切换日K线前）
- 📈 当日价格走势曲线
- 📊 成交量分布情况
- 📍 均价线位置
- 📋 实时买卖盘情况

### 日K线图分析（切换日K线后）
- 🔍 日K线D标识检测
- 💡 三龙聚首指标亮灯数统计
- 📈 近期价格趋势
- 📊 成交量变化
- 📋 技术指标信号

### 综合分析
- 🔗 短期走势（分时图）与中期趋势（日K线）一致性判断
- 🎯 关键支撑和阻力位
- ⏰ 买卖时机建议

## 注意事项

1. **权限要求**: 需要管理员权限运行，以便控制其他应用程序
2. **分辨率**: 建议在1920x1080或更高分辨率下使用
3. **软件状态**: 确保天龙博弈软件可以正常启动
4. **窗口位置**: 确保天龙博弈窗口没有被其他窗口遮挡

## 故障排除

### 无法找到输入框

- 确保天龙博弈软件已完全加载
- 尝试增加 `--wait-time` 参数
- 检查窗口是否被最大化

### 截图失败

- 检查输出目录是否有写入权限
- 确保磁盘空间充足

### AI分析失败

- 检查nanobot是否正确配置AI provider
- 验证网络连接是否正常

## 示例工作流

```bash
# 1. 查询王子新材(002735)
python scripts/tlby_auto.py --code 002735 --no-launch

# 2. 查看生成的报告
cat output/analysis_002735_*.md
```

## 技术实现

- 使用 `pyautogui` 进行GUI自动化
- 使用 `pygetwindow` 激活窗口
- 使用 `PIL` 进行截图
- 支持通过nanobot provider系统进行AI分析
