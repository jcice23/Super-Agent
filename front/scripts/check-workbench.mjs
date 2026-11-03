// 浏览器回归使用显式的接口夹具，不连接模型或改动真实知识库。
// 产品运行代码不包含此测试数据；真实服务联调另用 browser-check.mjs。
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const directory=new URL('../artifacts/workbench/',import.meta.url);
await mkdir(directory,{recursive:true});
const base=process.env.FRONT_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const report={source:'浏览器接口夹具（非真实服务联调）',checks:[],page_errors:[]};
let server;
let documents=[
  {document_id:'manual',original_filename:'项目知识手册.md',status:'ready',chunk_count:8,error:null,size_bytes:10424,created_at:1793664000,updated_at:1793664100,embedding_dimension:1024},
  {document_id:'pending',original_filename:'研究资料.pdf',status:'processing',chunk_count:null,error:null,size_bytes:1048576,created_at:1793664200,updated_at:1793664300,embedding_dimension:null},
  {document_id:'failed',original_filename:'一份用于检查超长文件名称和布局表现的资料'.repeat(4)+'.docx',status:'failed',chunk_count:null,error:'无法提取正文，请检查文档后重试。',size_bytes:23456,created_at:1793664400,updated_at:1793664500,embedding_dimension:null},
];
const citation={number:2,chunk_id:'chunk',document_id:'manual',ingestion_id:'v1',chunk_index:0,filename:'项目知识手册.md',text:'这是浏览器测试夹具中的引用原文，仅用于界面回归。',score:.82,metadata:{page_number:7}};
let turns=[];
let chatPayload;
const screenshot=async(page,name)=>page.screenshot({path:fileURLToPath(new URL(name,directory)),fullPage:true,animations:'disabled'});
async function assertSelectedContrast(page){
  const colors=await page.locator('.nav-item.selected').evaluate(node=>{const style=getComputedStyle(node);return [style.color,style.backgroundColor];});
  const luminance=color=>{const channels=color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;});return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];};
  const [a,b]=colors.map(luminance);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,'选中导航文字对比度至少 4.5:1');
}
try {
  // 自行启动本地服务，避免沙箱与普通进程之间的端口隔离。
  if(!process.env.FRONT_URL){server=await createServer({server:{host:'127.0.0.1',port:5173,strictPort:true}});await server.listen();}
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  const page=await context.newPage();
  page.on('pageerror',error=>report.page_errors.push(error.message));
  await page.route('**/api/**',async route=>{
    const req=route.request();const path=new URL(req.url()).pathname.replace('/api','');
    let status=200,body;
    if(path==='/documents'&&req.method()==='GET')body={data:documents,worker_available:true};
    else if(path==='/documents/failed/retry'){
      documents=documents.map(d=>d.document_id==='failed'?{...d,status:'queued',error:null}:d);
      status=202;body={data:documents.find(d=>d.document_id==='failed')};
    } else if(path==='/upload'){
      const uploaded={...documents[0],document_id:'uploaded',original_filename:'新资料.txt',status:'queued',chunk_count:null};documents=[uploaded,...documents];status=201;body={data:uploaded};
    } else if(path==='/conversations'&&req.method()==='GET')body={data:turns.length?[{id:'c',title:'知识库界面验证',updated_at:1793664100}]:[],next_offset:null};
    else if(path==='/conversations'&&req.method()==='POST'){status=201;body={data:{id:'c',title:'知识库界面验证',updated_at:1793664100}};}
    else if(path==='/conversations/c')body={conversation:{id:'c',title:'知识库界面验证',updated_at:1793664100,summary:turns.length?'浏览器夹具摘要：用户正在验证文档检索范围。':''},data:turns,next_before:null,processing_request_id:null};
    else if(path==='/chat'){
      chatPayload=req.postDataJSON();
      const text='这份资料的回答用于验证工作台布局。[2]\n\n```python\n'+`print("${'长代码'.repeat(60)}")`+'\n```\n\n| 类型 | 内容 |\n| --- | --- |\n| 资料 | 已限定检索范围 |\n\n'+Array.from({length:12},(_,i)=>`第 ${i+1} 段：这是用于检查滚动、阅读行宽及返回最新消息按钮的界面测试内容。`).join('\n\n');
      turns=[{request_id:chatPayload.request_id,seq:1,status:'completed',error:null,request:chatPayload,response:null,messages:[{id:'u',role:'user',text:chatPayload.user_input,mode:'rag'},{id:'a',role:'assistant',text,mode:'rag',citations:[citation]}]}];
      body={data:text,citations:[citation]};
    } else if(path.startsWith('/conversations/c/requests/'))body={data:turns[0]};
    else throw Error(`未预期的接口：${req.method()} ${path}`);
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base);
  await page.getByRole('heading',{name:'今天想完成什么？'}).waitFor();
  await screenshot(page,'home-light.png');
  await assertSelectedContrast(page);
  await page.getByRole('button',{name:'文件与作品库',exact:true}).click();
  await page.getByRole('button',{name:'查看文件 项目知识手册.md'}).waitFor();
  await page.getByRole('button',{name:'网格视图'}).click();
  await screenshot(page,'library-grid.png');
  await page.getByRole('button',{name:'任务中心',exact:true}).click();
  await page.getByRole('button',{name:'重试入库',exact:true}).click();
  await page.getByText('已重新加入入库队列。',{exact:true}).waitFor();
  assert.equal(await page.locator('.status-badge.queued').count(),1);
  report.checks.push('真实状态转换与跨页面共享');
  await page.getByRole('button',{name:'查看任务 项目知识手册.md'}).click();
  await page.getByRole('complementary',{name:'入库任务详情'}).waitFor();
  await screenshot(page,'task-detail.png');
  await page.getByRole('button',{name:'用于知识库问答'}).click();
  await page.getByLabel('输入问题').fill('请概括这份资料');await page.getByLabel('发送问题').click();
  await page.getByLabel('查看引用 2').waitFor();
  assert.deepEqual(chatPayload.document_ids,['manual']);
  await page.getByLabel('查看引用 2').click();
  assert.ok((await page.locator('.original-text').innerText()).includes('界面回归'));
  await screenshot(page,'chat-citation.png');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'复制代码'}).click();
  assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).startsWith('print('));
  await page.getByRole('button',{name:'较早内容已整理为摘要 · 查看摘要'}).click();
  await page.getByRole('complementary',{name:'对话摘要'}).waitFor();await page.keyboard.press('Escape');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出 Markdown'}).click();assert.equal((await download).suggestedFilename(),'Super Assintant-回答.md');
  await page.getByLabel('输入问题').fill('输入法检查');await page.getByLabel('输入问题').dispatchEvent('keydown',{key:'Enter',isComposing:true});await page.getByLabel('输入问题').press('Shift+Enter');assert.equal(turns.length,1);await page.getByLabel('输入问题').fill('');
  report.checks.push('限定检索、引用、摘要、代码复制、Markdown 下载、输入法');
  await page.locator('.chat-scroll').evaluate(node=>{node.scrollTop=0;node.dispatchEvent(new Event('scroll'));});
  await page.waitForFunction(()=>document.querySelector('.chat-scroll').scrollTop<2);
  await page.getByRole('button',{name:'回到最新消息'}).waitFor();
  turns.push({request_id:'second',seq:2,status:'completed',error:null,request:{user_input:'追加',mode:'chat'},response:null,messages:[{id:'second-answer',role:'assistant',text:'另一设备追加的回答，不能打断正在阅读的内容。',mode:'chat'}]});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByText('另一设备追加的回答，不能打断正在阅读的内容。',{exact:true}).waitFor();
  assert.ok(await page.locator('.chat-scroll').evaluate(node=>node.scrollTop<5));
  await page.getByRole('button',{name:'回到最新消息'}).click();
  await page.waitForFunction(()=>{const node=document.querySelector('.chat-scroll');return node.scrollHeight-node.scrollTop-node.clientHeight<80;});
  report.checks.push('手动阅读不被新消息打断、回到最新');
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:/Warm Dark/}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.equal(new URL(page.url()).hash,'#/settings');
  await screenshot(page,'settings-dark.png');
  await assertSelectedContrast(page);report.checks.push('浅深主题选中文字对比度至少 4.5:1');
  await page.getByRole('button',{name:/Warm Light/}).click();
  for(const width of [360,390,768,1024,1280,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto(`${base}/#/library`);await page.getByRole('button',{name:'查看文件 项目知识手册.md'}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`文件页溢出 ${width}`);
    await page.getByRole('button',{name:'查看文件 项目知识手册.md'}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`详情溢出 ${width}`);
    if(width<1280){await page.getByRole('dialog',{name:'文件详情'}).waitFor();await page.keyboard.press('Escape');}
    else {await page.getByRole('complementary',{name:'文件详情'}).waitFor();await page.getByLabel('关闭面板').click();}
    await page.goto(`${base}/#/chat`);await page.getByLabel('查看引用 2').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`对话溢出 ${width}`);
    if(width===390){await screenshot(page,'chat-mobile.png');await page.getByLabel('打开导航').click();await page.getByRole('dialog',{name:'导航'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByLabel('打开导航').evaluate(node=>node===document.activeElement),true);}
    report.checks.push(`布局、详情和长内容 ${width}px`);
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.getByLabel('全局搜索').click();await page.getByRole('textbox',{name:'搜索工作空间'}).fill('项目知识');await page.getByRole('button',{name:'入库任务',exact:true}).click();await page.getByRole('complementary',{name:'入库任务详情'}).waitFor();
  assert.deepEqual(report.page_errors,[]);report.checks.push('全局搜索与任务定位、无浏览器错误');
  report.passed=true;
} catch(error){report.passed=false;report.error=String(error);throw error;}
finally {await writeFile(new URL('report.json',directory),JSON.stringify(report,null,2));await browser.close();await server?.close();console.log(JSON.stringify(report));}
