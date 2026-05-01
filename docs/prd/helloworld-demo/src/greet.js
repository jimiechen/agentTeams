/**
 * greet 函数 - 返回问候语
 * @param name 用户名
 * @returns 问候语
 */
function greet(name) {
  if (!name) {
    return "Hello, World!";
  }
  // ⚠️ 故意缺陷：多了一个 !
  return "Hello, " + name + "!!";
}

module.exports = { greet };
