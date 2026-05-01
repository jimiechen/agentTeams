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
    const { Runtime } = client;
    
    // 检查是否有新建任务按钮
    const result = await Runtime.evaluate({
      expression: `(function() {
        // 查找可能的"新建"或"+"按钮
        const newTaskBtn = Array.from(document.querySelectorAll('button, div, span')).find(el => {
          const text = el.textContent?.trim() || '';
          return text.includes('新建') || text.includes('新任务') || text === '+' || el.className.includes('add');
        });
        
        // 查找任务列表容器
        const taskList = document.querySelector('.index-module__task-list___');
        
        // 查找所有按钮
        const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
          text: b.textContent?.trim() || '',
          className: b.className,
          id: b.id
        }));
        
        return {
          newTaskBtn: newTaskBtn ? { text: newTaskBtn.textContent?.trim(), className: newTaskBtn.className } : null,
          taskListFound: !!taskList,
          allButtons: allButtons.slice(0, 20)
        };
      })()`,
      returnByValue: true
    });
    
    console.log(JSON.stringify(result.result.value, null, 2));
    
    await client.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
