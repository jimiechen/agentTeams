import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  console.log('=== Test Task Switch Input Behavior ===');

  // 1. 点击 PMCLI
  console.log('1. Clicking PMCLI...');
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1000));

  // 清空并填入 PMCLI prompt
  await cdp.evaluate(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      if (input) {
        input.focus();
        input.innerHTML = '<p class="chat-input-v2__paragraph"><br></p>';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  await cdp.Input.insertText({ text: 'PMCLI_PROMPT' });
  await new Promise(r => setTimeout(r, 1000));

  const pmcliInput = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? input.textContent : 'NO_INPUT';
    })()
  `);
  console.log('PMCLI input after insert:', pmcliInput);

  // 2. 点击 DEVCLI
  console.log('2. Clicking DEVCLI...');
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[1].click()");
  await new Promise(r => setTimeout(r, 1000));

  // 检查输入框内容
  const devcliInputAfterSwitch = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? input.textContent : 'NO_INPUT';
    })()
  `);
  console.log('DEVCLI input after switch (before clear):', devcliInputAfterSwitch);

  // 清空并填入 DEVCLI prompt
  await cdp.evaluate(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      if (input) {
        input.focus();
        input.innerHTML = '<p class="chat-input-v2__paragraph"><br></p>';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  const devcliInputAfterClear = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? input.textContent : 'NO_INPUT';
    })()
  `);
  console.log('DEVCLI input after clear:', devcliInputAfterClear);

  await cdp.Input.insertText({ text: 'DEVCLI_PROMPT' });
  await new Promise(r => setTimeout(r, 1000));

  const devcliInputAfterInsert = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? input.textContent : 'NO_INPUT';
    })()
  `);
  console.log('DEVCLI input after insert:', devcliInputAfterInsert);

  // 3. 切回 PMCLI
  console.log('3. Clicking back to PMCLI...');
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1000));

  const pmcliInputAfterSwitchBack = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? input.textContent : 'NO_INPUT';
    })()
  `);
  console.log('PMCLI input after switch back:', pmcliInputAfterSwitchBack);

  await cdp.disconnect();
}

main();
