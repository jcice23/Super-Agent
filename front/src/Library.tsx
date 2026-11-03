import { useState } from 'react';
import { BookOpen, FileText, LayoutGrid, List, RefreshCw, Search, UploadCloud } from 'lucide-react';
import { type DocumentRecord, type DocumentStatus } from './api';
import { type DocumentsState, documentLabels } from './useDocuments';
import { EmptyState, StatusBadge, fileSize, fileType, formatDate } from './workbench';

export function DocumentFeedback({state}:{state:DocumentsState}){
  return <>
    {state.error&&<div className="feedback error" role="alert">{state.error}<button className="text-btn" onClick={()=>void state.reload()}>重新读取</button></div>}
    {state.actionError&&<div className="feedback error" role="alert">{state.actionError}</div>}
    {state.notice&&<div className="feedback success" role="status">{state.notice}</div>}
    {state.failures.map((text,index)=><div className="feedback error" role="alert" key={index}>{text}</div>)}
    {state.workerAvailable===false&&<div className="feedback" role="status">入库服务尚未就绪，已上传文档会保留在队列中。</div>}
  </>;
}
export function UploadPanel({state}:{state:DocumentsState}){
  return <>
    <p className="muted">上传资料到知识库，入库后即可用于问答。文件不会作为多模态附件直接发送给模型。</p>
    <label className={`upload-zone ${state.uploading?'disabled':''}`}><UploadCloud size={30}/><strong>{state.uploading?'正在上传文档…':'选择文档，加入知识库'}</strong><span>PDF、DOCX、Markdown、TXT · 支持多选</span>
      <input type="file" multiple accept=".pdf,.docx,.md,.txt" aria-label="选择文档" disabled={state.uploading} onChange={event=>{void state.uploadFiles(event.target.files);event.target.value='';}}/>
    </label>
    {state.currentUpload&&<p role="status" className="wrap">正在上传：{state.currentUpload}</p>}
    <p className="footnote">关闭面板不会中断本次上传与后台入库。扫描 PDF 暂不支持文字识别。</p>
    <DocumentFeedback state={state}/>
  </>;
}
export function DocumentPicker({state,selected,setSelected}:{state:DocumentsState;selected:string[]|null;setSelected:(ids:string[]|null)=>void}){
  const ready=state.documents.filter(d=>d.status==='ready');
  return <>
    <p className="muted">选择当前对话的检索范围。仅列出网页上传且已入库的资料；“全部资料”同时包含服务器启用的离线资料。</p>
    <label className="selection-row"><input type="checkbox" checked={selected===null} onChange={event=>setSelected(event.target.checked?null:[])}/><strong>全部资料</strong></label>
    {state.loading&&<p role="status">正在读取文档…</p>}
    <DocumentFeedback state={state}/>
    {!state.loading&&!state.error&&!ready.length&&<EmptyState title="还没有可选择的上传资料"><p>先上传文档，等待入库完成。</p></EmptyState>}
    {ready.map(d=><label className="selection-row" key={d.document_id}><input type="checkbox" checked={selected?.includes(d.document_id)??false} onChange={event=>setSelected(event.target.checked?[...(selected||[]),d.document_id]:(selected||[]).filter(id=>id!==d.document_id))}/><FileText size={18}/><span className="wrap">{d.original_filename}</span></label>)}
    {selected?.length===0&&<p className="feedback">请选择至少一份资料，或切换为“全部资料”。</p>}
  </>;
}
export function DocumentDetails({record,state,useDocument,task=false,busy=false}:{record:DocumentRecord;state:DocumentsState;useDocument:(record:DocumentRecord)=>void;task?:boolean;busy?:boolean}){
  return <>
    <div className="detail-file-icon"><FileText size={30}/></div><h3 className="wrap">{record.original_filename}</h3><StatusBadge status={record.status}/>
    <dl className="detail-fields"><dt>类型</dt><dd>{task?'文档入库任务':fileType(record.original_filename)}</dd><dt>来源</dt><dd>网页上传</dd><dt>文件大小</dt><dd>{fileSize(record.size_bytes)}</dd><dt>创建时间</dt><dd>{formatDate(record.created_at)}</dd><dt>最近更新</dt><dd>{formatDate(record.updated_at)}</dd>
      {record.status==='ready'&&<><dt>已入库分块</dt><dd>{record.chunk_count??'暂无记录'}</dd></>}
    </dl>
    {record.error&&<div className="feedback error" role="alert">{record.error}</div>}
    {state.actionError&&<div className="feedback error" role="alert">{state.actionError}</div>}
    {state.error&&<div className="feedback error" role="alert">状态刷新失败：{state.error}</div>}
    {record.status==='failed'&&<button className="soft-btn" onClick={()=>void state.retry(record.document_id)} disabled={state.retrying!==null}><RefreshCw size={15}/>{state.retrying===record.document_id?'提交中…':'重试入库'}</button>}
    {record.status==='ready'?<button className="primary-btn" disabled={busy} onClick={()=>useDocument(record)}><BookOpen size={16}/>用于知识库问答</button>:<p className="muted">文档入库成功后即可用于知识库问答。</p>}
    <p className="capability-note">{task?'当前仅提供入库状态，尚未记录分步时间线或支持取消任务。':'当前提供文件信息；原文件预览、下载、删除与生成作品管理尚未接入。'}</p>
  </>;
}

export default function Library({state,task=false,open,upload,useDocument,busy=false}:{state:DocumentsState;task?:boolean;open:(record:DocumentRecord)=>void;upload:()=>void;useDocument:(record:DocumentRecord)=>void;busy?:boolean}){
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState<DocumentStatus|'all'>('all');
  const [format,setFormat]=useState('all');
  const [sort,setSort]=useState('updated');
  const [grid,setGrid]=useState(false);
  const rows=state.documents.filter(d=>(!query||d.original_filename.toLowerCase().includes(query.toLowerCase()))&&(status==='all'||d.status===status)&&(format==='all'||fileType(d.original_filename)===format))
    .sort((a,b)=>sort==='name'?a.original_filename.localeCompare(b.original_filename,'zh-CN'):sort==='created'?b.created_at-a.created_at:b.updated_at-a.updated_at);
  return <section className="workspace-page">
    <div className="page-heading"><div><p className="section-kicker">{task?'每一份资料，都有明确的状态':'让你的资料，成为可用的知识'}</p><h1>{task?'任务中心':'文件与作品库'}</h1><p className="muted">{task?'文档入库任务 · 来自真实服务器状态':'上传文档 · 与知识库保持同步'}</p></div><button className="primary-btn" onClick={upload}><UploadCloud size={16}/>上传资料</button></div>
    <DocumentFeedback state={state}/>
    <div className="filter-toolbar"><label className="search-field"><Search size={16}/><input aria-label={task?'搜索入库任务':'搜索文档'} placeholder={task?'搜索任务名称':'搜索文件名称'} value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <select aria-label="状态筛选" value={status} onChange={event=>setStatus(event.target.value as DocumentStatus|'all')}><option value="all">全部状态</option>{Object.entries(documentLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
      {!task&&<select aria-label="文件格式筛选" value={format} onChange={event=>setFormat(event.target.value)}><option value="all">全部格式</option>{['PDF','DOCX','MD','TXT'].map(type=><option key={type}>{type}</option>)}</select>}
      <select aria-label="排序方式" value={sort} onChange={event=>setSort(event.target.value)}><option value="updated">最近更新</option><option value="created">创建时间</option><option value="name">名称排序</option></select>
      {!task&&<div className="segmented" role="group" aria-label="文件视图"><button className="icon-btn" aria-label="列表视图" aria-pressed={!grid} onClick={()=>setGrid(false)}><List size={17}/></button><button className="icon-btn" aria-label="网格视图" aria-pressed={grid} onClick={()=>setGrid(true)}><LayoutGrid size={17}/></button></div>}
    </div>
    <div className="list-caption"><span>{rows.length} {task?'个任务':'份文档'}</span><button className="text-btn" onClick={()=>void state.reload()}><RefreshCw size={13}/>刷新</button></div>
    {state.loading&&<p className="feedback" role="status">正在读取{task?'任务':'文件'}…</p>}
    {!state.loading&&!state.error&&!rows.length&&<EmptyState title={state.documents.length?'没有符合条件的结果':task?'还没有入库任务':'从第一份资料开始'}><p>{state.documents.length?'试试其他关键词或筛选条件。':'上传一份文档，在这里查看入库状态。'}</p>{!state.documents.length&&<button className="soft-btn" onClick={upload}>上传资料</button>}</EmptyState>}
    <div className={grid&&!task?'file-grid':'document-list'}>{rows.map(d=><article className="document-row" key={d.document_id}>
      <button className="document-main" onClick={()=>open(d)} aria-label={`查看${task?'任务':'文件'} ${d.original_filename}`}><span className="file-icon"><FileText size={23}/><small>{fileType(d.original_filename)}</small></span><span className="document-name"><strong>{d.original_filename}</strong><span>{task?'文档入库':fileSize(d.size_bytes)} · {formatDate(d.updated_at)}</span></span><StatusBadge status={d.status}/></button>
      <div className="row-actions">{d.status==='failed'&&<button className="text-btn" onClick={()=>void state.retry(d.document_id)} disabled={state.retrying!==null}>{state.retrying===d.document_id?'提交中…':'重试入库'}</button>}{!task&&d.status==='ready'&&<button className="text-btn" disabled={busy} title={busy?'当前对话请求处理中':'将此文档设为检索范围'} onClick={()=>useDocument(d)}>用于问答</button>}<button className="text-btn" onClick={()=>open(d)}>查看详情</button></div>
    </article>)}</div>
    <p className="capability-note">{task?'这里展示文档入库任务。Agent 执行、工具调用与通用异步任务尚未接入。':'仅展示当前集合的网页上传资料；离线资料仍可在“全部资料”范围内检索。图片、音视频与生成作品管理尚未接入。'}</p>
  </section>;
}
