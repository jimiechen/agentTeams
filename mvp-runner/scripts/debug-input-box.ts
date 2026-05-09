import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 检查输入框结构
  const result = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      if (!input) return 'NO_INPUT';
      
      let output = 'Tag: ' + input.tagName + '\\n';
      output += 'Class: ' + input.className + '\\n';
      output += 'Children: ' + input.children.length + '\\n';
      output += 'innerHTML: ' + input.innerHTML + '\\n';
      output += 'textContent: ' + input.textContent + '\\n';
      output += 'innerText: ' + input.innerText + '\\n';
      
      return output;
    })()
  `);

  console.log(result);

  await cdp.disconnect();
}

main();
