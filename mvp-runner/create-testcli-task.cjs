const CDP = require('chrome-remote-interface');

async function main() {
  try {
    const targets = await CDP.List({ host: 'localhost', port: 9222 });
    const mainTarget = targets.find(t => t.type === 'page' && (t.title?.includes('Trae') || t.title?.includes('SOLO')));
    if (!mainTarget) {
      console.log('No Trae target found');
      process.exit(1);
    }
    
    const client = await CDP({ target: mainTarget.id });
    const { Runtime, Input } = client;
    
    // 查找并点击新建任务按钮
    console.log('Looking for new task button...');
    const result = await Runtime.evaluate({
      expression: `(function() {
        // 查找任务列表旁边的添加按钮
        const addBtn = Array.from(document.querySelectorAll('div, button, span')).find(el => {
          const text = el.textContent?.trim() || '';
          const className = el.className || '';
          return text === '+' || className.includes('add') || className.includes('new') || text.includes('新建');
        });
        
        if (addBtn) {
          addBtn.click();
          return { found: true, text: addBtn.textContent?.trim(), className: addBtn.className };
        }
        
        // 如果没找到，尝试查找任务列表标题栏
        const headers = Array.from(document.querySelectorAll('div')).filter(el => {
          const text = el.textContent?.trim() || '';
          return text.includes('任务') || text.includes('Task');
        });
        
        return { found: false, headers: headers.map(h => h.textContent?.trim()).slice(0, 5) };
      })()`,
      returnByValue: true
    });
    
    console.log('Result:', JSON.stringify(result.result.value, null, 2));
    
    await client.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
