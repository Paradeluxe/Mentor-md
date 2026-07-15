const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  let pass=0, fail=0;
  const t=async(n,fn)=>{ try{await fn();console.log('  ✓',n);pass++;}catch(e){console.log('  ✗',n+':',e.message);fail++;} };
  console.log('=== file list ===');
  await page.goto('http://127.0.0.1:8787/index.html?v=139&cb='+Date.now());
  await page.waitForFunction(()=>window.__mdAnnotator?.State?.editor,{timeout:10000});
  await t('has trigger + no empty-recent', async()=>{
    const r=await page.evaluate(()=>({
      trigger:!!document.querySelector('#file-list-trigger'),
      name:!!document.querySelector('#current-file-name'),
      emptyRecent:!!document.querySelector('#empty-recent'),
      foot:(document.querySelector('.empty-hint-foot')||{}).textContent||'',
    }));
    if(!r.trigger||!r.name) throw new Error(JSON.stringify(r));
    if(r.emptyRecent) throw new Error('empty-recent still in DOM');
    if(!r.foot.includes('顶栏')) throw new Error('foot '+r.foot);
  });
  await t('open dropdown', async()=>{
    await page.click('#file-list-trigger');
    await page.waitForTimeout(200);
    const open=await page.evaluate(()=>{
      const dd=document.querySelector('#file-list-dropdown');
      return dd && !dd.classList.contains('hidden');
    });
    if(!open) throw new Error('dropdown not open');
  });
  await t('open more exists', async()=>{
    const ok=await page.evaluate(()=>!!document.querySelector('#file-list-open-more'));
    if(!ok) throw new Error('no open more');
  });
  console.log('\n===',pass,'pass /',fail,'fail ===');
  console.log('errs',errs.length?errs.join('|'):'none');
  await browser.close();
  process.exit(fail?1:0);
})();
