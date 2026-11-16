/* Runs before other panel modules, including before Node initialization. */
(function(){
  var started=false,failed=false,timer;
  function error(message){
    failed=true;var text='Neura 5.5.0 · '+message,s=document.getElementById('status'),q=document.getElementById('sequence');
    if(s){s.textContent=text;s.className='error';}if(q){q.textContent='Startup error — see details below';q.className='error';}
  }
  window.addEventListener('error',function(e){
    if(e.target && e.target.tagName==='SCRIPT')error('SCRIPT_LOAD: '+e.target.src);
    else error('SCRIPT_ERROR: '+e.message+' ('+(e.filename||'')+':'+(e.lineno||0)+')');
  },true);
  window.addEventListener('unhandledrejection',function(e){error('PROMISE_ERROR: '+(e.reason&&e.reason.message||e.reason));});
  window.NeuraBoot={started:function(){started=true;clearTimeout(timer);},error:error};
  timer=setTimeout(function(){if(!started&&!failed)error('START_TIMEOUT: panel JavaScript did not start. Fully close Premiere and reinstall version 5.5.0.');},15000);
})();
