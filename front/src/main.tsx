import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
// 在首次绘制前恢复主题，避免深色页面先出现浅色控件。
try { document.documentElement.dataset.theme=JSON.parse(localStorage.getItem('jc.preferences.v1')||'{}').theme==='dark'?'dark':'light'; }
catch { document.documentElement.dataset.theme='light'; }
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
