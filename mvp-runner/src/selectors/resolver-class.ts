import { CDPClient } from '../cdp/client.js';
import { loadSelectors, getSelectorConfig, resolve as resolveSelector, clearCache } from './resolver.js';
import { SelectorResolutionError } from '../errors.js';

/**
 * 选择器解析器类 - 兼容文档中的类接口
 * 内部调用现有的函数式实现
 */
export class SelectorResolver {
  constructor(private cdp: CDPClient, private configDir = './config') {
    // 使用默认配置目录
  }

  /**
   * 解析选择器路径，返回可用的选择器字符串
   * path 形如 'chat.input' / 'task_list.item'
   */
  async resolve(p: string): Promise<string> {
    return resolveSelector(this.cdp, p);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    clearCache();
  }
}

export { SelectorResolutionError };
