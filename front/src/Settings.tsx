import { BookOpen, Moon, Sun } from 'lucide-react';
import { type Mode } from './api';
import { type usePreferences } from './workbench';

export default function Settings({prefs,legacyCount,importing,importLegacy,summary,openSummary}:{prefs:ReturnType<typeof usePreferences>;legacyCount:number;importing:boolean;importLegacy:()=>void;summary:string|undefined;openSummary:()=>void}){
  return <section className="workspace-page settings-page"><div className="page-heading"><div><p className="section-kicker">把工作台调成你习惯的样子</p><h1>设置</h1><p className="muted">界面偏好仅保存在这台设备。</p></div></div>
    {prefs.error&&<p className="feedback" role="status">{prefs.error}</p>}
    <section className="settings-section"><h2>外观</h2><p className="muted">柔和表面，清晰阅读。</p><div className="theme-options"><button className="soft-btn" aria-pressed={prefs.preferences.theme==='light'} onClick={()=>prefs.update({theme:'light'})}><Sun size={18}/>Warm Light · 浅色</button><button className="soft-btn" aria-pressed={prefs.preferences.theme==='dark'} onClick={()=>prefs.update({theme:'dark'})}><Moon size={18}/>Warm Dark · 深色</button></div></section>
    <section className="settings-section"><h2>模型与对话</h2><label className="setting-field">新对话的默认模式<select value={prefs.preferences.defaultMode} onChange={event=>prefs.update({defaultMode:event.target.value as Mode})}><option value="rag">知识库</option><option value="chat">普通聊天</option></select></label><p className="footnote">模型由服务器配置。当前接口未提供模型信息或切换能力。</p></section>
    <section className="settings-section"><h2>我的记忆</h2><div className="setting-row"><div><h3>当前会话摘要</h3><p className="muted">帮助延续同一会话的话题，不等同于跨会话长期记忆。</p></div><button className="soft-btn" disabled={!summary} onClick={openSummary}><BookOpen size={16}/>查看摘要</button></div>{!summary&&<p className="footnote">当前会话尚无摘要。</p>}<div className="capability-note"><strong>长期记忆 · 未接入</strong><p>暂不支持跨会话记忆、记忆编辑或自动遗忘。</p></div></section>
    <section className="settings-section"><h2>工具与连接</h2><p className="muted">Agent 工具调用与 MCP 连接尚未接入。当前可使用普通聊天、知识库检索及文档入库。</p></section>
    <section className="settings-section"><h2>隐私与数据</h2><p className="muted">会话和上传资料保存在服务器，同一局域网的访问设备共享此空间。问答与入库会将相关文本发送到服务器配置的模型服务。</p>{legacyCount>0?<button className="soft-btn" onClick={importLegacy} disabled={importing}>{importing?'正在导入…':`导入本机旧对话（${legacyCount}）`}</button>:<p className="footnote">没有可导入的本机旧对话。</p>}<p className="footnote">原文件下载、文档删除及全量数据导出尚未接入。单条回答可从对话中导出为 Markdown。</p></section>
    <section className="settings-section"><h2>自动化 · 后续阶段</h2><p className="muted">当前没有自动化调度与运行记录，不提供创建或启停操作。</p></section>
  </section>;
}
