/* CEP bridge. Host code is self-contained; no first-load $.fileName dependency. */
(function(root){
  'use strict';
  var ready=false,connecting=null,pending=false;
  function literal(value){return JSON.stringify(value).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
  function evaluate(script,timeout){return new Promise(function(resolve,reject){
    var cep=root.__adobe_cep__;
    if(!cep || typeof cep.evalScript!=='function')return reject(Error('CEP_BRIDGE: open the panel inside Premiere via Window → Extensions.'));
    var finished=false,timer=setTimeout(function(){finished=true;reject(Error('CEP_TIMEOUT: Premiere did not respond within '+Math.round(timeout/1000)+' s. Close Premiere dialogs, open a sequence and click Reconnect.'));},timeout);
    try{cep.evalScript(script,function(value){if(finished)return;finished=true;clearTimeout(timer);resolve(value);});}
    catch(e){if(finished)return;finished=true;clearTimeout(timer);reject(Error('CEP_CALL: '+e.message));}
  });}
  function hostPath(){
    var cep=root.__adobe_cep__;
    if(!cep || typeof cep.getSystemPath!=='function')throw Error('CEP_PATH: Premiere did not provide the extension path.');
    var p=cep.getSystemPath('extension');
    if(!p)throw Error('CEP_PATH: the extension path is empty.');
    try{p=decodeURI(p);}catch(e){/* A literal percent is valid in a filesystem path. */}
    p=p.replace(/^file:\/\//i,'').replace(/\\/g,'/');
    if(/^\/[A-Za-z]:\//.test(p))p=p.slice(1);
    return p.replace(/\/$/,'')+'/jsx/host.jsx';
  }
  function connect(){
    if(ready)return Promise.resolve();
    if(connecting)return connecting;
    var script;
    try{
      // No JSON dependency in this handshake: it also reports failed host loading.
      script='(function(){try{if(typeof NeuraSubtitles==="undefined" || NeuraSubtitles.version!=="5.5.0") {'+
        'var f=new File('+literal(hostPath())+');if(!f.exists)return "LOAD_ERROR: host.jsx not found: "+f.fsName;$.evalFile(f);}' +
        'if(typeof NeuraSubtitles==="undefined")return "LOAD_ERROR: host API missing";return "NEURA_READY_"+NeuraSubtitles.version;' +
        '}catch(e){return "LOAD_ERROR: "+e.toString()+" (line "+e.line+")";}})()';
    }catch(e){return Promise.reject(e);}
    connecting=evaluate(script,12000).then(function(result){
      if(result!=='NEURA_READY_5.5.0')throw Error('CEP_INIT: '+result);
      ready=true;
    });
    // Reset failures so Refresh can retry. Never retry timeline mutations.
    connecting=connecting.then(function(){connecting=null;},function(e){connecting=null;ready=false;throw e;});
    return connecting;
  }
  async function call(payload){
    await connect();
    if(pending)throw Error('CEP_BUSY: a previous Premiere operation is still unconfirmed. Check the timeline before restarting the panel.');
    var isInsert=payload.action==='selectedSubtitles'||payload.action==='openStyledCopy'||payload.action==='prepareNative'||payload.action==='importNative'||payload.action==='placeNative';
    if(isInsert)pending=true;
    try{
      var result=await evaluate('NeuraSubtitles.dispatch('+literal(JSON.stringify(payload))+')',isInsert?180000:payload.action==='openText'||payload.action==='saveSrt'?600000:12000);
      if(isInsert)pending=false;
      var r;try{r=JSON.parse(result);}catch(e){ready=false;throw Error('CEP_RESPONSE: '+String(result).slice(0,600));}
      if(!r.ok)throw Error(r.error||'Unknown Premiere error.');return r.value;
    }catch(e){
      if(isInsert && e.message.indexOf('CEP_TIMEOUT')===0)throw Error('CEP_TIMEOUT: the timeline operation is unconfirmed. Do not repeat it yet; check the track and wait for Premiere to finish.');
      if(isInsert)pending=false;throw e;
    }
  }
  root.NeuraBridge={call:call,connect:connect,reset:function(){if(pending)throw Error('The timeline operation is still unconfirmed. Check the timeline before restarting the panel.');ready=false;connecting=null;}};
})(window);
