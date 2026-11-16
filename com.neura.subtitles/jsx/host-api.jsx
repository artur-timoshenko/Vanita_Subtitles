/* Native graphic sequence import. No AE, no raster captions. */
var NeuraSubtitles=(function(){
 var version='5.5.0',jobs={},serial=0,stage='idle';
 function fail(s){throw Error(s);}
 function seq(){if(!app.project||!app.project.activeSequence)fail('Open a video sequence and click Reconnect.');return app.project.activeSequence;}
 function info(){var s=seq(),q=s.getSettings(),tracks=[],i;for(i=0;i<s.audioTracks.numTracks;i++)tracks.push({index:i,name:String(s.audioTracks[i].name||''),clips:s.audioTracks[i].clips.numItems});return {audioTracks:tracks,id:String(s.sequenceID),name:s.name,projectPath:app.project.path||'',width:q.videoFrameWidth,height:q.videoFrameHeight,frameSeconds:Number(s.timebase)/254016000000,frameTicks:String(s.timebase),playhead:s.getPlayerPosition().seconds,pixelAspect:String(q.videoPixelAspectRatio),videoDisplayFormat:q.videoDisplayFormat,premiereVersion:String(app.version),panelVersion:version};}
 function project(j){if((app.project.path||'')!==j.projectPath)fail('The project changed. Return to the original project.');}
 function sequence(id){for(var i=0;i<app.project.sequences.numSequences;i++){var s=app.project.sequences[i];if(String(s.sequenceID)===id)return s;}return null;}
 function job(p){var j=jobs[p.id];if(!j)fail('This session expired. Check the Project panel for the imported Neura sequence.');project(j);return j;}
 function folder(p){var f=new Folder(p);if(!f.exists&&!f.create())fail('Cannot create the output folder.');return f;}
 function prepare(p){var s=seq();if(String(s.sequenceID)!==p.sequenceId||(app.project.path||'')!==p.projectPath)fail('The active sequence changed. Reconnect and try again.');var id='neura-'+new Date().getTime()+'-'+(++serial),dir=folder(folder(Folder.userData.fsName+'/Neura_Subtitles').fsName+'/'+id);jobs[id]={id:id,directory:dir.fsName,sequenceId:p.sequenceId,projectPath:p.projectPath,state:'prepared'};return {id:id,directory:dir.fsName};}
 function importNative(p){var j=job(p);if(j.state!=='prepared')fail('Import was already requested. Do not add a duplicate.');var f=new File(j.directory+'/Neura_Subtitles.prproj');if(!f.exists)fail('The generated native project is missing.');if(!p.generatedSequenceId||!p.generatedName)fail('Missing generated sequence identity.');j.generatedId=p.generatedSequenceId;j.name=p.generatedName;j.count=p.count;j.before={};for(var i=0;i<app.project.sequences.numSequences;i++)j.before[String(app.project.sequences[i].sequenceID)]=true;j.state='attempted';stage='import native graphics';if(app.project.importSequences(f.fsName,[j.generatedId])===false)fail('Premiere rejected the native project. This build needs a compatibility fix for your Premiere version. Copy diagnostics.');j.state='locating';return {id:j.id};}
 function poll(p){var j=job(p);if(j.state==='ready'||j.state==='complete')return {ready:true,count:j.count};if(j.state!=='locating')fail('Import is not pending.');var found=[];for(var i=0;i<app.project.sequences.numSequences;i++){var s=app.project.sequences[i];if(!j.before[String(s.sequenceID)]&&s.name===j.name)found.push(s);}if(found.length>1)fail('More than one imported sequence matched. No timeline placement was requested.');if(found.length===1){j.importedId=String(found[0].sequenceID);if(found[0].videoTracks.numTracks!==1||found[0].videoTracks[0].clips.numItems!==j.count)fail('Imported clip count does not match. No overlay was placed.');j.state='ready';return {ready:true,count:j.count};}return {ready:false};}
 function placementTrack(s,item){for(var i=0;i<s.videoTracks.numTracks;i++){var clips=s.videoTracks[i].clips;for(var k=0;k<clips.numItems;k++)if(clips[k].projectItem&&String(clips[k].projectItem.nodeId)===String(item.nodeId))return i+1;}return 0;}
 function restoreAudioLocks(s,locks){var errors=[],i;for(i=0;i<locks.length;i++){try{s.audioTracks[i].setLocked(locks[i]?1:0);if(!!s.audioTracks[i].isLocked()!==locks[i])errors.push('A'+(i+1)+' did not return to its original lock state');}catch(e){errors.push('A'+(i+1)+': '+e.toString());}}return errors.join('; ');}
 function place(p){var j=job(p);if(j.state==='complete')return j.result;if(j.state!=='ready')fail('The imported text sequence is not ready, or placement was already attempted.');var s=sequence(j.sequenceId),generatedSequence=sequence(j.importedId);if(!s||!generatedSequence)fail('The target or subtitle sequence is no longer available.');var item=generatedSequence.projectItem,existing=placementTrack(s,item),top=-1,index=-1,i;if(existing){j.state='complete';j.result={placed:true,alreadyPlaced:true,count:j.count,track:existing,name:j.name};return j.result;}for(i=0;i<s.videoTracks.numTracks;i++)if(s.videoTracks[i].clips.numItems)top=i;for(i=top+1;i<s.videoTracks.numTracks;i++){var t=s.videoTracks[i];if(t.clips.numItems===0&&typeof t.isLocked==='function'&&!t.isLocked()){index=i;break;}}if(index<0)return {placed:false,message:'Text clips are ready. Add an empty video track above your footage (right-click the track header → Add Tracks), then click Add above video.'};
   // Nested-sequence overwrite may include audio. Premiere 2026 can ignore
   // source audio out-points on sequences, so protect the destination tracks.
   var locks=[],restoreError='';
   for(i=0;i<s.audioTracks.numTracks;i++){var a=s.audioTracks[i];if(typeof a.setLocked!=='function'||typeof a.isLocked!=='function')return {placed:false,message:'Text clips are ready. This Premiere version cannot protect audio tracks automatically. Open text clips, then copy the graphic clips to a video track above your footage.'};locks.push(!!a.isLocked());}
   try{
     for(i=0;i<locks.length;i++){s.audioTracks[i].setLocked(1);if(!s.audioTracks[i].isLocked())fail('Could not protect audio track A'+(i+1)+'. No overlay was placed.');}
   }catch(lockError){restoreError=restoreAudioLocks(s,locks);fail(lockError.toString()+(restoreError?' Audio lock restoration also failed: '+restoreError+'.':''));}
   try{
     j.state='placing';app.project.openSequence(j.sequenceId);s.videoTracks[index].overwriteClip(item,'0');
     var clips=s.videoTracks[index].clips;if(clips.numItems!==1||!clips[0].projectItem||String(clips[0].projectItem.nodeId)!==String(item.nodeId)||Number(clips[0].start.seconds)!==0)fail('Placement could not be verified. Check the timeline before trying again.');
   }catch(placeError){restoreError=restoreAudioLocks(s,locks);fail(placeError.toString()+(restoreError?' Audio lock restoration also failed: '+restoreError+'.':''));}
   j.state='complete';j.result={placed:true,alreadyPlaced:false,count:j.count,track:index+1,name:j.name};
   restoreError=restoreAudioLocks(s,locks);if(restoreError)j.result.warning='The subtitle overlay was added, but Premiere could not restore every audio-track lock: '+restoreError+'. Check the audio track lock icons.';
   return j.result;
 }
 function recover(){var target=seq(),best=null,i,s;for(i=0;i<app.project.sequences.numSequences;i++){s=app.project.sequences[i];if(s!==target&&s.name.indexOf('Neura Subtitles ')===0&&s.videoTracks.numTracks===1&&s.videoTracks[0].clips.numItems>0&&(!best||s.name>best.name))best=s;}if(!best)fail('No imported Neura text sequence was found. Use Create & add subtitles.');var id='neura-recover-'+new Date().getTime()+'-'+(++serial),track=placementTrack(target,best.projectItem),count=best.videoTracks[0].clips.numItems,j={id:id,directory:'',sequenceId:String(target.sequenceID),projectPath:app.project.path||'',importedId:String(best.sequenceID),name:best.name,count:count,state:track?'complete':'ready'};if(track)j.result={placed:true,alreadyPlaced:true,count:count,track:track,name:best.name};jobs[id]=j;return {id:id,name:best.name,count:count,alreadyPlaced:!!track,track:track};}
 function openText(){var f=File.openDialog('Open subtitle text (TXT or SRT)','Text and subtitles:*.txt;*.srt');if(!f)return null;if(!/\.(txt|srt)$/i.test(f.name)||f.length>5*1024*1024)fail('Choose a TXT or SRT file under 5 MB.');f.encoding='UTF-8';if(!f.open('r'))fail('Cannot read the file.');try{return {text:f.read(),name:f.name};}finally{f.close();}}
 function saveSrt(p){var f=File.saveDialog('Save subtitles as SRT','SRT:*.srt');if(!f)return null;if(!/\.srt$/i.test(f.name))f=new File(f.fsName+'.srt');if(f.exists&&!confirm('Replace '+f.fsName+'?'))return null;f.encoding='UTF-8';if(!f.open('w'))fail('Cannot save SRT.');try{if(!f.write(p.srt))fail('SRT write failed.');}finally{f.close();}return f.fsName;}
 function selectedSubtitles(){
   var s=seq(),items=[],seen={},target=app.project.path;
   if(!target||!(/\.prproj$/i).test(target))fail('Save the project as a local .prproj first.');
   function scan(q,all){var t,k,tr,c,i,key,nested;
     for(t=0;t<q.videoTracks.numTracks;t++){tr=q.videoTracks[t];for(k=0;k<tr.clips.numItems;k++){c=tr.clips[k];if(!all&&!c.isSelected())continue;
       if(!all&&c.projectItem){nested=null;for(i=0;i<app.project.sequences.numSequences;i++){var cand=app.project.sequences[i];if(/^Neura Subtitles /.test(cand.name)&&cand.projectItem&&String(cand.projectItem.nodeId)===String(c.projectItem.nodeId)){nested=cand;break;}}
       if(nested){scan(nested,true);continue;}}
       if(!/^Subtitle \d+$/.test(c.name)&&!/^Neura Subtitles /.test(q.name))fail('Select only Neura subtitle clips or their overlay.');
       if(tr.isLocked())fail('Unlock the selected subtitle track first.');
       key=String(q.sequenceID)+'/'+t+'/'+c.start.ticks+'/'+c.end.ticks;if(!seen[key]){seen[key]=1;items.push({seq:String(q.sequenceID),track:t,start:String(c.start.ticks),end:String(c.end.ticks)});}
     }}
   }
   scan(s,false);if(!items.length)fail('Select a Neura overlay or individual subtitle clips on the timeline.');
   function diskState(){var f=new File(target);return {size:f.exists?f.length:0,time:f.exists&&f.modified?f.modified.getTime():0};}
   var before=diskState(),rc;
   try{rc=app.project.save();}catch(err){fail('Save failed: '+err.toString()+'. Use Ctrl+Shift+S to save a writable local project, then retry.');}
   var after=diskState();
   if(!after.size||app.project.path!==target)fail('No readable saved project at the original path. Save a local .prproj and try again.');
   if(rc!==0&&rc!=='0'&&rc!==true){
     var unknown=typeof rc==='undefined'||rc===null;
     if(!unknown)fail('Premiere reported save result '+String(rc)+'. Save a writable local copy with Ctrl+Shift+S, then retry.');
     if(after.time===before.time&&after.size===before.size&&!confirm('Premiere did not confirm a new save. Use the last saved version on disk? Unsaved edits will not be in the styled copy. Choose No to save with Ctrl+S first.',true))fail('Cancelled. Save with Ctrl+S before applying the style.');
   }
   return {path:target,items:items};
 }
 // Source media of every enabled clip on one audio track, with where it sits on the timeline.
 function trackMedia(p){
   var s=seq();if(String(s.sequenceID)!==p.id||(app.project.path||'')!==p.projectPath)fail('The active sequence changed. Try again.');
   var t=s.audioTracks[p.track],out=[],i,c,path,speed;if(!t)fail('Audio track A'+(p.track+1)+' does not exist.');
   for(i=0;i<t.clips.numItems;i++){c=t.clips[i];if(c.disabled)continue;
     path=c.projectItem&&typeof c.projectItem.getMediaPath==='function'?String(c.projectItem.getMediaPath()||''):'';
     if(!path)fail('Clip "'+c.name+'" on A'+(p.track+1)+' has no media file (nested sequence or generated audio). Choose the track with the original voice clips.');
     if(typeof c.isSpeedReversed==='function'&&c.isSpeedReversed())fail('Clip "'+c.name+'" on A'+(p.track+1)+' is reversed and cannot be analysed.');
     speed=typeof c.getSpeed==='function'?Number(c.getSpeed()):1;
     out.push({name:c.name,path:path,start:c.start.seconds,end:c.end.seconds,srcIn:c.inPoint.seconds,srcOut:c.outPoint.seconds,speed:speed>0?speed:1});}
   if(!out.length)fail('A'+(p.track+1)+' has no enabled clips.');return out;
 }
 function dispatch(raw){try{var p=JSON.parse(raw),v;stage=p.action;if(p.action==='info')v=info();else if(p.action==='trackMedia')v=trackMedia(p);else if(p.action==='selectedSubtitles')v=selectedSubtitles();else if(p.action==='openStyledCopy'){if(app.project.path!==p.source)fail('Active project changed. Styled copy: '+p.path);if(!app.openDocument(p.path))fail('Open the styled project manually: '+p.path);v=true;}else if(p.action==='prepareNative')v=prepare(p);else if(p.action==='importNative')v=importNative(p);else if(p.action==='pollNative')v=poll(p);else if(p.action==='placeNative')v=place(p);else if(p.action==='recoverLatest')v=recover();else if(p.action==='openText')v=openText();else if(p.action==='saveSrt')v=saveSrt(p);else if(p.action==='openOutput'){var outputJob=job(p);if(!outputJob.directory)fail('This recovered import has no generated-files folder in the current panel session.');v=new Folder(outputJob.directory).execute();}else if(p.action==='openGenerated'){var j=job(p);if(!j.importedId)fail('The text sequence has not imported yet.');v=app.project.openSequence(j.importedId);}else fail('Unknown command: '+p.action);if(typeof v==='undefined')fail('Premiere returned no result for '+p.action+'.');return JSON.stringify({ok:true,value:v});}catch(e){return JSON.stringify({ok:false,error:'['+stage+'] '+e.toString()+(e.line?' (line '+e.line+')':''),stage:stage});}}
 return {version:version,dispatch:dispatch};
})();
