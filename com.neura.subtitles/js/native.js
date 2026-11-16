/* Native Premiere Type-tool graphics. See THIRD_PARTY_NOTICES.txt.
 * Offline generation only: this module never opens or rewrites the user's project.
 */
'use strict';
var fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
var seed=require('../data/native-seed.json');
function uuid(){var b=crypto.randomBytes(16);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=b.toString('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
function copy(x){return JSON.parse(JSON.stringify(x));}
function walk(n,fn){fn(n);n[3].forEach(function(c){walk(c,fn);});}
function child(n,tag){return n[3].filter(function(c){return c[0]===tag;})[0];}
function at(n,p){return p.split('/').reduce(function(a,t){return a&&child(a,t);},n);}
function set(n,p,value){var a=at(n,p);if(!a)throw Error('Native template field missing: '+p);a[2]=String(value);}
function xml(n){function esc(s,attr){var v=String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r/g,'&#13;').replace(/\n/g,'&#10;');return attr?v.replace(/"/g,'&quot;').replace(/\t/g,'&#9;'):v;}var head='<'+n[0]+Object.keys(n[1]).map(function(k){return ' '+k+'="'+esc(n[1][k],true)+'"';}).join('');if(!n[2]&&!n[3].length)return head+'/>';return head+'>'+esc(n[2])+n[3].map(xml).join('')+'</'+n[0]+'>';}

// Seed relocation: insert bytes into a FormattedTextData seed and fix every pointer listed in def.offsets.
function insert(def,at,bytes){
  var b=Buffer.from(def.payload,'base64'),n=bytes.length;
  function move(p){return p>=at?p+n:p;}
  var out=Buffer.concat([b.slice(0,at),bytes,b.slice(at)]);
  var offsets=def.offsets.map(function(o){var p=move(o[0]),t=move(o[2]);if(o[1]==='u32')out.writeUInt32LE(t-p,p);else out.writeInt32LE(p-t,p);return [p,o[1],t];});
  out.writeUInt32LE(out.length-12,0);
  return Object.assign({},def,{payload:out.toString('base64'),offsets:offsets,runsField:move(def.runsField),fontsField:move(def.fontsField),styleStart:move(def.styleStart),textOffset:move(def.textOffset)});
}
// Append scalar fields to a table: bytes go at the table end, each [slot,byteOffset] points into them.
function addFields(def,table,slots,bytes){
  var b=Buffer.from(def.payload,'base64'),vt=table-b.readInt32LE(table),vsize=b.readUInt16LE(vt),tsize=b.readUInt16LE(vt+2),end=table+tsize;
  // 8-byte shifts keep every later 8-byte-aligned value aligned.
  if(end%4||bytes.length%8)throw Error('Native template alignment changed.');
  slots.forEach(function(s){if(4+s[0]*2>=vsize||b.readUInt16LE(vt+4+s[0]*2))throw Error('Native template slot '+s[0]+' is unavailable.');});
  var next=insert(def,end,bytes),nb=Buffer.from(next.payload,'base64'),nvt=vt>=end?vt+bytes.length:vt;
  nb.writeUInt16LE(tsize+bytes.length,nvt+2);slots.forEach(function(s){nb.writeUInt16LE(tsize+s[1],nvt+4+s[0]*2);});
  next.payload=nb.toString('base64');return next;
}
function docTable(def){var b=Buffer.from(def.payload,'base64'),r=12+b.readUInt32LE(12),f=r+b.readUInt16LE(r-b.readInt32LE(r)+4);return f+b.readUInt32LE(f);}
function field(b,t,slot){var v=t-b.readInt32LE(t),o=b.readUInt16LE(v+4+slot*2);if(!o)throw Error('Native template field '+slot+' is missing.');return t+o;}
function patch(def,fn){var b=Buffer.from(def.payload,'base64');fn(b);return Object.assign({},def,{payload:b.toString('base64')});}
function recolor(def,rgb){return patch(def,function(b){var p=field(b,def.styleStart+def.styleTableOffset,2),c=p+b.readUInt32LE(p);rgb.forEach(function(v,i){b[field(b,c,i)]=v;});});}
// shortcut: slot meanings are inferred, not documented by Adobe. Doc slots 4/5 = 2 are what Premiere writes for its own
// centred captions (paragraph centre + bottom); doc slot 6 is Leading (py-premiere sweep). Re-check if Premiere changes FormattedTextData.
// Style slots seen in Premiere: 13 baseline option (2 = Subscript), 14 Faux Bold, 15 Faux Italic, 16 Underline.
// Slot 12 = caps option (1 Small Caps, 2 All Caps), matching py-premiere's all-buttons sweep (12 = 1, 13 = 2).
var MAX_WORDS=3,ALIGN=[[4,0],[5,4]],ALL_CAPS=[[12,0]],LEADING=-5,LINE=105,CAP=53,styles={};  // LINE: DM Serif line at 80 px (~110) + Leading
// Second One highlight = the Default highlight (Italic picked from the font list) in Second One's colour, not Faux Italic.
// Reaction highlight = the Default regular text in #F4D178: colour only, no Italic, no All Caps.
var sources=Object.assign({},seed.styles,{secondAccent:recolor(seed.styles.defaultAccent,[139,58,58]),reactionAccent:recolor(seed.styles.defaultMain,[244,209,120])});
Object.keys(sources).forEach(function(k){
  var d=sources[k];
  if(k==='defaultAccent'||k==='ugcAccent')d=addFields(d,d.styleStart+d.styleTableOffset,ALL_CAPS,Buffer.from([2,0,0,0,0,0,0,0]));
  d=addFields(d,docTable(d),ALIGN,Buffer.from([2,0,0,0,2,0,0,0]));
  styles[k]=patch(d,function(b){b.writeFloatLE(LEADING,field(b,docTable(d),6));});
});
// Every design stores lower case text; Default/UGC highlights show as capitals through Premiere's All Caps button.
function caseOf(text){return text.toLowerCase();}
var PRESETS=['default','second','ugc','reaction'];
function styleKey(preset,highlight){if(highlight&&(preset==='ugc'||preset==='reaction'))return preset+'Accent';return (preset==='second'?'second':'default')+(highlight?'Accent':'Main');}
function payload(runs,preset){
  if(!Array.isArray(runs)||!runs.length)throw Error('Empty native rich text.');
  preset=PRESETS.includes(preset)?preset:'default';
  var merged=[];runs.forEach(function(run){
    if(!run.text||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(run.text))throw Error('Invalid native text.');
    var last=merged[merged.length-1],next={text:caseOf(run.text),highlight:!!run.highlight};
    if(last&&last.highlight===next.highlight)last.text+=next.text;else merged.push(next);
  });
  var baseDef=styles[styleKey(preset,false)],base=Buffer.from(baseDef.payload,'base64'),chunks=[],cursor=base.length;
  function push(b){var at=cursor;chunks.push(b);cursor+=b.length;return at;}
  function align(mod){while(cursor%4!==mod)push(Buffer.alloc(1));}
  function textBuffer(text){var encoded=Buffer.from(text,'utf8'),out=Buffer.alloc(4+Math.ceil((encoded.length+1)/4)*4);out.writeUInt32LE(encoded.length,0);encoded.copy(out,4);return out;}
  // Font list [Regular, Italic]: a style's font index 1 is the real Italic face from Premiere's Font Style menu.
  align(0);var fonts=Buffer.alloc(12),fp=push(fonts);fonts.writeUInt32LE(2,0);
  ['DMSerifDisplay-Regular','DMSerifDisplay-Italic'].forEach(function(name,i){var slot=4+4*i;fonts.writeUInt32LE(push(textBuffer(name))-fp-slot,slot);});
  base.writeUInt32LE(fp-baseDef.fontsField,baseDef.fontsField);
  var vector=Buffer.alloc(4+merged.length*4),vectorPos=push(vector),runObjects=[],runPositions=[],textPositions=[],stylePositions=[];vector.writeUInt32LE(merged.length,0);
  merged.forEach(function(){align(0);push(Buffer.from([8,0,12,0,4,0,8,0]));var object=Buffer.alloc(12),position=push(object);object.writeInt32LE(8,0);runObjects.push(object);runPositions.push(position);});
  merged.forEach(function(run){align(0);textPositions.push(push(textBuffer(run.text)));});
  merged.forEach(function(run){var def=styles[styleKey(preset,run.highlight)],source=Buffer.from(def.payload,'base64');align(def.styleStart%4);var start=push(source.slice(def.styleStart));stylePositions.push(start+def.styleTableOffset);});
  merged.forEach(function(run,i){var slot=vectorPos+4+i*4;vector.writeUInt32LE(runPositions[i]-slot,4+i*4);runObjects[i].writeUInt32LE(textPositions[i]-(runPositions[i]+4),4);runObjects[i].writeUInt32LE(stylePositions[i]-(runPositions[i]+8),8);});
  var rf=baseDef.runsField;base.writeUInt32LE(vectorPos-rf,rf);var appended=Buffer.concat(chunks);base.writeUInt32LE(base.readUInt32LE(0)+appended.length,0);
  return Buffer.concat([base,appended]).toString('base64');
}
function layout(cue,width,height,measure,preset,position){
  var max=width*.90,lines=[[]];
  function line(){return lines[lines.length-1];}
  function widthOf(a){return a.reduce(function(w,r){return w+measure(r.text,r.highlight,preset).width;},0);}
  cue.runs.forEach(function(r){r.text.split(/(\n|[^\S\n]+|[^\s]+)/).filter(Boolean).forEach(function(word){
    if(word==='\n'){lines.push([]);return;}
    var white=/^\s+$/.test(word);if(white&&!line().length)return;
    var candidate=line().concat([{text:word,highlight:r.highlight}]);
    // Wrap when the frame is full or the line already holds MAX_WORDS words.
    if(!white&&line().length&&(widthOf(candidate)>max||line().filter(function(x){return !/^\s+$/.test(x.text);}).length>=MAX_WORDS)){while(line().length&&/^\s+$/.test(line()[line().length-1].text))line().pop();lines.push([]);}
    if(!white&&measure(word,r.highlight,preset).width>max)throw Error('A word is too wide at font size 80: '+word.slice(0,40)+'. Add a line break or shorten it.');
    line().push({text:word,highlight:r.highlight});
  });});
  lines=lines.map(function(a){while(a.length&&/^\s+$/.test(a[a.length-1].text))a.pop();var out=[];a.forEach(function(r){var last=out[out.length-1];if(last&&last.highlight===r.highlight)last.text+=r.text;else out.push(copy(r));});return out;});
  while(lines.length&&!lines[lines.length-1].length)lines.pop();
  if(!lines.length)throw Error('Empty subtitle.');
  // A baseline is a typographic reference, not the bottom of the visible ink.
  // Measuring descenders per cue makes 'skin' and 'pigmentation' jump vertically.
  // Text is bottom-aligned, so the baseline is the last line's; 'center' centres the block from its cap height.
  var baseline=position==='center'?Math.round(height/2+((lines.length-1)*LINE+CAP)/2):height-300;
  var top=baseline-(lines.length-1)*LINE-90;
  if(top<height*.04)throw Error('Subtitle has too many lines at size 80. Split it with a blank line.');
  var result=[];
  function add(text,highlight){var last=result[result.length-1];if(last&&last.highlight===highlight)last.text+=text;else result.push({text:text,highlight:highlight});}
  // Premiere's text engine breaks lines on CR (its own templates store \r); LF does not start a new line.
  lines.forEach(function(a,i){if(i)add('\r',false);a.forEach(function(r){add(r.text,!!r.highlight);});});
  return {runs:result,text:result.map(function(r){return r.text;}).join(''),
    x:0.5,y:baseline/height,anchorX:0,
    anchorY:0,baseline:baseline/height,lineCount:lines.length};
}
function build(cues,sequence,measure,preset,position){
  if(!cues.length||cues.length>1500)throw Error('Use between 1 and 1500 subtitles per batch.');
  preset=PRESETS.includes(preset)?preset:'default';
  if(![1080,1350,1920,2160,3840].includes(Number(sequence.height))||sequence.width<540)throw Error('Unsupported frame size. Use a standard square-pixel HD or UHD sequence.');
  var ft=Number(sequence.frameTicks),endFrame=Math.max.apply(null,cues.map(function(c){return c.endFrame;}));
  if(!Number.isSafeInteger(ft)||ft<=0||!Number.isSafeInteger(endFrame*ft))throw Error('Unsupported frame timing.');
  var end=String(endFrame*ft),root=copy(seed.base),next=1000,uidMap={},all=[];
  function remap(nodes){var ids={},uids={};nodes.forEach(function(n){if(n[1].ObjectID)ids[n[1].ObjectID]=String(++next);if(n[1].ObjectUID)uids[n[1].ObjectUID]=uuid();});nodes.forEach(function(n){walk(n,function(a){['ObjectID','ObjectRef'].forEach(function(k){if(ids[a[1][k]])a[1][k]=ids[a[1][k]];});['ObjectUID','ObjectURef'].forEach(function(k){if(uids[a[1][k]])a[1][k]=uids[a[1][k]];});if(a[1].BinaryHash)a[1].BinaryHash=uuid();if(a[0]==='ClipID')a[2]=uuid();});});return ids;}
  // All sequence/project object identities are new on each click.
  root[3].forEach(function(n){if(n[1].ObjectUID)uidMap[n[1].ObjectUID]=uuid();});
  var name='Neura Subtitles '+new Date().toISOString().replace(/[:.]/g,'-')+' '+uuid().slice(0,6);
  walk(root,function(n){['ObjectUID','ObjectURef'].forEach(function(k){if(uidMap[n[1][k]])n[1][k]=uidMap[n[1][k]];});
    if(n[2]==='NeuraTemplate')n[2]=name;
    if(n[2]==='10160640000')n[2]=String(ft);
    if(n[0]==='FrameRect')n[2]='0,0,'+sequence.width+','+sequence.height;
    if(n[0]==='MZ.Sequence.PreviewFrameSizeWidth')n[2]=String(sequence.width);
    if(n[0]==='MZ.Sequence.PreviewFrameSizeHeight')n[2]=String(sequence.height);
    if(n[0]==='MZ.WorkOutPoint'||n[0]==='OriginalDuration')n[2]=end;
    if(n[0]==='MZ.Project.GUID')n[2]=uuid();
    if(n[0]==='ClipID')n[2]=uuid();
    if(n[0]==='MZ.Sequence.VideoTimeDisplayFormat')n[2]=String(sequence.videoDisplayFormat||101);
  });
  var seq=root[3].filter(function(n){return n[0]==='Sequence'&&n[1].ObjectUID;})[0];
  var track=root[3].filter(function(n){return n[0]==='VideoClipTrack';})[0];
  var refs=['TrackItems',{Version:'1'},'',[]];at(track,'ClipTrack/ClipItems')[3].unshift(refs);
  cues.forEach(function(cue,index){
    if(!Number.isSafeInteger(cue.startFrame)||!Number.isSafeInteger(cue.endFrame)||cue.endFrame<=cue.startFrame)throw Error('Invalid cue frame range.');
    if(cue.startFrame<0||index&&cue.startFrame<cues[index-1].endFrame)throw Error('Subtitle timings overlap or start before zero.');
    var part=layout(cue,sequence.width,sequence.height,measure,preset,position),nodes=copy(seed.graph),ids=remap(nodes),chain=nodes.filter(function(n){return n[0]==='VideoComponentChain';})[0];
    var clip=nodes.filter(function(n){return n[0]==='VideoClipTrackItem';})[0],duration=(cue.endFrame-cue.startFrame)*ft;
    var ti=at(clip,'ClipTrackItem/TrackItem');ti[3]=[['Start',{},String(cue.startFrame*ft),[]],['End',{},String(cue.endFrame*ft),[]]];
    nodes.forEach(function(n){walk(n,function(a){if(a[0]==='FrameRate'||a[0]==='MediaFrameRate')a[2]=String(ft);if(a[0]==='FrameRect')a[2]='0,0,'+sequence.width+','+sequence.height;if(['Name','ClipName','Title'].includes(a[0]))a[2]='Subtitle '+(index+1);});if(n[0]==='VideoClip'){var ip=at(n,'Clip/InPoint');set(n,'Clip/OutPoint',BigInt(ip[2])+BigInt(duration));}});
    var comps=at(chain,'ComponentChain/Components');comps[3]=[];
    var layers=copy(seed.layer),map=remap(layers),comp=layers.filter(function(n){return n[0]==='VideoFilterComponent';})[0];
    if(!comp)throw Error('Missing text component.');
    set(comp,'Component/ID',4);set(comp,'Component/InstanceName','Subtitle '+(index+1));
    layers.forEach(function(n){var pname=at(n,'Name');if(pname&&pname[2]==='Source Text')set(n,'StartKeyframeValue',payload(part.runs,preset));if(pname&&pname[2]==='Position')set(n,'StartKeyframe','-91445760000000000,'+part.x+':'+part.y+',0,0,0,0,0,0,5,4,0,0,0,0');if(pname&&pname[2]==='Anchor Point')set(n,'StartKeyframe','-91445760000000000,'+part.anchorX+':'+part.anchorY+',0,0,0,0,0,0,5,4,0,0,0,0');});
    comps[3].push(['Component',{Index:'0',ObjectRef:map[seed.componentId]},'',[]]);all=all.concat(layers);
    refs[3].push(['TrackItem',{Index:String(index),ObjectRef:ids[seed.clipId]},'',[]]);all=all.concat(nodes);
  });
  root[3]=root[3].concat(all);
  walk(root,function(n){if(n[0]==='NextID')n[2]=String(Math.max(1000001,next+1));});
  var output='<?xml version="1.0" encoding="UTF-8" ?>\n'+xml(root)+'\n\n';
  return {xml:output,gzip:zlib.gzipSync(Buffer.from(output,'utf8')),sequenceId:seq[1].ObjectUID,name:name,count:cues.length,preset:preset};
}
function write(folder,result,session,srt){
  var target=path.join(folder,'Neura_Subtitles.prproj');
  fs.writeFileSync(target,result.gzip,{flag:'wx'});
  if(!zlib.gunzipSync(fs.readFileSync(target)).equals(Buffer.from(result.xml,'utf8')))throw Error('Project verification failed.');
  fs.writeFileSync(path.join(folder,'session.json'),JSON.stringify(session,null,2),{flag:'wx'});
  fs.writeFileSync(path.join(folder,'Neura_Subtitles.srt'),srt,{flag:'wx'});
  return target;
}
module.exports={analyzeAudio:require("./audio"),restyle:require("./restyle").makeCopy,build:build,write:write,layout:layout,payload:payload};
