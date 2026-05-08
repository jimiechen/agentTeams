---
name: tdx-test-screenshot
description: "自动化操作通达信测试版股票软件，输入股票代码后按Ctrl+X打开输入框，然后截图保存。Use for taking screenshots of stock data from TDX test version software."
always: true
metadata: {"nanobot":{"emoji":"📊","os":["windows"],"requires":{"bins":["python"]},"install":[{"id":"pip","kind":"pip","packages":["pyautogui","Pillow","pygetwindow"],"label":"Install Python GUI dependencies"}],"always":true}}
---

# 通达信测试版截图自动化 (TDX Test Screenshot)

使用Python GUI自动化操作通达信测试版股票软件，输入股票代码后按Ctrl+X打开输入框，然后截图保存。

## 功能特性

- 🚀 自动启动或激活通达信测试版软件
- ⌨️ 自动输入股票代码
- ⌨️ 按回车确认
- ⌨️ 按 **Ctrl+X** 切换
- 📸 自动截图保存
- 📝 输出JSON格式结果供工作流解析

## 安装依赖

```bash
pip install pyautogui Pillow pygetwindow
```

## 使用方法

### 基础使用（软件已启动）

```bash
python scripts/tdx_test_screenshot.py --code 000001 --no-launch
```

### 完整流程（自动启动软件）

```bash
python scripts/tdx_test_screenshot.py --code 000001
```

### 指定输出目录

```bash
python scripts/tdx_test_screenshot.py --code 000001 --output-dir ./stock_screenshots
```

## 命令行参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--code` | 股票代码（必填） | - |
| `--output-dir` | 输出目录 | `./output` |
| `--no-launch` | 跳过启动软件（软件已在运行） | `False` |
| `--wait-time` | 等待数据加载时间（秒） | `3` |
| `--app-path` | 通达信测试版程序路径 | `C:\new_tdx_test\tdxw.exe` |

## 操作流程

```
1. 启动/激活通达信测试版 (tdxw.exe)
2. 输入股票代码
3. 按回车确认
4. 按 Ctrl+X 切换
5. 等待股票数据加载
6. 截取当前屏幕
7. 保存截图到指定目录
```

## 输出文件

运行后会生成以下文件：

- `tdx_{股票代码}_{时间戳}.png` - 截图文件

**示例**: `tdx_000001_20260313_123045.png`

## 输出结果

脚本执行完成后会输出JSON格式的结果：

```json
{
  "success": true,
  "screenshot_image": "./output/tdx_000001_20260313_123045.png",
  "stock_code": "000001",
  "timestamp": "20260313_123045"
}
```

结果包裹在特殊标记中，方便工作流执行器解析：
```
###NANOBOT_OUTPUT_START###{json}###NANOBOT_OUTPUT_END###
```

## 注意事项

1. **权限要求**: 需要管理员权限运行，以便控制其他应用程序
2. **分辨率**: 建议在1920x1080或更高分辨率下使用
3. **软件状态**: 确保通达信测试版可以正常启动
4. **窗口位置**: 确保通达信窗口没有被其他窗口遮挡
5. **快捷键**: Ctrl+X 是通达信测试版的股票代码输入快捷键

## 故障排除

### 无法找到窗口

- 确保通达信测试版已完全加载
- 尝试增加等待时间
- 检查窗口是否被最小化

### 截图失败

- 检查输出目录是否有写入权限
- 确保磁盘空间充足

### 股票代码输入失败

- 确保通达信窗口处于激活状态
- 检查 Ctrl+X 是否能正常打开输入框
- 尝试增加 `--wait-time` 参数

## 示例工作流

```bash
# 1. 查询平安银行(000001)
python scripts/tdx_test_screenshot.py --code 000001 --no-launch

# 2. 查看生成的截图
# 截图保存在 ./output/tdx_000001_*.png
```

## 技术实现

- 使用 `pyautogui` 进行GUI自动化
- 使用 `pygetwindow` 激活窗口
- 使用 `PIL` 进行截图
- 通达信测试版路径: `C:\new_tdx_test\tdxw.exe`

## 与天龙博弈自动化的区别

| 特性 | 天龙博弈自动化 | 通达信测试版截图 |
|------|----------------|------------------|
| 程序路径 | `C:\Program Files (x86)\天龙博弈\bin\tlby.exe` | `C:\new_tdx_test\tdxw.exe` |
| 输入方式 | 点击输入框直接输入 | **输入代码 → 回车 → Ctrl+X** |
| 截图次数 | 2次（分时图+日K线） | 1次（当前视图） |
| 窗口标题 | "天龙博弈", "TLBY" | "通达信", "tdx", "TDX" |
