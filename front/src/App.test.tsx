import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { ApiError, conversationsApi as api, documentsApi, request, type DocumentRecord, type HistoryPage, type ServerTurn } from './api';
const citation={number:2,chunk_id:'abc',document_id:'doc',ingestion_id:'v',chunk_index:0,filename:'手册.md',text:'引用原文内容',score:.85,metadata:{page_number:7}};
const response=(data:unknown,status=200)=>({ok:status<400,status,json:async()=>data}) as Response;
let history:HistoryPage;
const turn=(rid:string,text='测试问题',reply='回答'):ServerTurn=>({request_id:rid,seq:1,status:'completed',error:null,response:null,request:{user_input:text,mode:'chat'},messages:[{id:rid+'u',role:'user',text,mode:'chat'},{id:rid+'a',role:'assistant',text:reply,mode:'chat',citations:[citation]}]});
beforeEach(()=>{
  window.history.replaceState(null,'','/');
  vi.spyOn(documentsApi,'list').mockResolvedValue({data:[],worker_available:true});
  history={conversation:{id:'c',title:'服务器会话',updated_at:1},data:[],next_before:null,processing_request_id:null};
  vi.spyOn(api,'list').mockImplementation(async()=>({data:history.data.length?[history.conversation]:[],next_offset:null}));
  vi.spyOn(api,'create').mockResolvedValue({data:history.conversation});
  vi.spyOn(api,'history').mockImplementation(async()=>structuredClone(history));
  vi.spyOn(api,'status').mockImplementation(async(_cid,rid)=>{const data=history.data.find(t=>t.request_id===rid);if(!data)throw new ApiError('请求尚未创建',404);return {data:structuredClone(data)};});
  vi.spyOn(api,'send').mockImplementation(async(_cid,rid,payload)=>{const record=turn(rid,payload.user_input);record.request=payload;history.data=[...history.data.filter(t=>t.request_id!==rid),record];return {};});
  vi.spyOn(api,'remove').mockImplementation(async()=>{history.data=[];});
  vi.spyOn(api,'import').mockResolvedValue({data:history.conversation});
});

const readyDocument:DocumentRecord={document_id:'manual',original_filename:'知识手册.md',status:'ready',chunk_count:3,error:null,size_bytes:128,created_at:1,updated_at:2,embedding_dimension:1024};
describe('真实能力工作台',()=>{
  it('文件库选择文档后限制检索，重试保留原范围，新对话清除范围',async()=>{
    vi.mocked(documentsApi.list).mockResolvedValue({data:[readyDocument],worker_available:true});
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:'文件与作品库'}));
    fireEvent.click(await screen.findByRole('button',{name:'用于问答'}));
    vi.mocked(api.send).mockRejectedValueOnce(new ApiError('模型失败',502));
    send('只查这份资料');await screen.findByText('模型失败');
    const original=vi.mocked(api.send).mock.calls[0];expect(original[2]).toEqual({user_input:'只查这份资料',mode:'rag',document_ids:['manual']});
    fireEvent.click(screen.getByRole('button',{name:'恢复全部资料'}));fireEvent.click(screen.getByRole('button',{name:'重新尝试'}));
    await screen.findByText('回答');expect(vi.mocked(api.send).mock.calls[1]).toEqual(original);
    fireEvent.click(screen.getByRole('button',{name:'开启新对话'}));send('新的问题');await waitFor(()=>expect(api.send).toHaveBeenCalledTimes(3));expect(vi.mocked(api.send).mock.calls[2][2].document_ids).toBeUndefined();
  });
  it('入库重试后的服务器状态在任务与文件间共享，详情随刷新更新',async()=>{
    const failed={...readyDocument,status:'failed' as const,error:'解析失败'};
    vi.mocked(documentsApi.list).mockResolvedValue({data:[failed],worker_available:true});
    vi.spyOn(documentsApi,'retry').mockImplementation(async()=>{const queued={...failed,status:'queued' as const,error:null};vi.mocked(documentsApi.list).mockResolvedValue({data:[queued],worker_available:true});return {data:queued};});
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:'任务中心'}));await screen.findByText('入库失败',{selector:'.status-badge'});
    fireEvent.click(screen.getByRole('button',{name:'重试入库'}));await screen.findByText('等待入库',{selector:'.status-badge'});
    fireEvent.click(screen.getByRole('button',{name:'文件与作品库'}));expect(screen.getByText('等待入库',{selector:'.status-badge'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'查看详情'}));expect(screen.getByRole('dialog')).toHaveTextContent('等待入库');
    vi.mocked(documentsApi.list).mockResolvedValue({data:[readyDocument],worker_available:true});fireEvent(window,new Event('focus'));
    expect(await within(screen.getByRole('dialog')).findByText('已入库')).toBeInTheDocument();expect(screen.getByRole('button',{name:'用于知识库问答'})).toBeEnabled();
  });
  it('搜索、格式与状态筛选作用于真实列表，网格仍可打开详情',async()=>{
    vi.mocked(documentsApi.list).mockResolvedValue({data:[readyDocument,{...readyDocument,document_id:'pdf',original_filename:'参考.pdf',status:'processing'}],worker_available:true});
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:'文件与作品库'}));await screen.findByText('知识手册.md');
    fireEvent.change(screen.getByLabelText('文件格式筛选'),{target:{value:'PDF'}});expect(screen.queryByText('知识手册.md')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'网格视图'}));fireEvent.click(screen.getByRole('button',{name:'查看详情'}));expect(screen.getByRole('dialog')).toHaveTextContent('参考.pdf');fireEvent.click(screen.getByRole('button',{name:'关闭面板'}));
    fireEvent.change(screen.getByLabelText('状态筛选'),{target:{value:'ready'}});expect(screen.getByText('没有符合条件的结果')).toBeInTheDocument();
  });
  it('处理中的请求在页面切换后保留，且不允许换用文档',async()=>{
    vi.mocked(documentsApi.list).mockResolvedValue({data:[readyDocument],worker_available:true});
    let finish!:(value:unknown)=>void;vi.mocked(api.send).mockReturnValueOnce(new Promise(resolve=>finish=resolve));
    render(<App/>);send('慢请求');await waitFor(()=>expect(api.send).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button',{name:'文件与作品库'}));expect(await screen.findByRole('button',{name:'用于问答'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'设置'}));fireEvent.click(screen.getByRole('button',{name:/Warm Dark/}));expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByRole('button',{name:'AI 对话'}));expect(screen.getByText('慢请求')).toBeInTheDocument();expect(screen.getByLabelText('输入问题')).toBeDisabled();
    history.data=[turn('done','慢请求','处理完成')];finish({});await screen.findByText('处理完成');expect(api.send).toHaveBeenCalledTimes(1);
  });
  it('hash 页面恢复及主题默认模式设置不触发未接入的功能',async()=>{
    window.history.replaceState(null,'','/#/settings');const fetch=vi.spyOn(globalThis,'fetch');
    render(<App/>);expect(screen.getByRole('heading',{name:'设置',level:1})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/Warm Dark/}));fireEvent.change(screen.getByLabelText('新对话的默认模式'),{target:{value:'chat'}});
    expect(JSON.parse(localStorage.getItem('jc.preferences.v1')!)).toMatchObject({theme:'dark',defaultMode:'chat'});
    expect(screen.getByText(/Agent 工具调用与 MCP 连接尚未接入/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'创建自动化'})).not.toBeInTheDocument();expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'开启新对话'}));send('普通聊天');await waitFor(()=>expect(api.send).toHaveBeenCalledWith('c',expect.any(String),{user_input:'普通聊天',mode:'chat'}));
  });
  it('全局搜索区分对话与文档，并可定位入库任务详情',async()=>{
    vi.mocked(api.list).mockResolvedValue({data:[{id:'c',title:'手册讨论',updated_at:1}],next_offset:null});vi.mocked(documentsApi.list).mockResolvedValue({data:[readyDocument],worker_available:true});
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:'全局搜索'}));
    fireEvent.change(screen.getByRole('textbox',{name:'搜索工作空间'}),{target:{value:'手册'}});await within(screen.getByRole('dialog')).findByRole('button',{name:'手册讨论'});
    expect(screen.getByText('知识手册.md')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'入库任务'}));expect(screen.getByRole('dialog',{name:'入库任务详情'})).toHaveTextContent('已入库');expect(window.location.hash).toBe('#/tasks');
  });
  it('没有选择检索文档时阻止发送，恢复全部资料后可发送',async()=>{
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:/全部资料/}));fireEvent.click(screen.getByRole('checkbox',{name:'全部资料'}));fireEvent.click(screen.getByRole('button',{name:'完成选择'}));
    fireEvent.change(screen.getByLabelText('输入问题'),{target:{value:'问题'}});expect(screen.getByLabelText('发送问题')).toBeDisabled();fireEvent.keyDown(screen.getByLabelText('输入问题'),{key:'Enter'});expect(api.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'恢复全部资料'}));fireEvent.click(screen.getByLabelText('发送问题'));await screen.findByText('回答');
  });
  it('断网有明确反馈且不会发送，恢复后可用',async()=>{
    render(<App/>);vi.spyOn(navigator,'onLine','get').mockReturnValue(false);fireEvent(window,new Event('offline'));fireEvent.change(screen.getByLabelText('输入问题'),{target:{value:'问题'}});
    expect(screen.getByRole('alert')).toHaveTextContent('网络已断开');expect(screen.getByLabelText('发送问题')).toBeDisabled();expect(api.send).not.toHaveBeenCalled();
    vi.spyOn(navigator,'onLine','get').mockReturnValue(true);fireEvent(window,new Event('online'));expect(screen.getByLabelText('发送问题')).toBeEnabled();
  });
  it('会话 503 保留安全的服务器错误，不被改成知识库故障',async()=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValue(response({detail:'会话存储暂不可用'},503));
    await expect(request('/conversations',{method:'GET'})).rejects.toThrow('会话存储暂不可用');
  });
  it('详情中显示重试冲突，刷新成功不会清除操作错误',async()=>{
    const failed={...readyDocument,status:'failed' as const,error:'解析失败'};
    vi.mocked(documentsApi.list).mockResolvedValue({data:[failed],worker_available:true});vi.spyOn(documentsApi,'retry').mockRejectedValue(new ApiError('任务已被其他设备重试，请刷新状态',409));
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:'文件与作品库'}));fireEvent.click(await screen.findByRole('button',{name:'查看详情'}));
    const detail=within(screen.getByRole('dialog'));fireEvent.click(detail.getByRole('button',{name:'重试入库'}));expect(await detail.findByText('任务已被其他设备重试，请刷新状态')).toBeInTheDocument();
    await waitFor(()=>expect(detail.getByRole('button',{name:'重试入库'})).toBeEnabled());expect(detail.getByText('任务已被其他设备重试，请刷新状态')).toBeInTheDocument();
  });
});
function send(text='测试问题'){fireEvent.change(screen.getByLabelText('输入问题'),{target:{value:text}});fireEvent.click(screen.getByLabelText('发送问题'));}
describe('服务器多轮会话',()=>{
  it('首次发送才创建会话，模式切换沿用会话 ID',async()=>{
    render(<App/>);expect(api.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:/普通问答/}));fireEvent.click(screen.getByLabelText('发送问题'));
    expect(await screen.findByText('回答')).toBeInTheDocument();
    await waitFor(()=>expect(screen.getByLabelText('输入问题')).toBeEnabled());
    expect(api.send).toHaveBeenCalledWith('c',expect.any(String),{user_input:'帮我梳理一下这个想法：',mode:'chat'});
    fireEvent.click(screen.getByRole('button',{name:/^知识库$/}));send('继续解释');
    await waitFor(()=>expect(api.send).toHaveBeenCalledTimes(2));expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.send).toHaveBeenLastCalledWith('c',expect.any(String),{user_input:'继续解释',mode:'rag'});
  });
  it('失败重试先核对状态，复用请求 ID，不重复插入问题',async()=>{
    vi.mocked(api.send).mockRejectedValueOnce(new ApiError('模型失败',502));
    render(<App/>);send();expect(await screen.findByRole('alert')).toHaveTextContent('模型失败');
    fireEvent.click(screen.getByText('重新尝试'));expect(await screen.findByText('回答')).toBeInTheDocument();
    expect(vi.mocked(api.send).mock.calls[0][1]).toBe(vi.mocked(api.send).mock.calls[1][1]);
    expect(screen.getAllByText('测试问题')).toHaveLength(1);expect(api.status).toHaveBeenCalled();
  });
  it('响应丢失但服务器完成时恢复答案，不重新生成',async()=>{
    vi.mocked(api.send).mockImplementationOnce(async(_cid,rid,payload)=>{history.data=[turn(rid,payload.user_input,'服务器已完成')];throw Error('网络断开');});
    render(<App/>);send();expect(await screen.findByText('服务器已完成')).toBeInTheDocument();
    expect(api.send).toHaveBeenCalledTimes(1);expect(screen.queryByText('重新尝试')).not.toBeInTheDocument();
  });
  it('刷新后恢复未提交请求，允许用原 ID 重试',async()=>{
    localStorage.setItem('jc.ui.v2',JSON.stringify({active:'c',pending:{cid:'c',rid:'unsubmitted',payload:{user_input:'未提交的问题',mode:'chat'}}}));
    render(<App/>);expect(await screen.findByRole('alert')).toHaveTextContent('尚未提交');
    fireEvent.click(screen.getByText('重新尝试'));expect(await screen.findByText('回答')).toBeInTheDocument();
    expect(api.send).toHaveBeenCalledWith('c','unsubmitted',{user_input:'未提交的问题',mode:'chat'});
  });
  it('刷新恢复历史，窗口聚焦更新另一设备回答',async()=>{
    localStorage.setItem('jc.ui.v2',JSON.stringify({active:'c'}));history.data=[turn('old','旧问题','旧回答')];
    render(<App/>);expect(await screen.findByText('旧回答')).toBeInTheDocument();
    history.data.push({...turn('other','新问题','另一设备的回答'),seq:2});fireEvent(window,new Event('focus'));
    expect(await screen.findByText('另一设备的回答')).toBeInTheDocument();expect(api.send).not.toHaveBeenCalled();
  });
  it('处理中恢复后禁用发送，轮询到完成状态',async()=>{
    localStorage.setItem('jc.ui.v2',JSON.stringify({active:'c'}));history.data=[{...turn('run'),status:'processing',messages:turn('run').messages.slice(0,1)}];history.processing_request_id='run';
    render(<App/>);await screen.findByText('测试问题');expect(screen.getByLabelText('输入问题')).toBeDisabled();
    history.data=[turn('run','测试问题','后台完成')];history.processing_request_id=null;
    expect(await screen.findByText('后台完成',{}, {timeout:3500})).toBeInTheDocument();expect(screen.getByLabelText('输入问题')).toBeEnabled();
  });
  it('删除共享会话需确认，新建会话不带旧消息',async()=>{
    localStorage.setItem('jc.ui.v2',JSON.stringify({active:'c'}));history.data=[turn('old','旧问题','旧回答')];
    render(<App/>);await screen.findByText('旧回答');fireEvent.click(screen.getByText('开启新对话'));expect(screen.queryByText('旧回答')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('删除对话 服务器会话'));expect(api.remove).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('删除对话 服务器会话'));expect(screen.getByRole('dialog')).toHaveTextContent('服务器');fireEvent.click(screen.getByRole('button',{name:'确认'}));await waitFor(()=>expect(api.remove).toHaveBeenCalledWith('c'));
  });
  it('摘要可查看，引用正确映射且 HTML 不执行',async()=>{
    localStorage.setItem('jc.ui.v2',JSON.stringify({active:'c'}));history.data=[turn('old','问题','答案[2]\n\n<script>alert(1)</script>')];history.conversation.summary='用户希望用中文解释';
    render(<App/>);fireEvent.click(await screen.findByText('较早内容已整理为摘要 · 查看摘要'));expect(screen.getByText('用户希望用中文解释')).toBeInTheDocument();fireEvent.click(screen.getByLabelText('关闭面板'));
    fireEvent.click(screen.getByLabelText('查看引用 2'));expect(screen.getByText('引用原文内容')).toBeInTheDocument();expect(document.querySelector('script')).toBeNull();
  });
  it('旧记录仅手动导入且重复提交同一来源，不清除本机记录',async()=>{
    const old={id:'legacy',title:'旧会话',updated:1,messages:turn('old').messages};const saved=JSON.stringify({conversations:[old],uploads:[]});localStorage.setItem('jc.history.v1',saved);
    render(<App/>);expect(api.import).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'设置'}));fireEvent.click(screen.getByRole('button',{name:/导入本机旧对话/}));fireEvent.click(screen.getByRole('button',{name:'确认'}));await screen.findByText(/旧对话导入完成/);
    fireEvent.click(screen.getByRole('button',{name:/导入本机旧对话/}));fireEvent.click(screen.getByRole('button',{name:'确认'}));await waitFor(()=>expect(api.import).toHaveBeenCalledTimes(2));expect(api.import).toHaveBeenNthCalledWith(1,old);expect(api.import).toHaveBeenNthCalledWith(2,old);expect(localStorage.getItem('jc.history.v1')).toBe(saved);
  });
  it('偏好存储失败不影响服务器会话',async()=>{
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});render(<App/>);expect(screen.getByRole('status')).toHaveTextContent('服务器会话仍可正常使用');send();expect(await screen.findByText('回答')).toBeInTheDocument();
  });
  it('中文输入法、Shift Enter 和重复点击不误发',async()=>{
    let resolve!:(value:unknown)=>void;vi.mocked(api.send).mockReturnValue(new Promise(r=>resolve=r));render(<App/>);const input=screen.getByLabelText('输入问题');fireEvent.change(input,{target:{value:'问题'}});
    fireEvent.keyDown(input,{key:'Enter',isComposing:true});fireEvent.keyDown(input,{key:'Enter',shiftKey:true});expect(api.send).not.toHaveBeenCalled();fireEvent.keyDown(input,{key:'Enter'});fireEvent.click(screen.getByLabelText('发送问题'));
    await waitFor(()=>expect(api.send).toHaveBeenCalledTimes(1));expect(input).toBeDisabled();resolve({});await waitFor(()=>expect(input).toBeEnabled());
  });
  it('文档上传继续显示队列与失败状态',async()=>{
    const doc:DocumentRecord={document_id:'d',original_filename:'a.txt',status:'queued',chunk_count:null,error:null,size_bytes:5,created_at:1,updated_at:1,embedding_dimension:null};vi.mocked(documentsApi.list).mockResolvedValue({data:[doc],worker_available:true});vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,init)=>{const file=(init?.body as FormData).get('file') as File;return file.name==='a.txt'?response({data:doc}):response({detail:'文件过大'},413);});
    render(<App/>);fireEvent.click(screen.getByRole('button',{name:'上传资料到知识库'}));await userEvent.setup().upload(screen.getByLabelText('选择文档'),[new File(['hello'],'a.txt',{type:'text/plain'}),new File(['world'],'b.txt',{type:'text/plain'})]);expect(await screen.findByText('b.txt：文件过大')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'关闭面板'}));fireEvent.click(screen.getByRole('button',{name:'任务中心'}));expect(await screen.findByText('等待入库',{selector:'.status-badge'})).toBeInTheDocument();
  });
});
