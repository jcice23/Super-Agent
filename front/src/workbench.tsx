import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, Clock3, LoaderCircle, X } from 'lucide-react';
import { type Mode, type DocumentStatus } from './api';
import { documentLabels } from './useDocuments';

export type Route='chat'|'tasks'|'library'|'settings';
export const pageTitles:Record<Route,string>={chat:'AI 对话',tasks:'任务中心',library:'文件与作品库',settings:'设置'};
function readRoute():Route {
  const route=window.location.hash.slice(2);
  return route==='tasks'||route==='library'||route==='settings'?route:'chat';
}
export function useRoute(){
  const [route,setRoute]=useState(readRoute);
  useEffect(()=>{const change=()=>setRoute(readRoute());window.addEventListener('hashchange',change);return ()=>window.removeEventListener('hashchange',change);},[]);
  const navigate=(next:Route)=>{window.location.hash=`/${next}`;setRoute(next);};
  return {route,navigate};
}
type Preferences={theme:'light'|'dark';defaultMode:Mode;collapsed:boolean};
export function usePreferences(){
  const [preferences,setPreferences]=useState<Preferences>(()=>{
    try {const p=JSON.parse(localStorage.getItem('jc.preferences.v1')||'{}');return {theme:p.theme==='dark'?'dark':'light',defaultMode:p.defaultMode==='chat'?'chat':'rag',collapsed:p.collapsed===true};}
    catch{return {theme:'light',defaultMode:'rag',collapsed:false};}
  });
  const [error,setError]=useState('');
  useEffect(()=>{
    document.documentElement.dataset.theme=preferences.theme;
    try{localStorage.setItem('jc.preferences.v1',JSON.stringify(preferences));setError('');}
    catch{setError('本机偏好无法保存，本次会话仍可使用。');}
  },[preferences]);
  return {preferences,update:(next:Partial<Preferences>)=>setPreferences(prev=>({...prev,...next})),error};
}

export function Dialog({title,children,close,kind='drawer'}:{title:string;children:ReactNode;close:()=>void;kind?:'drawer'|'confirm'|'search'}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const trigger=document.activeElement as HTMLElement|null;
    const dialog=ref.current!;dialog.showModal();
    return ()=>{dialog.close();if(trigger?.isConnected)trigger.focus();};
  },[]);
  return <dialog ref={ref} className={`dialog ${kind}`} aria-label={title} onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
    <header className="panel-header"><h2>{title}</h2><button className="icon-btn" aria-label="关闭面板" onClick={close}><X size={18}/></button></header>
    <div className="panel-body">{children}</div>
  </dialog>;
}
export function ContextPanel({title,children,close}:{title:string;children:ReactNode;close:()=>void}){
  const [wide,setWide]=useState(()=>window.matchMedia?.('(min-width: 1280px)').matches??false);
  const ref=useRef<HTMLElement>(null);
  useEffect(()=>{
    const media=window.matchMedia?.('(min-width: 1280px)');if(!media)return;
    const change=()=>setWide(media.matches);media.addEventListener('change',change);return ()=>media.removeEventListener('change',change);
  },[]);
  useEffect(()=>{
    if(!wide)return;
    const trigger=document.activeElement as HTMLElement|null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return ()=>{if(trigger?.isConnected)trigger.focus();};
  },[wide]);
  if(!wide)return <Dialog title={title} close={close}>{children}</Dialog>;
  return <aside ref={ref} className="context-panel" aria-label={title} onKeyDown={event=>{if(event.key==='Escape')close();}}>
    <header className="panel-header"><h2>{title}</h2><button className="icon-btn" aria-label="关闭面板" onClick={close}><X size={18}/></button></header><div className="panel-body">{children}</div>
  </aside>;
}
export function useConfirmation(){
  const [message,setMessage]=useState('');
  const resolve=useRef<((answer:boolean)=>void)|null>(null);
  useEffect(()=>()=>{resolve.current?.(false);},[]);
  const finish=(answer:boolean)=>{resolve.current?.(answer);resolve.current=null;setMessage('');};
  return {confirm:(text:string)=>new Promise<boolean>(done=>{resolve.current?.(false);resolve.current=done;setMessage(text);}),element:message?<Dialog title="确认操作" kind="confirm" close={()=>finish(false)}><p>{message}</p><div className="dialog-actions"><button className="soft-btn" onClick={()=>finish(false)}>取消</button><button className="primary-btn" onClick={()=>finish(true)}>确认</button></div></Dialog>:null};
}
export function StatusBadge({status}:{status:DocumentStatus}){
  const Icon=status==='ready'?Check:status==='failed'?AlertCircle:status==='processing'?LoaderCircle:Clock3;
  return <span className={`status-badge ${status}`}><Icon size={13} className={status==='processing'?'spin':''}/>{documentLabels[status]}</span>;
}
export function EmptyState({title,children}:{title:string;children?:ReactNode}){
  return <div className="empty-state"><div className="empty-mark">✳</div><h3>{title}</h3>{children&&<div className="muted">{children}</div>}</div>;
}
export function formatDate(value:number){return Number.isFinite(value)?new Date(value*1000).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'暂无记录';}
export function fileType(name:string){return name.split('.').pop()?.toUpperCase()||'文档';}
export function fileSize(bytes:number){return Number.isFinite(bytes)?bytes<1024?`${bytes} B`:bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`:'暂无记录';}
