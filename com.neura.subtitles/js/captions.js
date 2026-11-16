/* Geometry and pixel-aspect validation retained from the native-caption build. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.NeuraCaptions=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function escape(value){return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
  function number(v){return String(Math.round(v*1000000)/1000000);}
  // Adobe can expose PAR as a scalar or a numerator:denominator string.
  // Do not infer pixel shape from the frame's width/height or coerce unknowns to 1.
  function pixelAspect(value){
    if(typeof value==='number')return Number.isFinite(value)&&value>0?value:null;
    if(typeof value!=='string')return null;
    var text=value.trim(),scalar=/^(?:\d+(?:\.\d*)?|\.\d+)$/;
    var pair=text.match(/^(\d+(?:\.\d+)?)\s*[:/,]\s*(\d+(?:\.\d+)?)$/);
    var ratio=pair?Number(pair[1])/Number(pair[2]):scalar.test(text)?Number(text):NaN;
    return Number.isFinite(ratio)&&ratio>0?ratio:null;
  }
  function requireSquarePixels(value){
    var ratio=pixelAspect(value);
    if(ratio===null)throw Error('Could not read the sequence pixel aspect ratio: '+String(value)+'. Copy diagnostics; do not change your sequence settings.');
    if(Math.abs(ratio-1)>0.000001)throw Error('This preset supports Square Pixels (1.0). Premiere reports '+String(value)+'.');
    return ratio;
  }
  function generate(cues,style,width,height){
    if(!Array.isArray(cues)||!cues.length)throw Error('Paste at least one subtitle.');
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid sequence size.');
    if(!Number.isFinite(style.fontSize)||style.fontSize<12||style.fontSize>300)throw Error('Font size must be between 12 and 300.');
    if(!Number.isFinite(style.bottom)||style.bottom<0||style.bottom>=height-style.fontSize)throw Error('Bottom offset leaves no room for the text.');
    if(!Number.isFinite(style.lineHeight)||style.lineHeight<0.8||style.lineHeight>3)throw Error('Invalid line spacing.');
    if(!Number.isFinite(style.margin)||style.margin<0||style.margin*2>=width)throw Error('Side margins leave no room for the text.');
    if(!/^#[0-9a-f]{6}$/i.test(style.mainColor)||!/^#[0-9a-f]{6}$/i.test(style.accentColor))throw Error('Invalid text color.');
    var previous=0,paragraphs=cues.map(function(c,i){
      if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||c.start<previous-0.000001)throw Error('Invalid timing in subtitle '+(i+1)+'.');previous=c.end;
      var content=c.runs.map(function(r){return '<span style="'+(r.highlight?'highlight':'normal')+'">'+escape(r.text).replace(/\r\n?|\n/g,'<br/>')+'</span>';}).join('');
      if(!c.runs.map(function(r){return r.text;}).join('').trim())throw Error('Empty subtitle '+(i+1)+'.');
      // Offset times in seconds retain sub-millisecond frame-aligned timing.
      return '<p xml:id="cue'+(i+1)+'" begin="'+number(c.start)+'s" end="'+number(c.end)+'s" region="lower" style="base">'+content+'</p>';
    });
    var xml='<?xml version="1.0" encoding="UTF-8"?>\n'+
      '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" xml:lang="en" xml:space="preserve" ttp:timeBase="media" tts:extent="'+width+'px '+height+'px">\n'+
      '<head><styling>'+ 
      '<style xml:id="base" tts:fontFamily="DM Serif Display" tts:fontSize="'+number(style.fontSize)+'px" tts:fontWeight="normal" tts:fontStyle="normal" tts:color="'+style.mainColor+'" tts:textAlign="center" tts:lineHeight="'+number(style.fontSize*style.lineHeight)+'px" tts:backgroundColor="transparent" tts:wrapOption="wrap"/>'+
      '<style xml:id="normal" tts:color="'+style.mainColor+'" tts:fontStyle="normal"/>'+
      '<style xml:id="highlight" tts:color="'+style.accentColor+'" tts:fontStyle="italic"/>'+
      '</styling><layout><region xml:id="lower" tts:origin="'+number(style.margin)+'px 0px" tts:extent="'+number(width-2*style.margin)+'px '+number(height-style.bottom)+'px" tts:displayAlign="after" tts:padding="0px" tts:backgroundColor="transparent" tts:overflow="visible"/></layout></head>\n'+
      '<body><div>\n'+paragraphs.join('\n')+'\n</div></body></tt>\n';
    return {xml:xml,count:cues.length};
  }
  return {generate:generate,escape:escape,pixelAspect:pixelAspect,requireSquarePixels:requireSquarePixels};
});
