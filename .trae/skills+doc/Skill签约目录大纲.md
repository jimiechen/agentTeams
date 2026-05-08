# AgentTeam Skill 签约目录大纲

> **Workspace:** d:\agentsTeam
> **整理日期:** 2026-05-04
> **来源文档:** 5份历史对话文档梳理

---

## 一、股票数据获取与选股类

### 1. triple-volume-picker (每日三倍量选股)
| 项目 | 内容 |
|------|------|
| **Skill路径** | `d:\agentsTeam\skills\nanobot\triple-volume-picker\` |
| **SKILL.md** | [SKILL.md](file:///d:/agentsTeam/skills/nanobot/triple-volume-picker/SKILL.md) |
| **核心脚本** | `scripts/tdx_triple_volume.py` |
| **功能描述** | 每日自动从通达信量化平台获取全市场数据，筛选当日成交量>=前日3倍的股票，自动创建通达信自定义板块 |
| **关键特性** | 批量数据获取、向量化计算、自动创建板块(3BLMMDD格式)、输出CSV/JSON |
| **依赖** | Python 3.7+, tqcenter, pandas, 通达信金融终端 |
| **来源文档** | [分析文档并输出Skill方案.md](file:///d:/agentsTeam/.trae/documents/skills+doc/分析文档并输出Skill方案.md) |

---

### 2. tdx-3bl-updater (TDX 3BL板块数据更新)
| 项目 | 内容 |
|------|------|
| **Skill路径** | `d:\agentsTeam\skills\tdx-3bl-updater\` |
| **SKILL.md** | [SKILL.md](file:///d:/agentsTeam/skills/tdx-3bl-updater/SKILL.md) |
| **核心脚本** | `update_with_tdx.py`, `tdx_api.py`, `scheduled_batch_insert.py` |
| **功能描述** | 从通达信量化平台获取3BL板块股票实时行情，计算地量指标，更新到飞书多维表格 |
| **关键特性** | 读取板块文件(T0002/blocknew/)、批量获取K线、计算5/10/20/30/60日地量、飞书表格同步 |
| **目标表格** | AppToken: `NjMBbwfgLaBXoSslUD8cDaPQnvf`, TableID: `tblRzH4lnNlvcAlq` |
| **来源文档** | [检查系统定时任务配置.md](file:///d:/agentsTeam/.trae/documents/skills+doc/检查系统定时任务配置.md) |

---

### 3. tdx-realtime-monitor (通达信实时板块监控)
| 项目 | 内容 |
|------|------|
| **Skill路径** | `d:\agentsTeam\skills\nanobot\tdx-realtime-monitor\` |
| **SKILL.md** | [SKILL.md](file:///d:/agentsTeam/skills/nanobot/tdx-realtime-monitor/SKILL.md) |
| **核心脚本** | `scripts/tdx_sector_monitor.py`, `scripts/test_tdx_monitor.py` |
| **功能描述** | 盘中交易时间监控通达信自定义板块(如"3倍量YYYYMMDD")的实时价格和成交量，涨幅超阈值时预警 |
| **关键特性** | 板块监控、多板块支持、批量行情获取、涨幅预警(默认5%)、防抖机制(10秒)、交易时间检查、飞书webhook通知 |
| **使用方式** | `python tdx_sector_monitor.py --sector "3倍量20260226" --threshold 5.0` |
| **来源文档** | [分析文档并输出Skill方案.md](file:///d:/agentsTeam/.trae/documents/skills+doc/分析文档并输出Skill方案.md) |

---

## 二、截图与自动化类

### 4. tdx-test-screenshot (通达信测试版截图)
| 项目 | 内容 |
|------|------|
| **Skill路径** | `d:\agentsTeam\skills\nanobot\tdx-test-screenshot\` |
| **SKILL.md** | [SKILL.md](file:///d:/agentsTeam/skills/nanobot/tdx-test-screenshot/SKILL.md) |
| **核心脚本** | `scripts/tdx_test_screenshot.py` |
| **功能描述** | Python GUI自动化操作通达信测试版，输入股票代码→回车→Ctrl+X切换→截图保存 |
| **关键特性** | 自动启动/激活tdxw.exe、模拟键盘输入、自动截图、JSON格式输出 |
| **程序路径** | `C:\new_tdx_test\tdxw.exe` |
| **依赖** | pyautogui, Pillow, pygetwindow |
| **来源文档** | [通达信截图保存Skill.md](file:///d:/agentsTeam/.trae/documents/skills+doc/通达信截图保存Skill.md) |

---

### 5. tlby-automation (天龙博弈自动化)
| 项目 | 内容 |
|------|------|
| **Skill路径** | `d:\agentsTeam\skills\nanobot\tlby-automation\` |
| **SKILL.md** | [SKILL.md](file:///d:/agentsTeam/skills/nanobot/tlby-automation/SKILL.md) |
| **核心脚本** | `scripts/tlby_auto.py`, `scripts/analyze_stock.py`, `scripts/batch_screenshot_from_csv.py` |
| **功能描述** | 自动化操作天龙博弈软件进行股票截图和形态分析 |
| **关键特性** | 点击输入框输入代码、2次截图(分时图+日K线)、批量处理CSV股票列表 |
| **程序路径** | `C:\Program Files (x86)\天龙博弈\bin\tlby.exe` |
| **来源文档** | [通达信截图保存Skill.md](file:///d:/agentsTeam/.trae/documents/skills+doc/通达信截图保存Skill.md) (作为参考模板) |

---

## 三、飞书集成与通知类

### 6. feishu-bitable-manager (飞书多维表格管理器)
| 项目 | 内容 |
|------|------|
| **Skill路径** | `d:\agentsTeam\skills\nanobot\feishu-bitable-manager\` |
| **SKILL.md** | [SKILL.md](file:///d:/agentsTeam/skills/nanobot/feishu-bitable-manager/SKILL.md) |
| **核心脚本** | `scripts/create_bitable.py`, `scripts/daily_review.py`, `scripts/send_postmarket_reminder.py`, `scripts/scheduler.py`, `scripts/tdx_to_bitable.py`, `scripts/run_triple_volume_task.ps1` |
| **功能描述** | 创建和管理通达信3倍量选股追踪系统，包含盘后提醒、每日复盘、突破告警 |
| **关键特性** | 创建多维表格、盘后维护提醒(15:00)、每日复盘告警(15:30)、突破检测(最高价/收盘价)、形态分析(底分型/阳包阴/地量) |
| **定时任务** | Windows任务计划程序: `Nanobot_TripleVolume_Daily`(15:30), `TripleVolume_PostmarketReminder`(15:00), `TripleVolume_DailyReview`(15:30) |
| **来源文档** | [检查系统定时任务配置.md](file:///d:/agentsTeam/.trae/documents/skills+doc/检查系统定时任务配置.md) |

---

### 7. tdx-batch-insert (通达信3BL板块批量插入飞书)
| 项目 | 内容 |
|------|------|
| **Skill路径** | `d:\agentsTeam\skills\nanobot\tdx-batch-insert` (推断，由 tdx-batch-insert skill 调用) |
| **功能描述** | 批量插入通达信3BL板块股票数据到飞书多维表格 |
| **调用方式** | 通过 `skill` 命令调用 |
| **来源文档** | [检查系统定时任务配置.md](file:///d:/agentsTeam/.trae/documents/skills+doc/检查系统定时任务配置.md) |

---

## 四、系统服务与监控类

### 8. 盘后数据同步检查服务
| 项目 | 内容 |
|------|------|
| **脚本位置** | `d:\agentsTeam\skills\nanobot\feishu-bitable-manager\scripts\check_tdx_data_sync.py` |
| **调用入口** | `run_triple_volume_task.ps1` 步骤1/2 |
| **功能描述** | 随机选择大盘股检查通达信当日数据是否已同步，未同步则中止选股任务 |
| **检查股票池** | 000001.SZ, 000002.SZ, 600000.SH, 600519.SH, 000858.SZ |
| **来源文档** | [检查系统定时任务配置.md](file:///d:/agentsTeam/.trae/documents/skills+doc/检查系统定时任务配置.md) |

---

### 9. 股票监控系统 (8000端口API服务)
| 项目 | 内容 |
|------|------|
| **服务路径** | 主项目服务层 (`app/services/`) |
| **核心模块** | `TdxSelectionWorkflow`, `DailyReviewService`, `VolumeAnalysisService`, `ScreenshotService`, `FeishuNotificationService` |
| **API端点** | `GET /api/v1/tdx/selection`, `GET /api/v1/tdx/daily/sync`, `GET /api/v1/volume-analysis/{code}`, `GET /api/v1/stock-daily/{code}` |
| **功能描述** | 每日复盘流程：选股→同步250天日线→计算量价得分→地量筛选截图→飞书通知 |
| **数据库表** | `wencai_crawl_batch`, `wencai_stock`, `stock_daily`, `stock_tag_info`, `stock_tag_relation`, `stock_score_result` |
| **来源文档** | [改造股票监控系统，整合通达信数据.md](file:///d:/agentsTeam/.trae/documents/skills+doc/改造股票监控系统，整合通达信数据.md) |

---

## 五、通达信公式与指标类

### 10. 地量监控公式体系
| 项目 | 内容 |
|------|------|
| **类型** | 通达信公式代码 (非Skill，但配合Skill使用) |
| **公式文件** | 需手动在通达信公式管理器中创建 |
| **包含公式** | 基础地量公式(5/10/20/30日)、综合地量选股公式、地量+价格异动公式、地量突破预警公式、多周期地量对比指标 |
| **预警公式** | 基础地量实时预警、地量异动预警、多周期共振地量预警、地量底部预警、地量变盘预警、综合预警系统 |
| **核心逻辑** | `V < MA(V,N) * 0.8` (成交量小于N日均量的80%) |
| **来源文档** | [通达信监控地量公式.md](file:///d:/agentsTeam/.trae/documents/skills+doc/通达信监控地量公式.md) |

---

## 六、Skill依赖关系图

```
┌─────────────────────────────────────────────────────────────────┐
│                    每日复盘定时任务 (15:30)                        │
│              Nanobot_TripleVolume_Daily (Windows)                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │  check_tdx_data_sync.py  │  ← 数据同步检查前置
              └────────────┬────────────┘
                           │ 通过
              ┌────────────▼────────────┐
              │  tdx_to_bitable.py       │  ← 3倍量选股核心
              │  (triple-volume-picker)  │
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
    │ 通达信板块 │      │ 本地文件  │      │ 飞书表格  │
    │ 3BLMMDD  │      │ CSV/JSON │      │ 多维表格  │
    └────┬────┘      └─────────┘      └────┬────┘
         │                                 │
         │    ┌────────────────────────────┘
         │    │
    ┌────▼────▼────────────┐
    │ tdx-realtime-monitor  │  ← 盘中实时监控
    │ (板块涨幅阈值预警)     │
    └───────────────────────┘
                           │
              ┌────────────▼────────────┐
              │  tdx-test-screenshot     │  ← 地量条件触发截图
              │  (GUI自动化截图)          │
              └─────────────────────────┘
```

---

## 七、签约检查清单

| # | Skill名称 | 代码位置 | SKILL.md | 文档 | 状态 |
|---|-----------|----------|----------|------|------|
| 1 | triple-volume-picker | ✅ | ✅ | [分析文档](file:///d:/agentsTeam/.trae/documents/skills+doc/分析文档并输出Skill方案.md) | 待签约 |
| 2 | tdx-3bl-updater | ✅ | ✅ | [定时任务文档](file:///d:/agentsTeam/.trae/documents/skills+doc/检查系统定时任务配置.md) | 待签约 |
| 3 | tdx-realtime-monitor | ✅ | ✅ | [分析文档](file:///d:/agentsTeam/.trae/documents/skills+doc/分析文档并输出Skill方案.md) | 待签约 |
| 4 | tdx-test-screenshot | ✅ | ✅ | [截图文档](file:///d:/agentsTeam/.trae/documents/skills+doc/通达信截图保存Skill.md) | 待签约 |
| 5 | tlby-automation | ✅ | ✅ | [截图文档](file:///d:/agentsTeam/.trae/documents/skills+doc/通达信截图保存Skill.md) | 待签约 |
| 6 | feishu-bitable-manager | ✅ | ✅ | [定时任务文档](file:///d:/agentsTeam/.trae/documents/skills+doc/检查系统定时任务配置.md) | 待签约 |
| 7 | tdx-batch-insert | ✅ | ✅ | [定时任务文档](file:///d:/agentsTeam/.trae/documents/skills+doc/检查系统定时任务配置.md) | 待签约 |
| 8 | 盘后数据同步检查 | ✅ | ❌ (脚本级) | [定时任务文档](file:///d:/agentsTeam/.trae/documents/skills+doc/检查系统定时任务配置.md) | 待签约 |
| 9 | 股票监控系统(8000端口) | ✅ | ❌ (服务级) | [改造监控文档](file:///d:/agentsTeam/.trae/documents/skills+doc/改造股票监控系统，整合通达信数据.md) | 待签约 |
| 10 | 地量监控公式体系 | ❌ (公式代码) | ❌ | [地量公式文档](file:///d:/agentsTeam/.trae/documents/skills+doc/通达信监控地量公式.md) | 待签约 |

---

## 八、相关文档索引

| 文档 | 路径 | 涉及Skill |
|------|------|-----------|
| 分析文档并输出Skill方案 | [`.trae/documents/skills+doc/分析文档并输出Skill方案.md`](file:///d:/agentsTeam/.trae/documents/skills+doc/分析文档并输出Skill方案.md) | triple-volume-picker, tdx-realtime-monitor |
| 改造股票监控系统，整合通达信数据 | [`.trae/documents/skills+doc/改造股票监控系统，整合通达信数据.md`](file:///d:/agentsTeam/.trae/documents/skills+doc/改造股票监控系统，整合通达信数据.md) | 股票监控系统(8000端口), ScreenshotService, VolumeAnalysisService |
| 检查系统定时任务配置 | [`.trae/documents/skills+doc/检查系统定时任务配置.md`](file:///d:/agentsTeam/.trae/documents/skills+doc/检查系统定时任务配置.md) | feishu-bitable-manager, tdx-3bl-updater, 盘后数据同步检查 |
| 通达信截图保存Skill | [`.trae/documents/skills+doc/通达信截图保存Skill.md`](file:///d:/agentsTeam/.trae/documents/skills+doc/通达信截图保存Skill.md) | tdx-test-screenshot, tlby-automation |
| 通达信监控地量公式 | [`.trae/documents/skills+doc/通达信监控地量公式.md`](file:///d:/agentsTeam/.trae/documents/skills+doc/通达信监控地量公式.md) | 地量监控公式体系 |

---

*本大纲由5份历史对话文档梳理而成，涵盖股票选股、实时监控、截图自动化、飞书通知、地量公式等完整链路。*
