(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NeuraCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var DEFAULTS = {fontSize:80,mainColor:'#EDE7DA',accentColor:'#F4D178',bottom:300,
    opacity:85,angle:135,distance:13,spread:8,blur:75,lineHeight:1.2,margin:60,duration:3};
  function time(s) {
    s = s.trim().replace(',', '.');
    if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(s)) throw Error('Invalid timing: '+s);
    var p=s.split(':').map(Number);
    if (p.length>1 && p[p.length-1]>=60 || p.length===3 && p[1]>=60) throw Error('Seconds/minutes must be less than 60: '+s);
    return p.reduce(function(a,b){return a*60+b;},0);
  }
  function range(s) {
    var parts=s.trim().split(/\s*(?:-->|→|–|—|-)\s*/);
    if(parts.length>2) throw Error('Invalid range: '+s);
    return {start:time(parts[0]),end:parts.length===2?time(parts[1]):null};
  }
  function runs(text) {
    var out=[],buf='',active=false;
    // Source case is kept here; native.js stores lower case and turns on All Caps for highlights at render time.
    function flush(){if(buf){out.push({text:buf,highlight:active});buf='';}}
    for(var i=0;i<text.length;i++) {
      var c=text[i];
      if(c==='['){if(active)throw Error('Nested square brackets are not supported.');flush();active=true;}
      else if(c===']'){if(!active)throw Error('Closing ] without an opening [.');flush();active=false;}
      else buf+=c;
    }
    if(active)throw Error('Missing closing square bracket ].');
    flush();return out;
  }
  var punctuation;
  try { punctuation=new RegExp('\\p{P}','gu'); }
  catch(e) { punctuation=/[!"#%&'()*+,\-./:;<=>?@\\^_`{|}~\u00a1\u00ab\u00b7\u00bb\u00bf\u2000-\u206f\u3001-\u303f]/g; }
  function stripPunctuation(text){
    return text.replace(/[\-\u2010-\u2015/\\]/g,' ').replace(punctuation,'').replace(/[\t ]+/g,' ');
  }
  function prepareText(text,removePunctuation){
    var segments=runs(text.replace(/\r\n?/g,'\n'));
    if(removePunctuation!==false)segments=segments.map(function(r){return {text:stripPunctuation(r.text),highlight:r.highlight};});
    segments=segments.filter(function(r){return r.text.length;});
    var plain=segments.map(function(r){return r.text;}).join('');
    if(!plain.trim())throw Error('The subtitle is empty after punctuation removal.');
    return {runs:segments,text:plain,markedText:segments.map(function(r){return r.highlight?'['+r.text+']':r.text;}).join('')};
  }
  function parse(input, options) {
    var opt=Object.assign({duration:3,offset:0,frameSeconds:1/30,removePunctuation:true},options||{});
    if(!(opt.duration>0)||!(opt.frameSeconds>0)||!isFinite(opt.offset))throw Error('Invalid timing settings.');
    var source=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
    if(!source)throw Error('Paste subtitle text.');
    var blocks=source.split(/\n[\t ]*\n+/), warnings=[],cursor=0;
    var parsed=blocks.map(function(block,index){
      var timing=null, tags=[];
      // SRT also works. Number lines are removed only when followed by a time range.
      block=block.replace(/^\d+\s*\n(?=\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->)/,'');
      var srt=block.match(/^([\d:,.]+\s*-->\s*[\d:,.]+)\s*\n/);
      if(srt){timing=range(srt[1]);block=block.slice(srt[0].length);}
      block=block.replace(/\(([^()]+)\)/g,function(full,inside){
        if(!/^\s*\d+(?::\d{1,2}){0,2}(?:[.,]\d{1,3})?(?:\s*(?:-->|→|–|—|-)\s*\d+(?::\d{1,2}){0,2}(?:[.,]\d{1,3})?)?\s*$/.test(inside))return full;
        tags.push(range(inside));return '';
      });
      if(tags.length){
        if(timing || tags.length>2 || tags.length===2 && (tags[0].end!==null || tags[1].end!==null))throw Error('Subtitle '+(index+1)+': use one range or two timestamps (start and end).');
        timing=tags[0];if(tags.length===2)timing.end=tags[1].start;
      }
      var body=block.split('\n').map(function(x){return x.trim();}).filter(Boolean).join('\n');
      if(!body)throw Error('Subtitle '+(index+1)+' is empty.');
      // A colon-bearing parenthesis is probably a malformed time, not prose.
      if(/\(\s*\d+:[^)]*\)/.test(body))throw Error('Subtitle '+(index+1)+': check the timing format.');
      var prepared=prepareText(body,opt.removePunctuation);
      return {id:index+1,source:body,runs:prepared.runs,markedText:prepared.markedText,timing:timing};
    });
    var cues=parsed.map(function(c,index){
      var next=parsed[index+1],start=c.timing?c.timing.start:cursor,end;
      if(c.timing && c.timing.end!==null)end=c.timing.end;
      else if(next && next.timing)end=next.timing.start;
      else end=start+opt.duration;
      if(!c.timing)warnings.push('№'+c.id+': timing is estimated.');
      else if(c.timing.end===null && !(next && next.timing))warnings.push('№'+c.id+': end = start + '+opt.duration+' s.');
      if(!(end>start))throw Error('Subtitle '+c.id+': end must be later than start.');
      if(start<cursor-0.000001)throw Error('Subtitle '+c.id+': timings overlap or are out of order.');
      cursor=end;
      var sf=Math.round((start+opt.offset)/opt.frameSeconds),ef=Math.round((end+opt.offset)/opt.frameSeconds);
      if(sf<0 || ef<=sf)throw Error('Subtitle '+c.id+': duration is shorter than one frame after rounding, or time is negative.');
      return Object.assign(c,{start:sf*opt.frameSeconds,end:ef*opt.frameSeconds,startFrame:sf,endFrame:ef});
    });
    return {cues:cues,warnings:warnings};
  }
  function stamp(seconds) {
    var ms=Math.round(seconds*1000),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;
    function pad(v,n){return String(v).padStart(n,'0');}
    return pad(h,2)+':'+pad(m,2)+':'+pad(s,2)+','+pad(ms%1000,3);
  }
  function srt(cues){return cues.map(function(c,i){return (i+1)+'\n'+stamp(c.start)+' --> '+stamp(c.end)+'\n'+c.runs.map(function(r){return r.text;}).join('');}).join('\n\n')+'\n';}
  return {defaults:DEFAULTS,parse:parse,runs:runs,time:time,srt:srt,prepareText:prepareText,stripPunctuation:stripPunctuation};
});
