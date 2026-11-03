import { useCallback, useEffect, useRef, useState } from 'react';
import { documentsApi, upload, type DocumentRecord, type DocumentStatus } from './api';

export const documentLabels:Record<DocumentStatus,string> = {
  queued:'等待入库', processing:'正在入库', ready:'已入库', failed:'入库失败',
};
const message=(error:unknown)=>error instanceof Error?error.message:'文档服务暂时不可用';

/** 工作台唯一的文档状态源；任务和文件是同一份服务器记录的两个视图。 */
export function useDocuments() {
  const [documents,setDocuments]=useState<DocumentRecord[]>([]);
  const [loaded,setLoaded]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [actionError,setActionError]=useState('');
  const [failures,setFailures]=useState<string[]>([]);
  const [notice,setNotice]=useState('');
  const [workerAvailable,setWorkerAvailable]=useState<boolean|null>(null);
  const [uploading,setUploading]=useState(false);
  const [currentUpload,setCurrentUpload]=useState('');
  const [retrying,setRetrying]=useState<string|null>(null);
  const alive=useRef(true), fetching=useRef(false), uploadBusy=useRef(false), retryBusy=useRef(false);
  const revision=useRef(0);

  const reload=useCallback(async()=>{
    if(fetching.current)return;
    fetching.current=true;
    const version=revision.current;
    try {
      const result=await documentsApi.list();
      if(alive.current&&version===revision.current){
        setDocuments(result.data);setWorkerAvailable(result.worker_available);setLoaded(true);setError('');
      }
    } catch(exc){if(alive.current)setError(message(exc));}
    finally {fetching.current=false;if(alive.current)setLoading(false);}
  },[]);

  useEffect(()=>{
    alive.current=true;
    void reload();
    const timer=setInterval(()=>{if(document.visibilityState!=='hidden')void reload();},2000);
    const focus=()=>void reload();
    window.addEventListener('focus',focus);
    return ()=>{alive.current=false;clearInterval(timer);window.removeEventListener('focus',focus);};
  },[reload]);

  function upsert(record:DocumentRecord){
    revision.current++;
    if(alive.current)setDocuments(prev=>[record,...prev.filter(d=>d.document_id!==record.document_id)]);
  }
  async function uploadFiles(files:FileList|File[]|null){
    if(!files?.length||uploadBusy.current)return;
    uploadBusy.current=true;setUploading(true);setFailures([]);setNotice('');
    let count=0;
    try {
      for(const file of Array.from(files)){
        if(!alive.current)break;
        setCurrentUpload(file.name);
        try {
          if(!/\.(pdf|docx|md|txt)$/i.test(file.name))throw Error('仅支持 PDF、DOCX、Markdown、TXT');
          if(!file.size)throw Error('文件为空');
          const result=await upload(file);upsert(result.data);count++;
        } catch(exc){if(alive.current)setFailures(prev=>[...prev,`${file.name}：${message(exc)}`]);}
      }
      if(count&&alive.current)setNotice(`已上传 ${count} 份文档，已加入入库队列。`);
    } finally {
      uploadBusy.current=false;
      if(alive.current){setUploading(false);setCurrentUpload('');void reload();}
    }
  }
  async function retry(id:string){
    if(retryBusy.current)return;
    retryBusy.current=true;setRetrying(id);setNotice('');setActionError('');
    try {const result=await documentsApi.retry(id);upsert(result.data);if(alive.current)setNotice('已重新加入入库队列。');}
    catch(exc){if(alive.current)setActionError(message(exc));}
    finally {retryBusy.current=false;if(alive.current){setRetrying(null);void reload();}}
  }
  return {documents,loaded,loading,error,actionError,failures,notice,workerAvailable,uploading,currentUpload,retrying,reload,uploadFiles,retry};
}
export type DocumentsState=ReturnType<typeof useDocuments>;
