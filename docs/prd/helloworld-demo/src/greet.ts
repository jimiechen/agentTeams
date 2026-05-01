/**
 * 向指定用户打招呼
 * @param name 用户名称
 * @returns 问候语字符串
 */
export function greet(name: string): string {
  if (!name) {
    return "Hello, World!";
  }
  // ⚠️ 故意缺陷：模板字符串多了一个感叹号
  return `Hello, ${name}!!`;  // 正确应为 `Hello, ${name}!`
}
