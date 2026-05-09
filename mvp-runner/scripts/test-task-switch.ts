import { CDPClient } from '../src/cdp/client.js';

async function main() {
  const cdp = new CDPClient({ host: 'localhost', port: 9222 });
  await cdp.connect();

  // 1. 点击 PMCLI
  console.log('1. Clicking PMCLI...');
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1000));

  // 填入 prompt
  await cdp.evaluate(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      if (input) {
        input.focus();
        input.innerHTML = 'PMCLI_TEST_PROMPT';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  const pmcliInput = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? (input.textContent || input.innerText || 'empty') : 'NO_INPUT';
    })()
  `);
  console.log('PMCLI input after fill:', pmcliInput);

  // 2. 点击 DEVCLI
  console.log('2. Clicking DEVCLI...');
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[1].click()");
  await new Promise(r => setTimeout(r, 1000));

  const devcliInput = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? (input.textContent || input.innerText || 'empty') : 'NO_INPUT';
    })()
  `);
  console.log('DEVCLI input after switch:', devcliInput);

  // 3. 填 DEVCLI prompt
  await cdp.evaluate(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      if (input) {
        input.focus();
        input.innerHTML = 'DEVCLI_TEST_PROMPT';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 500));

  const devcliInputAfterFill = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? (input.textContent || input.innerText || 'empty') : 'NO_INPUT';
    })()
  `);
  console.log('DEVCLI input after fill:', devcliInputAfterFill);

  // 4. 切回 PMCLI
  console.log('4. Clicking back to PMCLI...');
  await cdp.evaluate("document.querySelectorAll('.index-module__task-item___zOpfg')[0].click()");
  await new Promise(r => setTimeout(r, 1000));

  const pmcliInputAfterSwitch = await cdp.evaluate<string>(`
    (function() {
      const input = document.querySelector('.chat-input-v2-input-box-editable');
      return input ? (input.textContent || input.innerText || 'empty') : 'NO_INPUT';
    })()
  `);
  console.log('PMCLI input after switch back:', pmcliInputAfterSwitch);

  await cdp.disconnect();
}

main();
