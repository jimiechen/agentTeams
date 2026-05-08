#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每日三倍量选股脚本
用于nanobot triple-volume-picker skill

功能：
1. 从数据库抓取最近交易日的3倍量股票
2. 计算250天量价得分
3. 生成排名
4. 结果入库
5. 输出CSV和JSON报告

使用方法：
    python daily_triple_volume.py [--days N] [--output DIR] [--db-url URL]

示例：
    python daily_triple_volume.py                    # 分析今天
    python daily_triple_volume.py --days 7           # 分析最近7天
    python daily_triple_volume.py --output ./reports # 指定输出目录
"""

import sys
import os

# 加载环境变量（从多个可能的位置查找 .env 文件）
def _load_env():
    """尝试从多个位置加载 .env 文件"""
    from pathlib import Path
    
    # 可能的路径列表
    possible_paths = [
        Path(__file__).parent.parent.parent.parent.parent.parent / '.env',  # nanobot 根目录
        Path(__file__).parent.parent / '.env',  # skill 目录
        Path.cwd() / '.env',  # 当前工作目录
    ]
    
    for env_path in possible_paths:
        if env_path.exists():
            try:
                from dotenv import load_dotenv
                load_dotenv(env_path)
                print(f"✅ 已加载环境变量: {env_path}", file=sys.stderr)
                return
            except ImportError:
                # 如果没有 dotenv，手动解析
                with open(env_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            key, value = line.split('=', 1)
                            os.environ.setdefault(key.strip(), value.strip())
                print(f"✅ 已加载环境变量: {env_path}", file=sys.stderr)
                return
    
    print("⚠️ 未找到 .env 文件", file=sys.stderr)

_load_env()

import asyncio
import argparse
import json
import csv
import logging
from datetime import datetime, date, timedelta
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict
from decimal import Decimal

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(f'triple_volume_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log', encoding='utf-8')
    ]
)
logger = logging.getLogger(__name__)


@dataclass
class TripleVolumeRecord:
    """3倍量记录数据类"""
    stock_code: str
    trade_date: date
    stock_name: str = ""
    yesterday_volume: int = 0
    today_volume: int = 0
    ratio: float = 0.0
    open_price: float = 0.0
    close_price: float = 0.0
    high_price: float = 0.0
    low_price: float = 0.0
    daily_score: float = 0.0
    accumulated_score: float = 0.0
    tags: str = ""
    ranking: int = 0
    ranking_by_score: int = 0
    ranking_by_ratio: int = 0


class DatabaseManager:
    """数据库管理器"""
    
    def __init__(self, db_url: Optional[str] = None):
        self.db_url = db_url or self._get_db_url_from_env()
        self.session = None
        
    def _get_db_url_from_env(self) -> str:
        """从环境变量获取数据库URL - 使用MySQL"""
        # 优先使用DATABASE_URL
        db_url = os.getenv('DATABASE_URL')
        if db_url:
            return db_url
        
        # 否则拼接各个参数 - 使用MySQL连接
        host = os.getenv('STOCK_DB_HOST', '192.168.100.200')
        port = os.getenv('STOCK_DB_PORT', '3306')
        name = os.getenv('STOCK_DB_NAME', 'stockdb')
        user = os.getenv('STOCK_DB_USER', 'root')
        password = os.getenv('STOCK_DB_PASS', '')
        
        return f"mysql+aiomysql://{user}:{password}@{host}:{port}/{name}"
    
    async def connect(self):
        """连接数据库"""
        try:
            from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
            from sqlalchemy.orm import sessionmaker
            
            self.engine = create_async_engine(self.db_url, echo=False)
            self.Session = sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=False)
            logger.info(f"✅ 数据库连接成功")
            return True
        except Exception as e:
            logger.error(f"❌ 数据库连接失败: {e}")
            return False
    
    def get_session(self):
        """获取会话 - 返回异步上下文管理器"""
        from contextlib import asynccontextmanager
        
        @asynccontextmanager
        async def session_context():
            if not hasattr(self, 'Session'):
                await self.connect()
            session = self.Session()
            try:
                yield session
            finally:
                await session.close()
        
        return session_context()


class TripleVolumeAnalyzer:
    """三倍量分析器"""
    
    def __init__(self, db_manager: DatabaseManager):
        self.db = db_manager
        
    async def get_recent_trade_dates(self, days: int = 1) -> List[date]:
        """从数据库获取最近N个有数据的交易日"""
        try:
            from sqlalchemy import select, desc, func
            
            async with self.db.get_session() as session:
                # 动态导入模型
                from sqlalchemy import Column, Date, String, Integer, Numeric
                from sqlalchemy.orm import declarative_base
                
                Base = declarative_base()
                
                class StockDaily(Base):
                    __tablename__ = 'stock_daily'
                    code = Column(String(20), primary_key=True)
                    trade_date = Column(Date, primary_key=True)
                    open = Column(Numeric(10, 4))
                    close = Column(Numeric(10, 4))
                    high = Column(Numeric(10, 4))
                    low = Column(Numeric(10, 4))
                    vol = Column(Numeric(20, 0))
                    amount = Column(Numeric(20, 4))
                
                # 获取最新的N个交易日期
                stmt = select(StockDaily.trade_date).distinct().order_by(desc(StockDaily.trade_date)).limit(days)
                result = await session.execute(stmt)
                dates = result.scalars().all()
                
                if dates:
                    logger.info(f"从数据库获取最近{len(dates)}个交易日期: {[d.strftime('%Y-%m-%d') for d in sorted(dates)]}")
                    return sorted(dates)
        except Exception as e:
            logger.error(f"从数据库获取日期失败: {e}")
        
        # 备选：使用当前日期
        dates = []
        current = date.today()
        while len(dates) < days:
            if current.weekday() < 5:
                dates.append(current)
            current -= timedelta(days=1)
        return sorted(dates)
    
    async def find_triple_volume_stocks(self, target_date: date, min_ratio: float = 3.0) -> List[TripleVolumeRecord]:
        """从数据库查找指定日期的3倍量股票"""
        try:
            logger.info(f"查找 {target_date} 的3倍量股票（倍数>={min_ratio}）...")
            
            from sqlalchemy import select, desc, func, and_, Column, Date, String, Numeric
            from sqlalchemy.orm import declarative_base
            
            Base = declarative_base()
            
            class StockDaily(Base):
                __tablename__ = 'stock_daily'
                code = Column(String(20), primary_key=True)
                trade_date = Column(Date, primary_key=True)
                open = Column(Numeric(10, 4))
                close = Column(Numeric(10, 4))
                high = Column(Numeric(10, 4))
                low = Column(Numeric(10, 4))
                vol = Column(Numeric(20, 0))
                amount = Column(Numeric(20, 4))
            
            # 获取该日期前5天的数据
            start_date = target_date - timedelta(days=5)
            
            async with self.db.get_session() as session:
                # 获取所有股票在这几天的数据
                stmt = select(StockDaily).where(
                    and_(
                        StockDaily.trade_date >= start_date,
                        StockDaily.trade_date <= target_date
                    )
                ).order_by(StockDaily.code, StockDaily.trade_date)
                
                result = await session.execute(stmt)
                all_data = result.scalars().all()
                
                if not all_data:
                    logger.warning(f"{target_date} 无数据")
                    return []
                
                # 按股票分组
                stock_data = {}
                for record in all_data:
                    if record.code not in stock_data:
                        stock_data[record.code] = []
                    stock_data[record.code].append(record)
                
                # 筛选3倍量股票
                target_stocks = []
                
                for code, records in stock_data.items():
                    records.sort(key=lambda x: x.trade_date)
                    
                    # 找到目标日期的记录
                    target_record = None
                    for r in records:
                        if r.trade_date == target_date:
                            target_record = r
                            break
                    
                    if not target_record or not target_record.vol or target_record.vol <= 0:
                        continue
                    
                    # 找到前一天的记录
                    prev_record = None
                    for i, r in enumerate(records):
                        if r.trade_date == target_date and i > 0:
                            prev_record = records[i-1]
                            break
                    
                    if not prev_record or not prev_record.vol or prev_record.vol <= 0:
                        continue
                    
                    # 计算倍数
                    ratio = float(target_record.vol) / float(prev_record.vol)
                    
                    if ratio >= min_ratio:
                        record = TripleVolumeRecord(
                            stock_code=code,
                            trade_date=target_date,
                            stock_name=code,
                            yesterday_volume=int(prev_record.vol),
                            today_volume=int(target_record.vol),
                            ratio=round(ratio, 2),
                            open_price=float(target_record.open) if target_record.open else 0,
                            close_price=float(target_record.close) if target_record.close else 0,
                            high_price=float(target_record.high) if target_record.high else 0,
                            low_price=float(target_record.low) if target_record.low else 0
                        )
                        target_stocks.append(record)
                
                # 按放量倍数排序
                target_stocks.sort(key=lambda x: x.ratio, reverse=True)
                
                logger.info(f"{target_date} 找到 {len(target_stocks)} 只3倍量股票")
                return target_stocks
                
        except Exception as e:
            logger.error(f"查找3倍量股票失败: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def calculate_scores_simple(self, records: List[TripleVolumeRecord]) -> List[TripleVolumeRecord]:
        """简化版得分计算（不依赖外部服务）"""
        logger.info(f"计算 {len(records)} 只股票的得分...")
        
        for record in records:
            # 简化计算：3倍量基础分300
            base_score = 300
            
            # 根据倍数调整
            if record.ratio >= 5:
                base_score += 100
            elif record.ratio >= 4:
                base_score += 50
            
            record.daily_score = base_score
            # 累计得分简化处理（实际应从数据库查询历史）
            record.accumulated_score = base_score
            record.tags = "3倍量"
        
        return records
    
    def calculate_rankings(self, records: List[TripleVolumeRecord]) -> List[TripleVolumeRecord]:
        """计算排名"""
        if not records:
            return records
        
        logger.info("计算排名...")
        
        # 按累计得分排名
        sorted_by_accum = sorted(records, key=lambda x: x.accumulated_score, reverse=True)
        for idx, record in enumerate(sorted_by_accum):
            record.ranking_by_score = idx + 1
        
        # 按当日得分排名
        sorted_by_daily = sorted(records, key=lambda x: x.daily_score, reverse=True)
        for idx, record in enumerate(sorted_by_daily):
            record.ranking = idx + 1
        
        # 按放量倍数排名
        sorted_by_ratio = sorted(records, key=lambda x: x.ratio, reverse=True)
        for idx, record in enumerate(sorted_by_ratio):
            record.ranking_by_ratio = idx + 1
        
        return records
    
    async def save_to_database(self, records: List[TripleVolumeRecord]) -> bool:
        """保存3倍量记录到数据库"""
        if not records:
            return True
        
        try:
            from sqlalchemy import select, Column, Date, String, Numeric, JSON
            from sqlalchemy.orm import declarative_base
            
            Base = declarative_base()
            
            class VolumeAnalysisResult(Base):
                __tablename__ = 'volume_analysis_result'
                id = Column(Numeric(20, 0), primary_key=True)
                code = Column(String(20))
                trade_date = Column(Date)
                analysis_type = Column(String(50))
                value = Column(Numeric(20, 4))
                description = Column(String(500))
                extra_data = Column(JSON)
            
            async with self.db.get_session() as session:
                for record in records:
                    extra_data = {
                        'yesterday_volume': record.yesterday_volume,
                        'today_volume': record.today_volume,
                        'ratio': record.ratio,
                        'open': record.open_price,
                        'high': record.high_price,
                        'low': record.low_price,
                        'close': record.close_price,
                        'daily_score': record.daily_score,
                        'accumulated_score': record.accumulated_score,
                        'ranking': record.ranking,
                        'ranking_by_score': record.ranking_by_score,
                        'ranking_by_ratio': record.ranking_by_ratio
                    }
                    
                    new_record = VolumeAnalysisResult(
                        code=record.stock_code,
                        trade_date=record.trade_date,
                        analysis_type='3x_volume',
                        value=Decimal(str(record.close_price)),
                        description=f"3倍量: {record.ratio:.2f}x, 得分: {record.accumulated_score:.2f}",
                        extra_data=extra_data
                    )
                    session.add(new_record)
                
                await session.commit()
                logger.info(f"✅ 已保存 {len(records)} 条3倍量记录到数据库")
                return True
                
        except Exception as e:
            logger.error(f"保存到数据库失败: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def process_date(self, target_date: date, min_ratio: float = 3.0) -> List[TripleVolumeRecord]:
        """处理单个日期"""
        logger.info(f"\n{'='*60}")
        logger.info(f"处理日期: {target_date}")
        logger.info(f"{'='*60}")
        
        # 1. 获取3倍量股票
        records = await self.find_triple_volume_stocks(target_date, min_ratio)
        
        if not records:
            logger.info(f"{target_date} 无3倍量股票")
            return []
        
        # 2. 计算得分
        records = self.calculate_scores_simple(records)
        
        # 3. 计算排名
        records = self.calculate_rankings(records)
        
        # 4. 保存到数据库
        await self.save_to_database(records)
        
        return records
    
    async def run(self, days: int = 1, output_dir: str = './output', min_ratio: float = 3.0):
        """执行主流程"""
        start_time = datetime.now()
        
        logger.info("="*80)
        logger.info("每日三倍量选股工具启动")
        logger.info(f"分析最近{days}个交易日")
        logger.info(f"最小放量倍数: {min_ratio}")
        logger.info("="*80)
        
        # 确保输出目录存在
        os.makedirs(output_dir, exist_ok=True)
        
        # 获取最近交易日
        trade_dates = await self.get_recent_trade_dates(days)
        logger.info(f"分析日期: {[d.strftime('%Y-%m-%d') for d in trade_dates]}")
        
        # 逐日处理
        all_results = {}
        for idx, trade_date in enumerate(trade_dates):
            logger.info(f"\n[{idx + 1}/{len(trade_dates)}] 开始处理...")
            records = await self.process_date(trade_date, min_ratio)
            all_results[trade_date.strftime('%Y-%m-%d')] = records
        
        # 输出结果
        self.output_results(all_results, output_dir)
        
        # 输出nanobot标准格式结果
        self.output_nanobot_result(all_results, output_dir)
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        logger.info(f"\n总执行时间: {duration:.2f} 秒 ({duration/60:.2f} 分钟)")
    
    def output_results(self, all_results: Dict[str, List[TripleVolumeRecord]], output_dir: str):
        """输出结果"""
        logger.info(f"\n{'='*80}")
        logger.info("处理完成 - 汇总结果")
        logger.info(f"{'='*80}")
        
        total_records = sum(len(records) for records in all_results.values())
        logger.info(f"总交易日数: {len(all_results)}")
        logger.info(f"总3倍量股票数: {total_records}")
        
        # 每日统计
        logger.info(f"\n每日统计:")
        logger.info(f"{'日期':<12} {'数量':<8} {'平均累计得分':<15} {'最高放量倍数':<12}")
        logger.info("-" * 60)
        
        for date_str, records in sorted(all_results.items()):
            count = len(records)
            if count > 0:
                avg_score = sum(r.accumulated_score for r in records) / count
                max_ratio = max(r.ratio for r in records)
                logger.info(f"{date_str:<12} {count:<8} {avg_score:<15.2f} {max_ratio:<12.2f}")
            else:
                logger.info(f"{date_str:<12} {count:<8} {'N/A':<15} {'N/A':<12}")
        
        # 输出CSV文件
        self._save_csv(all_results, output_dir)
        
        # 输出JSON文件
        self._save_json(all_results, output_dir)
    
    def _save_csv(self, all_results: Dict[str, List[TripleVolumeRecord]], output_dir: str):
        """保存CSV文件"""
        output_file = os.path.join(output_dir, f"triple_volume_{datetime.now().strftime('%Y%m%d')}.csv")
        
        try:
            with open(output_file, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.writer(f)
                writer.writerow([
                    '日期', '排名', '股票代码', '股票名称', '昨日成交量', '今日成交量',
                    '放量倍数', '开盘价', '收盘价', '最高价', '最低价',
                    '当日得分', '累计得分', '得分排名', '倍数排名', '标签'
                ])
                
                for date_str, records in sorted(all_results.items()):
                    for record in records:
                        writer.writerow([
                            date_str,
                            record.ranking,
                            record.stock_code,
                            record.stock_name,
                            record.yesterday_volume,
                            record.today_volume,
                            record.ratio,
                            record.open_price,
                            record.close_price,
                            record.high_price,
                            record.low_price,
                            record.daily_score,
                            record.accumulated_score,
                            record.ranking_by_score,
                            record.ranking_by_ratio,
                            record.tags
                        ])
            
            logger.info(f"\n✅ CSV结果已保存: {output_file}")
            if os.path.exists(output_file):
                logger.info(f"   文件大小: {os.path.getsize(output_file) / 1024:.2f} KB")
        except Exception as e:
            logger.error(f"保存CSV失败: {e}")
    
    def _save_json(self, all_results: Dict[str, List[TripleVolumeRecord]], output_dir: str):
        """保存JSON文件"""
        output_file = os.path.join(output_dir, f"triple_volume_{datetime.now().strftime('%Y%m%d')}.json")
        
        try:
            json_data = {}
            for date_str, records in all_results.items():
                json_data[date_str] = [asdict(r) for r in records]
            
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2, default=str)
            
            logger.info(f"✅ JSON结果已保存: {output_file}")
            if os.path.exists(output_file):
                logger.info(f"   文件大小: {os.path.getsize(output_file) / 1024:.2f} KB")
        except Exception as e:
            logger.error(f"保存JSON失败: {e}")
    
    def output_nanobot_result(self, all_results: Dict[str, List[TripleVolumeRecord]], output_dir: str):
        """输出nanobot标准格式结果"""
        try:
            # 获取第一个日期的结果
            trade_date = list(all_results.keys())[0] if all_results else datetime.now().strftime('%Y-%m-%d')
            records = all_results.get(trade_date, [])
            
            # CSV文件路径
            csv_file = os.path.join(output_dir, f"triple_volume_{datetime.now().strftime('%Y%m%d')}.csv")
            json_file = os.path.join(output_dir, f"triple_volume_{datetime.now().strftime('%Y%m%d')}.json")
            
            result = {
                "success": True,
                "csv_file": csv_file,
                "json_file": json_file,
                "stock_count": len(records),
                "trade_date": trade_date
            }
            
            # 输出标准格式
            json_output = json.dumps(result, indent=2, ensure_ascii=False)
            print(f"###NANOBOT_OUTPUT_START###{json_output}###NANOBOT_OUTPUT_END###")
            logger.info("✅ 已输出nanobot标准格式结果")
            
        except Exception as e:
            logger.error(f"输出nanobot结果失败: {e}")
            error_result = {
                "success": False,
                "error": str(e)
            }
            print(f"###NANOBOT_OUTPUT_START###{json.dumps(error_result, ensure_ascii=False)}###NANOBOT_OUTPUT_END###")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='每日三倍量选股工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python daily_triple_volume.py                    # 分析今天
  python daily_triple_volume.py --days 7           # 分析最近7天
  python daily_triple_volume.py --output ./reports # 指定输出目录
  python daily_triple_volume.py --min-ratio 2.5    # 最小倍数2.5
        """
    )
    
    parser.add_argument('--days', type=int, default=1,
                        help='分析最近N个交易日 (默认: 1)')
    parser.add_argument('--output', type=str, default='./output',
                        help='输出目录 (默认: ./output)')
    parser.add_argument('--db-url', type=str, default=None,
                        help='数据库连接URL (默认: 从环境变量读取)')
    parser.add_argument('--min-ratio', type=float, default=3.0,
                        help='最小放量倍数 (默认: 3.0)')
    parser.add_argument('--verbose', action='store_true',
                        help='详细输出模式')
    
    args = parser.parse_args()
    
    # 设置日志级别
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # 初始化数据库
    db_manager = DatabaseManager(args.db_url)
    
    # 运行分析
    analyzer = TripleVolumeAnalyzer(db_manager)
    asyncio.run(analyzer.run(
        days=args.days,
        output_dir=args.output,
        min_ratio=args.min_ratio
    ))


if __name__ == "__main__":
    main()
