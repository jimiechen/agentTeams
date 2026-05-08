# Skill 安装包: tdx-test-screenshot (通达信测试版截图)

> **Skill名称:** tdx-test-screenshot
> **版本:** 1.0.0
> **分类:** 截图自动化
> **状态:** 待签约

---

## 一、Skill 概述

使用 Python GUI 自动化操作通达信测试版股票软件，输入股票代码后按回车确认，再按 Ctrl+X 切换，最后截图保存。适用于需要批量获取股票截图的场景。

---

## 二、安装信息

### 2.1 代码位置

| 项目 | 路径 |
|------|------|
| **Skill根目录** | `d:\agentsTeam\skills\nanobot\tdx-test-screenshot\` |
| **SKILL.md** | `d:\agentsTeam\skills\nanobot\tdx-test-screenshot\SKILL.md` |
| **核心脚本** | `d:\agentsTeam\skills\nanobot\tdx-test-screenshot\scripts\tdx_test_screenshot.py` |

### 2.2 环境依赖

| 依赖项 | 版本要求 | 安装方式 |
|--------|----------|----------|
| Python | 3.7+ | 系统自带 |
| pyautogui | 最新版 | `pip install pyautogui` |
| Pillow | 最新版 | `pip install Pillow` |
| pygetwindow | 最新版 | `pip install pygetwindow` |

### 2.3 通达信配置

| 配置项 | 值 |
|--------|-----|
| **通达信测试版路径** | `C:\new_tdx_test` |
| **可执行文件** | `C:\new_tdx_test\tdxw.exe` |
| **快捷键** | Ctrl+X（股票代码输入） |

---

## 三、核心功能

### 3.1 功能列表

| # | 功能 | 说明 |
|---|------|------|
| 1 | **自动启动软件** | 自动启动通达信测试版（可选） |
| 2 | **窗口激活** | 自动激活通达信窗口并最大化 |
| 3 | **输入股票代码** | 模拟键盘输入股票代码 |
| 4 | **回车确认** | 模拟回车键确认输入 |
| 5 | **Ctrl+X切换** | 按 Ctrl+X 执行切换操作 |
| 6 | **自动截图** | 截取当前屏幕并保存 |
| 7 | **JSON输出** | 输出JSON格式结果供工作流解析 |

### 3.2 操作流程

```
1. 启动/激活通达信测试版 (tdxw.exe)
2. 输入股票代码（如: 000001）
3. 按回车确认
4. 按 Ctrl+X 切换
5. 等待数据加载（默认3秒）
6. 截取当前屏幕
7. 保存截图到指定目录
8. 输出JSON结果
```

---

## 四、使用方法

### 4.1 命令行参数

```bash
python tdx_test_screenshot.py [选项]
```

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--code` | 股票代码（必填） | - |
| `--output-dir` | 输出目录 | `./output` |
| `--no-launch` | 跳过启动软件（软件已在运行） | False |
| `--wait-time` | 等待数据加载时间（秒） | 3 |
| `--app-path` | 通达信测试版程序路径 | `C:
ew_tdx_test	dxw.exe` |

### 4.2 使用示例

```bash
# 基础使用（软件已启动）
cd d:\agentsTeam\skills\nanobot\tdx-test-screenshot
python scripts\tdx_test_screenshot.py --code 000001 --no-launch

# 完整流程（自动启动软件）
python scripts\tdx_test_screenshot.py --code 000001

# 指定输出目录
python scripts\tdx_test_screenshot.py --code 000001 --output-dir ./stock_screenshots

# 增加等待时间
python scripts\tdx_test_screenshot.py --code 000001 --wait-time 5
```

### 4.3 输出文件

| 文件 | 格式 | 示例 |
|------|------|------|
| 截图文件 | PNG | `tdx_000001_20260313_123045.png` |

### 4.4 JSON输出

```json
{
  "success": true,
  "screenshot_image": "./output/tdx_000001_20260313_123045.png",
  "stock_code": "000001",
  "timestamp": "20260313_123045"
}
```

输出包裹在特殊标记中：
```
###NANOBOT_OUTPUT_START###{json}###NANOBOT_OUTPUT_END###
```

---

## 五、接口说明

### 5.1 主要函数

| 函数 | 说明 |
|------|------|
| `launch_application(app_path)` | 启动通达信测试版 |
| `activate_tdx_window()` | 激活通达信窗口 |
| `input_stock_code(code)` | 输入股票代码 |
| `press_ctrl_x()` | 按 Ctrl+X |
| `take_screenshot(output_dir, code)` | 截图并保存 |

---

## 六、集成关系

### 6.1 上游依赖

| Skill/服务 | 关系 | 说明 |
|------------|------|------|
| 通达信测试版 | **强依赖** | 必须安装并可启动 |
| Windows GUI | **强依赖** | 需要图形界面环境 |

### 6.2 下游消费

| Skill/服务 | 关系 | 说明 |
|------------|------|------|
| 股票监控系统 | 调用截图 | 地量条件触发时截图 |
| tlby-automation | 同类功能 | 天龙博弈版本截图 |

---

## 七、注意事项

### 7.1 运行要求

| 项目 | 要求 |
|------|------|
| **权限** | 需要管理员权限运行，以便控制其他应用程序 |
| **分辨率** | 建议在1920x1080或更高分辨率下使用 |
| **软件状态** | 确保通达信测试版可以正常启动 |
| **窗口位置** | 确保通达信窗口没有被其他窗口遮挡 |

### 7.2 故障排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 无法找到窗口 | 软件未完全加载 | 增加等待时间 |
| 截图失败 | 输出目录无权限 | 检查目录权限或更换输出路径 |
| 股票代码输入失败 | 窗口未激活 | 确保通达信窗口处于激活状态 |
| Ctrl+X 无效 | 快捷键冲突 | 检查通达信快捷键设置 |

---

## 八、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-03-13 | 初始版本 |

---

## 九、关联文档

| 文档 | 路径 |
|------|------|
| 原始开发文档 | [通达信截图保存Skill.md](file:///d:/agentsTeam/.trae/documents/skills+doc/通达信截图保存Skill.md) |
| Skill目录大纲 | [Skill签约目录大纲.md](file:///d:/agentsTeam/.trae/documents/skills+doc/Skill签约目录大纲.md) |
