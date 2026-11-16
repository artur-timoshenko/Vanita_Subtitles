'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
function python(){const p=path.join(process.env.LOCALAPPDATA,'Neura_Subtitles','speech-venv','Scripts','python.exe');if(!fs.existsSync(p))throw Error('Run Install_Audio_Timing.cmd from the ZIP once, then try again.');return p;}
// Recognise the source media (mp4, mov, wav…) of the clips on one audio track, mapped to timeline time.
async function analyze(host,seq,cues,notify,track,progress){
 const exe=python();
 notify('Reading clips on A'+(track+1)+'…');
 const clips=await host({action:'trackMedia',id:seq.id,projectPath:seq.projectPath,track:track});
 const missing=clips.find(c=>!fs.existsSync(c.path));
 if(missing)throw Error('Media offline for clip "'+missing.name+'": '+missing.path);
 notify('Listening locally to '+clips.length+' clip(s) on A'+(track+1)+' and matching your subtitle blocks…');
 return await new Promise((ok,no)=>{
  const child=cp.spawn(exe,['-I','-X','utf8',path.join(__dirname,'speech.py')],{windowsHide:true});let stdout='',stderr='',partial='';
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdin.on('error',()=>{});child.on('error',no);child.stdout.on('data',x=>stdout+=x);
  // stderr carries "PROGRESS <0..1> <text>" lines; anything else is kept as the error message.
  child.stderr.on('data',x=>{const lines=(partial+x).split(/\r?\n/);partial=lines.pop();lines.forEach(line=>{const m=/^PROGRESS ([\d.]+) ?(.*)$/.exec(line);if(m){if(progress)progress(Number(m[1]),m[2]);}else stderr=(stderr+line+'\n').slice(-2000);});});
  child.on('close',code=>{stderr+=partial;if(code!==0)return no(Error(stderr.trim()||'Speech recognition failed.'));try{ok(JSON.parse(stdout));}catch(e){no(Error('Invalid recognition result.'));}});
  child.stdin.end(JSON.stringify({blocks:cues.map(c=>c.source),clips:clips}));
 });
}
module.exports=analyze;
