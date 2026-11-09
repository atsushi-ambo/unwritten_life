import {test,expect}from'@playwright/test';
async function open(page){await page.goto('/');await page.locator('#guide-open').click();await page.locator('#guide-bulk-open').click();}
async function mock(page,handler){await page.route('**/api/profile',handler);await page.route('**/api/scene',async r=>{const body=r.request().postDataJSON();if(body.mode==='profile')await handler(r);else await r.continue();});}
test('bulk text requires consent and preview, preserves unchecked fields and can undo applied values',async({page})=>{
 let calls=0;await mock(page,r=>{calls++;return r.fulfill({json:{profile:{fields:{municipality:{value:'合成市',evidence:'合成市'},age:{value:32,evidence:'32歳'},company:{value:'合成社',evidence:'合成社'}}}}});});
 await open(page);await page.locator('#guide-bulk-text').fill('32歳、合成市に住み、合成社で働いています。');
 await page.getByRole('button',{name:'内容を整理する',exact:true}).click();expect(calls).toBe(0);
 await page.locator('#guide-extraction-consent').check();await page.getByRole('button',{name:'内容を整理する',exact:true}).click();
 await expect(page.locator('#guide-bulk-preview label')).toHaveCount(3);
 await expect(page.locator('#municipality')).toHaveValue('');
 await page.getByRole('button',{name:'確認した項目を反映する',exact:true}).click();
 await expect(page.locator('#municipality')).toHaveValue('合成市');await expect(page.locator('#company-name')).toHaveValue('合成社');
 await expect(page.locator('#company-confirmed')).not.toBeChecked();
 await page.locator('#guide-bulk-undo').click();await expect(page.locator('#municipality')).toHaveValue('');
});
test('editing a pending transcript or closing discards late extraction and clears private text',async({page})=>{
 let release;const gate=new Promise(r=>release=r);await mock(page,async r=>{await gate;await r.fulfill({json:{profile:{fields:{municipality:{value:'合成市',evidence:'合成市'}}}}}).catch(()=>{});});
 await open(page);await page.locator('#guide-bulk-text').fill('合成市に住んでいます。');await page.locator('#guide-extraction-consent').check();
 await page.getByRole('button',{name:'内容を整理する',exact:true}).click();await page.locator('#guide-bulk-text').fill('別の架空の文章');release();
 await expect(page.locator('#guide-bulk-preview label')).toHaveCount(0);await expect(page.locator('#municipality')).toHaveValue('');
 await page.keyboard.press('Escape');await page.locator('#guide-open').click();await page.locator('#guide-bulk-open').click();await expect(page.locator('#guide-bulk-text')).toHaveValue('');
});

test('bulk speech appends multiple final results without sending them automatically',async({page})=>{
 await page.addInitScript(()=>{window.SpeechRecognition=class{processLocally=false;constructor(){window.bulkRec=this;}start(){}abort(){}};});
 await open(page);await page.locator('#guide-bulk-text').fill('最初の文章。');
 await page.getByRole('button',{name:'音声で入力',exact:true}).click();
 expect(await page.evaluate(()=>window.bulkRec.continuous)).toBe(true);
 await page.evaluate(()=>window.bulkRec.onresult({resultIndex:0,results:[[{transcript:'私は42歳です'}]]}));
 await page.evaluate(()=>window.bulkRec.onresult({resultIndex:1,results:[[{transcript:'私は42歳です'}],[{transcript:'合成市に住んでいます'}]]}));
 await expect(page.locator('#guide-bulk-text')).toHaveValue(/最初の文章。\n私は42歳です。合成市に住んでいます/);
 await expect(page.locator('#guide-bulk-preview label')).toHaveCount(0);
 await page.keyboard.press('Escape');
});
test('blanking a numeric preview never silently sets zero',async({page})=>{
 await mock(page,r=>r.fulfill({json:{profile:{fields:{income:{value:420,evidence:'年収420万円'}}}}}));
 await open(page);await page.locator('#guide-bulk-text').fill('年収420万円です。');await page.locator('#guide-extraction-consent').check();await page.getByRole('button',{name:'内容を整理する',exact:true}).click();
 await expect(page.locator('#guide-bulk-preview label')).toHaveCount(1);
 await page.locator('#guide-bulk-preview input[type="checkbox"]').check();await page.getByRole('textbox',{name:'年収（万円）の抽出結果',exact:true}).fill('');
 await page.getByRole('button',{name:'確認した項目を反映する',exact:true}).click();await expect(page.locator('#guide-status')).toContainText('数字で入力');await expect(page.locator('[name="income"]')).toHaveValue('');
});
