import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowDown, ArrowUp, ArrowUpRight, BookOpen, Check, ChevronRight, Copy, Download, FileText, FolderOpen, ListTodo, LoaderCircle, Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, Paperclip, Plus, Search, Settings2, Trash2, UploadCloud, X } from 'lucide-react';
import { type Citation, type DocumentRecord, type Message, type Mode } from './api';
import { APP_NAME } from './brand';
import { useConversations } from './useConversations';
import { useDocuments } from './useDocuments';
import Library, { DocumentDetails, DocumentPicker, UploadPanel } from './Library';
import Settings from './Settings';
import { ContextPanel, Dialog, EmptyState, StatusBadge, pageTitles, useConfirmation, usePreferences, useRoute, type Route } from './workbench';

function remarkCitations() {
  return (tree:any)=>{
    function walk(node:any){
      if(!node.children||['link','code','inlineCode'].includes(node.type))return;
      node.children=node.children.flatMap((child:any)=>{
        if(child.type!=='text'){walk(child);return [child];}
        return child.value.split(/(\[\d+\])/g).filter(Boolean).map((part:string)=>/^\[\d+\]$/.test(part)
          ?{type:'link',url:`#cite-${part.slice(1,-1)}`,children:[{type:'text',value:part}]}:{type:'text',value:part});
      });
    }
    walk(tree);
  };
}
export function CopyButton({text,label='复制'}:{text:string;label?:string}){
  const [result,setResult]=useState('');
  return <button className="text-btn" onClick={async()=>{try{await navigator.clipboard.writeText(text);setResult('已复制');}catch{setResult('复制失败，请手动选择');}}}>{result==='已复制'?<Check size={14}/>:<Copy size={14}/>}<span aria-live="polite">{result||label}</span></button>;
}
function contentText(children:ReactNode):string {
  return Children.toArray(children).map(child=>typeof child==='string'||typeof child==='number'?String(child):isValidElement<{children?:ReactNode}>(child)?contentText(child.props.children):'').join('');
}
function CodeBlock({children}:{children:ReactNode}){
  return <div className="code-block"><div className="code-toolbar"><span>代码</span><CopyButton text={contentText(children)} label="复制代码"/></div><pre>{children}</pre></div>;
}
function exportMarkdown(text:string){
  const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`${APP_NAME}-回答.md`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function Answer({message,openCitation,followUp}:{message:Message;openCitation:(citation:Citation)=>void;followUp:()=>void}){
  return <><div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm,remarkCitations]} components={{
    a:({href,children})=>{
      const number=Number(href?.match(/^#cite-(\d+)$/)?.[1]);
      const citation=message.citations?.find(c=>c.number===number);
      return citation?<button className="inline-cite" onClick={()=>openCitation(citation)} aria-label={`查看引用 ${number}`}>{children}</button>
        :href?.startsWith('#cite-')?<span>{children}</span>:<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    },pre:({children})=><CodeBlock>{children}</CodeBlock>,
  }}>{message.text}</ReactMarkdown></div>
    {!!message.citations?.length&&<div className="sources"><span>参考来源</span>{message.citations.map(c=><button key={c.number} onClick={()=>openCitation(c)}><FileText size={13}/><b>{c.number}</b><span>{c.filename}</span><ChevronRight size={13}/></button>)}</div>}
    <div className="message-actions"><CopyButton text={message.text}/><button className="text-btn" onClick={followUp}><MessageSquare size={14}/>继续追问</button><button className="text-btn" onClick={()=>exportMarkdown(message.text)}><Download size={14}/>导出 Markdown</button></div>
  </>;
}
type Panel={kind:'citation';citation:Citation}|{kind:'summary'}|{kind:'document';id:string;task:boolean};
const navigation:[Route,typeof MessageSquare][]=[['chat',MessageSquare],['tasks',ListTodo],['library',FolderOpen],['settings',Settings2]];

function LogoMark({className}:{className:string}){
  return <span className={`brand-symbol ${className}`} aria-hidden="true"/>;
}

export default function App(){
  const prefs=usePreferences();
  const confirmation=useConfirmation();
  const state=useConversations(prefs.preferences.defaultMode,confirmation.confirm);
  const documents=useDocuments();
  const {route,navigate}=useRoute();
  const [mobile,setMobile]=useState(()=>window.matchMedia?.('(max-width: 1023px)').matches??false);
  const [sidebar,setSidebar]=useState(false);
  const [panel,setPanel]=useState<Panel|null>(null);
  const [modal,setModal]=useState<'upload'|'picker'|'search'|null>(null);
  const [historyQuery,setHistoryQuery]=useState('');
  const [search,setSearch]=useState('');
  const [offline,setOffline]=useState(!navigator.onLine);
  const [latest,setLatest]=useState(false);
  const input=useRef<HTMLTextAreaElement>(null);
  const scroll=useRef<HTMLElement>(null);
  const end=useRef<HTMLDivElement>(null);
  const atBottom=useRef(true);
  const {active,messages,busy,draft,setDraft,mode,setMode,send}=state;
  const current=state.page?.conversation||state.conversations.find(c=>c.id===active);
  const pendingDocs=documents.documents.filter(d=>d.status==='queued'||d.status==='processing').length;
  const selected=panel?.kind==='document'?documents.documents.find(d=>d.document_id===panel.id):undefined;
  const emptyScope=mode==='rag'&&state.documentIds?.length===0;
  const missingScope=mode==='rag'&&state.documentIds!==null&&documents.loaded&&state.documentIds.some(id=>!documents.documents.some(d=>d.document_id===id&&d.status==='ready'));

  useEffect(()=>{
    setModal(null);setSidebar(false);
    setPanel(previous=>previous?.kind==='citation'&&route!=='chat'||previous?.kind==='document'&&route!==(previous.task?'tasks':'library')?null:previous);
  },[route]);

  useEffect(()=>{
    const media=window.matchMedia?.('(max-width: 1023px)');if(!media)return;
    const change=()=>{setMobile(media.matches);setSidebar(false);};media.addEventListener('change',change);return ()=>media.removeEventListener('change',change);
  },[]);
  useEffect(()=>{
    const online=()=>setOffline(!navigator.onLine);window.addEventListener('online',online);window.addEventListener('offline',online);
    const key=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setModal('search');}};
    window.addEventListener('keydown',key);return ()=>{window.removeEventListener('online',online);window.removeEventListener('offline',online);window.removeEventListener('keydown',key);};
  },[]);
  useEffect(()=>{if(route==='chat'&&atBottom.current)end.current?.scrollIntoView?.({behavior:'smooth'});else if(route==='chat')setLatest(true);},[messages.length,busy,route]);
  useEffect(()=>{atBottom.current=true;setLatest(false);},[active]);
  function go(next:Route){navigate(next);setSidebar(false);setPanel(null);}
  function choose(id:string|null){if(busy)return;state.choose(id);go('chat');}
  function starter(text:string,next:Mode){setDraft(text);setMode(next);input.current?.focus();}
  function useDocument(record:DocumentRecord){
    if(busy||record.status!=='ready')return;
    setMode('rag');state.setDocumentIds([record.document_id]);go('chat');
    requestAnimationFrame(()=>input.current?.focus());
  }
  function submit(){if(!emptyScope&&!missingScope&&!offline){atBottom.current=true;setLatest(false);void send();}}
  function toLatest(){atBottom.current=true;setLatest(false);end.current?.scrollIntoView?.({behavior:'smooth'});}
  const sidebarContent=<>
    <div className="brand"><LogoMark className="brand-mark"/><div className="sidebar-label"><strong>{APP_NAME}</strong><small>留一点空间，给好想法。</small></div>{!mobile&&<button className="icon-btn collapse-button" aria-label={prefs.preferences.collapsed?'展开侧栏':'收起侧栏'} onClick={()=>prefs.update({collapsed:!prefs.preferences.collapsed})}>{prefs.preferences.collapsed?<PanelLeftOpen size={17}/>:<PanelLeftClose size={17}/>}</button>}</div>
    <button className="new-chat soft-btn" aria-label="开启新对话" onClick={()=>choose(null)} disabled={busy}><Plus size={18}/><span className="sidebar-label">开启新对话</span></button>
    <nav aria-label="主导航">{navigation.map(([key,Icon])=><button key={key} className={`nav-item ${route===key?'selected':''}`} aria-label={pageTitles[key]} aria-current={route===key?'page':undefined} onClick={()=>go(key)}><Icon size={18}/><span className="sidebar-label">{pageTitles[key]}</span>{key==='tasks'&&pendingDocs>0&&<span className="nav-count sidebar-label">{pendingDocs}</span>}</button>)}</nav>
    <div className="recent-area sidebar-label"><div className="history-heading"><span>最近对话</span><span>{state.conversations.length}</span></div><label className="search-field compact"><Search size={14}/><input aria-label="搜索已加载会话" placeholder="搜索已加载会话" value={historyQuery} onChange={event=>setHistoryQuery(event.target.value)}/></label>
      <div className="history-list">{state.conversations.filter(c=>c.title.toLowerCase().includes(historyQuery.toLowerCase())).map(c=><div className={`history-item ${active===c.id?'active':''}`} key={c.id}><button disabled={busy} onClick={()=>choose(c.id)} title={c.title}>{c.title}</button><button className="icon-btn delete-chat" aria-label={`删除对话 ${c.title}`} disabled={busy} onClick={()=>void state.remove(c.id)}><Trash2 size={14}/></button></div>)}
        {!state.conversations.length&&<p className="footnote">新的想法，从一句话开始。<br/>对话会保存在这里。</p>}{state.conversations.length>0&&!state.conversations.some(c=>c.title.toLowerCase().includes(historyQuery.toLowerCase()))&&<p className="footnote">已加载的会话中没有匹配结果。</p>}
      </div>{state.nextOffset!==null&&<button className="text-btn" onClick={state.loadMore}>加载更多会话</button>}
    </div>
    <div className="sidebar-footer"><span className="avatar">我</span><div className="sidebar-label"><strong>个人工作空间</strong><small>服务器共享空间</small></div></div>
  </>;

  return <div className={`app-shell ${prefs.preferences.collapsed&&!mobile?'collapsed':''}`}>
    {!mobile&&<aside className="sidebar">{sidebarContent}</aside>}
    {mobile&&sidebar&&<Dialog title="导航" close={()=>setSidebar(false)}>{sidebarContent}</Dialog>}
    <main className="main-panel">
      <header className="topbar"><div className="topbar-title">{mobile&&<button className="icon-btn" aria-label="打开导航" onClick={()=>setSidebar(true)}><Menu size={20}/></button>}<span>{pageTitles[route]}</span>{route==='chat'&&<><span className="divider">/</span><strong>{current?.title||'新的开始'}</strong></>}</div><div className="topbar-actions"><button className="global-search" aria-label="全局搜索" onClick={()=>setModal('search')}><Search size={16}/><span>搜索工作空间</span><kbd>⌘ / Ctrl K</kbd></button><button className="icon-btn task-indicator" aria-label={`查看入库任务，${pendingDocs} 个处理中`} onClick={()=>go('tasks')}><ListTodo size={18}/>{pendingDocs>0&&<span>{pendingDocs}</span>}</button></div></header>
      {offline&&<div className="feedback error global-feedback" role="alert">网络已断开。恢复连接后可核对服务器状态。</div>}
      {state.warning&&<div className="feedback global-feedback" role="status">本机偏好存储不可用或旧记录损坏；服务器会话仍可正常使用。</div>}
      {state.notice&&<div className="feedback global-feedback" role="status">{state.notice}<button className="text-btn" onClick={state.reload}>刷新</button></div>}
      <div className="chat-view" hidden={route!=='chat'}>
        {state.loading&&<p className="processing" role="status">正在读取会话…</p>}
        {state.page?.conversation.summary&&<button className="summary-banner" onClick={()=>setPanel({kind:'summary'})}>较早内容已整理为摘要 · 查看摘要<ChevronRight size={14}/></button>}
        <section ref={scroll} className={`chat-scroll ${!messages.length?'welcome-scroll':''}`} aria-label="对话记录" onScroll={()=>{const node=scroll.current;if(node){atBottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<80;setLatest(!atBottom.current);}}}>
          {!messages.length?<div className="welcome"><LogoMark className="welcome-mark"/><p className="section-kicker">把零散的想法，变成清晰的下一步</p><h1>今天想完成什么？</h1><p className="welcome-description">聊一个想法，查一份资料，或从一个问题开始。<br/>{APP_NAME} 陪你把事情理清楚。</p><div className="suggestions">
            <button onClick={()=>starter('帮我梳理一下这个想法：','chat')}><MessageSquare size={20}/><strong>普通问答</strong><span>一起思考，理清想法</span><ArrowUpRight size={14}/></button>
            <button onClick={()=>starter('请根据我的资料回答：','rag')}><BookOpen size={20}/><strong>知识库查询</strong><span>让回答有据可循</span><ArrowUpRight size={14}/></button>
            <button onClick={()=>setModal('upload')}><UploadCloud size={20}/><strong>上传资料</strong><span>为知识库添一份资料</span><ArrowUpRight size={14}/></button>
            <button onClick={()=>go('tasks')}><ListTodo size={20}/><strong>查看入库任务</strong><span>了解资料处理状态</span><ArrowUpRight size={14}/></button>
          </div></div>:<div className="messages">{state.page?.next_before!=null&&<button className="text-btn" disabled={state.loading} onClick={()=>void state.loadOlder()}>加载更早记录</button>}{messages.map(m=><article className={`message ${m.role}`} key={m.id}>{m.role==='assistant'&&<div className="assistant-label"><LogoMark className="mini-brand"/>{APP_NAME}<span>{m.mode==='rag'?'来自你的知识库':'与你一起思考'}</span></div>}{m.role==='user'?<div className="user-bubble">{m.text}</div>:<Answer message={m} openCitation={citation=>setPanel({kind:'citation',citation})} followUp={()=>{setDraft('请继续说明：');input.current?.focus();}}/>}</article>)}
            {busy&&<div className="processing" role="status"><LoaderCircle size={16} className="spin"/>服务器正在处理请求，完成后显示回答。</div>}<div ref={end}/></div>}
        </section>
        {state.error&&<div className="feedback error chat-error" role="alert"><span>{state.error}</span>{state.retryTarget&&<button className="text-btn" onClick={()=>void send(true)} disabled={busy||offline}>重新尝试</button>}</div>}
        {latest&&<button className="latest-button soft-btn" onClick={toLatest}><ArrowDown size={15}/>回到最新消息</button>}
        <footer className="composer-area"><div className="composer">
          {mode==='rag'&&state.documentIds!==null&&<div className="scope-chips"><span>检索范围</span>{state.documentIds.map(id=><span className="scope-chip" key={id}>{documents.documents.find(d=>d.document_id===id)?.original_filename||'已选文档'}<button aria-label="移除此检索文档" disabled={busy} onClick={()=>state.setDocumentIds(state.documentIds!.filter(value=>value!==id))}><X size={12}/></button></span>)}<button className="text-btn" disabled={busy} onClick={()=>state.setDocumentIds(null)}>恢复全部资料</button></div>}
          <textarea ref={input} value={draft} onChange={event=>setDraft(event.target.value)} placeholder="说说你想完成的事…" aria-label="输入问题" rows={2} maxLength={8000} disabled={busy||state.loading} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing&&event.keyCode!==229){event.preventDefault();submit();}}}/>
          <div className="composer-tools"><div className="composer-left"><button className="icon-btn" aria-label="上传资料到知识库" onClick={()=>setModal('upload')}><Paperclip size={18}/></button><div className="segmented" role="group" aria-label="回答模式"><button aria-pressed={mode==='rag'} onClick={()=>setMode('rag')} disabled={busy}><BookOpen size={14}/>知识库</button><button aria-pressed={mode==='chat'} onClick={()=>setMode('chat')} disabled={busy}><MessageSquare size={14}/>普通聊天</button></div>{mode==='rag'&&<button className="scope-select text-btn" disabled={busy} onClick={()=>setModal('picker')}>{state.documentIds===null?'全部资料':`${state.documentIds.length} 份资料`}<ChevronRight size={13}/></button>}</div><button className="send-button" aria-label="发送问题" onClick={submit} disabled={!draft.trim()||busy||state.loading||emptyScope||missingScope||offline}>{busy?<LoaderCircle size={18} className="spin"/>:<ArrowUp size={20}/>}</button></div>
          {(emptyScope||missingScope)&&<p className="scope-error">{emptyScope?'请选择至少一份文档，或恢复全部资料。':'已选文档暂不可用于问答，请重新选择或恢复全部资料。'}</p>}
        </div><p className="privacy-note">会话保存在服务器，局域网设备共享 · Enter 发送，Shift + Enter 换行</p></footer>
      </div>
      {route==='tasks'&&<Library key="tasks" state={documents} task busy={busy} open={record=>setPanel({kind:'document',id:record.document_id,task:true})} upload={()=>setModal('upload')} useDocument={useDocument}/>}
      {route==='library'&&<Library key="library" state={documents} busy={busy} open={record=>setPanel({kind:'document',id:record.document_id,task:false})} upload={()=>setModal('upload')} useDocument={useDocument}/>}
      {route==='settings'&&<Settings prefs={prefs} legacyCount={state.legacyCount} importing={state.importing} importLegacy={()=>void state.importLegacy()} summary={state.page?.conversation.summary} openSummary={()=>setPanel({kind:'summary'})}/>}
    </main>
    {panel&&<ContextPanel title={panel.kind==='citation'?'参考原文':panel.kind==='summary'?'对话摘要':panel.task?'入库任务详情':'文件详情'} close={()=>setPanel(null)}>
      {panel.kind==='citation'&&<><div className="citation-heading"><FileText size={24}/><h3 className="wrap">{panel.citation.filename}</h3></div><p className="muted">引用 [{panel.citation.number}]{panel.citation.metadata.page_number!=null?` · 第 ${panel.citation.metadata.page_number} 页`:''}</p><div className="original-text">{panel.citation.text}</div><p className="footnote">余弦相似度 {panel.citation.score.toFixed(3)}，表示语义接近程度，不代表答案正确率。</p><CopyButton text={panel.citation.text}/></>}
      {panel.kind==='summary'&&<><p className="muted">由模型整理，仅用于延续当前会话，可能有遗漏。完整原始对话仍可查看。</p><div className="original-text">{state.page?.conversation.summary||'当前会话尚无摘要。'}</div></>}
      {panel.kind==='document'&&(selected?<DocumentDetails record={selected} state={documents} task={panel.task} busy={busy} useDocument={useDocument}/>:<EmptyState title="暂时无法读取此记录"><p>请刷新文档列表后重试。</p></EmptyState>)}
      {panel.kind==='document'&&busy&&<p className="feedback">当前对话请求处理中，完成后可选择文档用于问答。</p>}
    </ContextPanel>}
    {modal==='upload'&&<Dialog title="上传资料到知识库" close={()=>setModal(null)}><UploadPanel state={documents}/><button className="text-btn" onClick={()=>{setModal(null);go('tasks');}}>查看入库任务<ArrowUpRight size={14}/></button></Dialog>}
    {modal==='picker'&&<Dialog title="选择知识库资料" close={()=>setModal(null)}><DocumentPicker state={documents} selected={state.documentIds} setSelected={state.setDocumentIds}/><button className="primary-btn" onClick={()=>setModal(null)}>完成选择</button></Dialog>}
    {modal==='search'&&<Dialog title="搜索工作空间" kind="search" close={()=>setModal(null)}><label className="search-field"><Search size={17}/><input autoFocus aria-label="搜索工作空间" placeholder="搜索对话、文件与入库任务" value={search} onChange={event=>setSearch(event.target.value)}/></label><p className="footnote">搜索已加载的会话标题和网页上传文件名，不搜索消息正文。</p><h3>对话</h3>{state.conversations.filter(c=>c.title.toLowerCase().includes(search.toLowerCase())).map(c=><button className="search-result" disabled={busy} key={c.id} onClick={()=>{setModal(null);choose(c.id);}}><MessageSquare size={16}/><span>{c.title}</span><ChevronRight size={14}/></button>)}{!state.conversations.some(c=>c.title.toLowerCase().includes(search.toLowerCase()))&&<p className="muted">没有匹配的已加载会话。</p>}{state.nextOffset!==null&&<button className="text-btn" onClick={state.loadMore}>加载更多会话</button>}<h3>文件与入库任务</h3>{documents.loading&&<p role="status">正在读取文档…</p>}{documents.error&&<p role="alert" className="feedback error">{documents.error}</p>}{documents.documents.filter(d=>d.original_filename.toLowerCase().includes(search.toLowerCase())).map(d=><div className="search-document" key={d.document_id}><FileText size={18}/><span className="wrap">{d.original_filename}</span><StatusBadge status={d.status}/><div><button className="text-btn" onClick={()=>{setModal(null);go('library');setPanel({kind:'document',id:d.document_id,task:false});}}>文件详情</button><button className="text-btn" onClick={()=>{setModal(null);go('tasks');setPanel({kind:'document',id:d.document_id,task:true});}}>入库任务</button></div></div>)}{!documents.loading&&!documents.error&&!documents.documents.some(d=>d.original_filename.toLowerCase().includes(search.toLowerCase()))&&<p className="muted">没有匹配的上传文档。</p>}</Dialog>}
    {confirmation.element}
  </div>;
}
