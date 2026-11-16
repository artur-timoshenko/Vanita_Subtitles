'use strict';
const fs=require('fs'), path=require('path'), z=require('zlib'), crypto=require('crypto');
const colors={'237,231,218':false,'43,31,26':false,'244,209,120':true,'232,185,157':true,'139,58,58':true};
function runs(encoded){
 const b=Buffer.from(encoded,'base64'),ptr=i=>i+b.readUInt32LE(i);
 function field(t,n){const v=t-b.readInt32LE(t),s=4+2*n;if(s>=b.readUInt16LE(v)||!b.readUInt16LE(v+s))throw Error('Unsupported text formatting.');return t+b.readUInt16LE(v+s);}
 const vec=ptr(field(ptr(field(ptr(12),0)),0)),n=b.readUInt32LE(vec),out=[];
 if(!n||n>8192)throw Error('Unsupported text range count.');
 for(let i=0;i<n;i++){const t=ptr(vec+4+4*i),p=ptr(field(t,0)),len=b.readUInt32LE(p),c=ptr(field(ptr(field(t,1)),2)),rgb=[0,1,2].map(j=>b[field(c,j)]).join(',');
 if(p+4+len>b.length||!(rgb in colors))throw Error('Unknown text style. Select only Neura subtitles with their preset colors.');
 if(len)out.push({text:b.toString('utf8',p+4,p+4+len),highlight:colors[rgb]});}return out;
}
function makeCopy(selection,preset,parse){
 const input=selection.path,raw=fs.readFileSync(input),xml=z.gunzipSync(raw,{maxOutputLength:256*1024*1024}).toString('utf8'),doc=parse(xml),ids=new Map(),uids=new Map(),refs=new Map();
 if(doc.getElementsByTagName('parsererror').length)throw Error('Cannot read this project format.');
 const attr=(n,k)=>n&&n.getAttribute(k),kids=(n,k)=>Array.from(n?n.children:[]).filter(x=>x.tagName===k),at=(n,p)=>p.split('/').reduce((a,k)=>kids(a,k)[0],n),val=(n,p)=>{const a=at(n,p);return a?a.textContent:'';};
 for(const e of Array.from(doc.documentElement.children)){if(attr(e,'ObjectID'))ids.set(attr(e,'ObjectID'),e);if(attr(e,'ObjectUID'))uids.set(attr(e,'ObjectUID').toLowerCase(),e);}
 for(const e of Array.from(doc.querySelectorAll('[ObjectRef]'))){const k=attr(e,'ObjectRef');refs.set(k,(refs.get(k)||0)+1);}
 function resolve(n,unique){const k=attr(n,'ObjectRef');if(unique&&refs.get(k)!==1)throw Error('Shared graphic data: no style was changed.');return ids.get(k);}
 const hashes=new Map();for(const m of xml.matchAll(/\bBinaryHash="([^"]+)"/g))hashes.set(m[1],(hashes.get(m[1])||0)+1);
 const patches=new Map();
 for(const item of selection.items){
 const seq=uids.get(item.seq.toLowerCase()),group=kids(at(seq,'TrackGroups'),'TrackGroup').map(x=>resolve(at(x,'Second'))).find(x=>x&&x.tagName==='VideoTrackGroup');
 const trackRef=kids(at(group,'TrackGroup/Tracks'),'Track').find(x=>Number(attr(x,'Index'))===item.track),track=uids.get((attr(trackRef,'ObjectURef')||'').toLowerCase());
 const matches=kids(at(track,'ClipTrack/ClipItems/TrackItems'),'TrackItem').map(x=>resolve(x)).filter(x=>x&&x.tagName==='VideoClipTrackItem'&&(val(x,'ClipTrackItem/TrackItem/Start')||'0')===item.start&&val(x,'ClipTrackItem/TrackItem/End')===item.end);
 if(matches.length!==1)throw Error('Selection no longer matches the saved timeline. Nothing was changed.');
 const chain=resolve(at(matches[0],'ClipTrackItem/ComponentOwner/Components'),true),components=kids(at(chain,'ComponentChain/Components'),'Component');
 const texts=components.filter(x=>val(resolve(x),'MatchName')==='AE.ADBE Text');
 if(texts.length!==1)throw Error('Select single-layer Neura text clips only.');
 const comp=resolve(texts[0],true),params=kids(at(comp,'Component/Params'),'Param').filter(x=>val(resolve(x),'Name')==='Source Text');
 if(params.length!==1)throw Error('Unsupported Source Text parameter.');
 const param=resolve(params[0],true),id=attr(param,'ObjectID'),before=val(param,'StartKeyframeValue').replace(/\s/g,'');
 if(param.tagName!=='ArbVideoComponentParam'||!/^\d+$/.test(id)||Array.from(param.children).some(x=>/keyframe/i.test(x.tagName)&&!/^StartKeyframe(Position|Value)$/.test(x.tagName)&&x.textContent.trim()&&!/^false$|^0$/.test(x.textContent.trim())))throw Error('Animated or unsupported Source Text: no changes made.');
 if(!before||hashes.get(attr(at(param,'StartKeyframeValue'),'BinaryHash'))>1)throw Error('Linked or shared Source Text: no changes made.');
 patches.set(id,{before,after:require('./native').payload(runs(before),preset)});
 }
 if(!patches.size)throw Error('Select subtitle clips first.');
 let changed=0;
 const result=xml.replace(/<ArbVideoComponentParam\b([^>]*\bObjectID="(\d+)"[^>]*)>[\s\S]*?<\/ArbVideoComponentParam>/g,(block,attrs,id)=>{
 const p=patches.get(id);if(!p)return block;
 return block.replace(/(<StartKeyframeValue\b[^>]*>)([\s\S]*?)(<\/StartKeyframeValue>)/,(all,open,old,close)=>{if(old.replace(/\s/g,'')!==p.before)throw Error('Source Text changed.');changed++;return open.replace(/BinaryHash="[^"]+"/,'BinaryHash="'+guid()+'"')+p.after+close;});});
 if(changed!==patches.size)throw Error('Could not verify every selected clip.');
 const out=path.join(path.dirname(input),path.basename(input,path.extname(input))+' - '+preset+' '+guid().slice(0,8)+'.prproj');
 fs.writeFileSync(out,z.gzipSync(Buffer.from(result)),{flag:'wx'});return {path:out,count:changed};
}
function guid(){const h=crypto.randomBytes(16).toString('hex');return [h.slice(0,8),h.slice(8,12),'4'+h.slice(13,16),'a'+h.slice(17,20),h.slice(20)].join('-');}
module.exports={makeCopy,runs};
