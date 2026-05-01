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
    
    // 检查是否有对话框出现
    const result = await Runtime.evaluate({
      expression: `(function() {
        // 查找输入框
        const inputs = Array.from(document.querySelectorAll('input, textarea')).map(el => ({
          placeholder: el.placeholder,
          className: el.className,
          type: el.type
        }));
        
        // 查找对话框
        const dialogs = Array.from(document.querySelectorAll('div')).filter(el => {
          const className = el.className || '';
          return className.includes('modal') || className.includes('dialog') || className.includes('popup');
        }).map(el => ({
          className: el.className,
          text: el.textContent?.trim().slice(0, 100)
        }));
        
        // 查找所有可见的输入元素
        const visibleInputs = Array.from(document.querySelectorAll('input, textarea')).filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        }).map(el => ({
          placeholder: el.placeholder,
          className: el.className
        }));
        
        return {
          inputs: inputs.slice(0, 10),
          dialogs: dialogs.slice(0, 5),
          visibleInputs: visibleInputs.slice(0, 10)
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
