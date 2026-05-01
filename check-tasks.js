const CDP = require('chrome-remote-interface');

async function main() {
  try {
    const targets = await CDP.List({ host: 'localhost', port: 9222 });
    console.log('Available targets:');
    targets.forEach(t => console.log(`  - ${t.type}: ${t.title}`));
    
    const mainTarget = targets.find(t => t.type === 'page' && (t.title?.includes('Trae') || t.title?.includes('SOLO')));
    if (!mainTarget) {
      console.log('No Trae target found');
      process.exit(1);
    }
    
    const client = await CDP({ target: mainTarget.id });
    const { Runtime } = client;
    
    const result = await Runtime.evaluate({
      expression: `(function() {
        const items = document.querySelectorAll('.index-module__task-item___zOpfg');
        return Array.from(items).map((el, index) => ({
          index,
          text: el.textContent?.trim() || '',
          isSelected: el.className.includes('selected')
        }));
      })()`,
      returnByValue: true
    });
    
    console.log('\nTasks found:');
    console.log(JSON.stringify(result.result.value, null, 2));
    
    await client.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
