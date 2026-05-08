# Skill 安装包: tlby-automation (天龙博弈自动化)

> **Skill名称:** tlby-automation
> **版本:** 1.0.0
> **分类:** 截图自动化
> **状态:** 待签约

---

## 一、Skill 概述

自动化操作天龙博弈股票软件，输入股票代码后切换到日K线图，截图保存并生成分析报告。支持批量处理CSV股票列表，与通达信截图形成互补。

---

## 二、安装信息

### 2.1 代码位置

| 项目 | 路径 |
|------|------|
| **Skill根目录** | `d:\agentsTeam\skills\nanobot\tlby-automation\` |
| **SKILL.md** | `d:\agentsTeam\skills\nanobot\tlby-automation\SKILL.md` |
| **核心脚本** | `d:\agentsTeam\skills\nanobot\tlby-automation\scripts\tlby_auto.py` |
| **股票分析** | `scripts/analyze_stock.py` |
| **批量截图** | `scripts/batch_screenshot_from_csv.py` |
| **批量3倍量** | `scripts/batch_tlby_triple_volume.py` |
| **火山引擎分析** | `scripts/analyze_with_volcengine.py`, `scripts/test_volcengine.py` |

### 2.2 环境依赖

| 依赖项 | 版本要求 | 安装方式 |
|--------|----------|----------|
| Python | 3.7+ | 系统自带 |
| pyautogui | 最新版 | `pip install pyautogui` |
| Pillow | 最新版 | `pip install Pillow` |
| pygetwindow | 最新版 | `pip install pygetwindow` |
| requests | 最新版 | `pip install requests` (火山引擎分析) |

### 2.3 天龙博弈配置

| 配置项 | 值 |
|--------|-----|
| **程序路径** | `C:\Program Files (x86)\天龙博弈\bin\tlby.exe` |
| **窗口标题** | "天龙博弈", "TLBY", "tlby", "约牛" |
| **截图次数** | 2次（分时图 + 日K线） |

---

## 三、核心功能

### 3.1 功能列表

| # | 功能 | 说明 |
|---|------|------|
| 1 | **自动启动软件** | 自动启动天龙博弈（可选） |
| 2 | **窗口激活** | 自动激活天龙博弈窗口并最大化 |
| 3 | **输入股票代码** | 点击输入框并输入股票代码 |
| 4 | **日K线切换** | 切换到日K线图 |
| 5 | **双截图** | 分时图截图 + 日K线截图 |
| 6 | **批量处理** | 从CSV文件批量处理股票列表 |
| 7 | **AI分析** | 使用火山引擎进行股票形态分析 |

### 3.2 操作流程

```
1. 启动/激活天龙博弈 (tlby.exe)
2. 点击输入框
3. 输入股票代码
4. 按回车确认
5. 等待数据加载
6. 截图1: 分时图
7. 切换到日K线
8. 截图2: 日K线图
9. 保存截图到指定目录
```

---

## 四、使用方法

### 4.1 命令行参数 (tlby_auto.py)

```bash
python tlby_auto.py [选项]
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--code` | 股票代码（必填） | - |
| `--output-dir` | 输出目录 | `./output` |
| `--no-launch` | 跳过启动软件 | False |
| `--wait-time` | 等待时间（秒） | 3 |
| `--app-path` | 程序路径 | `C:rogram Files (x86)龙博弈in	lby.exe` |

### 4.2 单股票截图

```bash
cd d:\agentsTeam\skills\nanobot\tlby-automation
python scripts\tlby_auto.py --code 000001 --no-launch
```

### 4.3 批量截图

```bash
python scripts\batch_screenshot_from_csv.py --input stocks.csv --output-dir ./screenshots
```

### 4.4 批量3倍量截图

```bash
python scripts\batch_tlby_triple_volume.py --date 20260213
```

---

## 五、接口说明

### 5.1 主要函数

| 函数 | 说明 |
|------|------|
| `launch_application(app_path)` | 启动天龙博弈 |
| `activate_tlby_window()` | 激活天龙博弈窗口 |
| `input_stock_code(code)` | 输入股票代码 |
| `switch_to_daily_kline()` | 切换到日K线 |
| `take_screenshot(output_dir, code)` | 截图并保存 |
| `analyze_with_volcengine(image_path)` | 火山引擎AI分析 |

---

## 六、与通达信截图对比

| 特性 | 天龙博弈自动化 | 通达信测试版截图 |
|------|----------------|------------------|
| **程序路径** | `tlby.exe` | `tdxw.exe` |
| **输入方式** | 点击输入框直接输入 | 输入代码 → 回车 → Ctrl+X |
| **截图次数** | 2次（分时图+日K线） | 1次（当前视图） |
| **窗口标题** | "天龙博弈", "TLBY" | "通达信", "tdx", "TDX" |
| **AI分析** | 支持火山引擎 | 不支持 |
| **批量处理** | 支持CSV批量 | 支持单只 |

---

## 七、集成关系

### 7.1 上游依赖

| Skill/服务 | 关系 | 说明 |
|------------|------|------|
| 天龙博弈软件 | **强依赖** | 必须安装并可启动 |
| Windows GUI | **强依赖** | 需要图形界面环境 |

### 7.2 下游消费

| Skill/服务 | 关系 | 说明 |
|------------|------|------|
| 股票监控系统 | 调用截图 | 地量条件触发时截图 |
| 火山引擎 | AI分析 | 股票形态识别 |

---

## 八、注意事项

### 8.1 运行要求

| 项目 | 要求 |
|------|------|
| **权限** | 需要管理员权限运行 |
| **分辨率** | 建议在1920x1080或更高分辨率下使用 |
| **软件状态** | 确保天龙博弈可以正常启动 |

### 8.2 故障排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 无法找到窗口 | 软件未完全加载 | 增加等待时间 |
| 输入框点击失败 | 分辨率变化 | 调整点击坐标 |
| 截图失败 | 窗口被遮挡 | 确保窗口在最前 |

---

## 九、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-02-03 | 初始版本 |

---

## 十、关联文档

| 文档 | 路径 |
|------|------|
| 原始开发文档 | [通达信截图保存Skill.md](file:///d:/agentsTeam/.trae/documents/skills+doc/通达信截图保存Skill.md) |
| Skill目录大纲 | [Skill签约目录大纲.md](file:///d:/agentsTeam/.trae/documents/skills+doc/Skill签约目录大纲.md) |
