//  json2.js
//  2023-05-10
//  Public Domain.
//  NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

//  USE YOUR OWN COPY. IT IS EXTREMELY UNWISE TO LOAD CODE FROM SERVERS YOU DO
//  NOT CONTROL.

//  This file creates a global JSON object containing two methods: stringify
//  and parse. This file provides the ES5 JSON capability to ES3 systems.
//  If a project might run on IE8 or earlier, then this file should be included.
//  This file does nothing on ES5 systems.

//      JSON.stringify(value, replacer, space)
//          value       any JavaScript value, usually an object or array.
//          replacer    an optional parameter that determines how object
//                      values are stringified for objects. It can be a
//                      function or an array of strings.
//          space       an optional parameter that specifies the indentation
//                      of nested structures. If it is omitted, the text will
//                      be packed without extra whitespace. If it is a number,
//                      it will specify the number of spaces to indent at each
//                      level. If it is a string (such as "\t" or "&nbsp;"),
//                      it contains the characters used to indent at each level.
//          This method produces a JSON text from a JavaScript value.
//          When an object value is found, if the object contains a toJSON
//          method, its toJSON method will be called and the result will be
//          stringified. A toJSON method does not serialize: it returns the
//          value represented by the name/value pair that should be serialized,
//          or undefined if nothing should be serialized. The toJSON method
//          will be passed the key associated with the value, and this will be
//          bound to the value.

//          For example, this would serialize Dates as ISO strings.

//              Date.prototype.toJSON = function (key) {
//                  function f(n) {
//                      // Format integers to have at least two digits.
//                      return (n < 10)
//                          ? "0" + n
//                          : n;
//                  }
//                  return this.getUTCFullYear()   + "-" +
//                       f(this.getUTCMonth() + 1) + "-" +
//                       f(this.getUTCDate())      + "T" +
//                       f(this.getUTCHours())     + ":" +
//                       f(this.getUTCMinutes())   + ":" +
//                       f(this.getUTCSeconds())   + "Z";
//              };

//          You can provide an optional replacer method. It will be passed the
//          key and value of each member, with this bound to the containing
//          object. The value that is returned from your method will be
//          serialized. If your method returns undefined, then the member will
//          be excluded from the serialization.

//          If the replacer parameter is an array of strings, then it will be
//          used to select the members to be serialized. It filters the results
//          such that only members with keys listed in the replacer array are
//          stringified.

//          Values that do not have JSON representations, such as undefined or
//          functions, will not be serialized. Such values in objects will be
//          dropped; in arrays they will be replaced with null. You can use
//          a replacer function to replace those with JSON values.

//          JSON.stringify(undefined) returns undefined.

//          The optional space parameter produces a stringification of the
//          value that is filled with line breaks and indentation to make it
//          easier to read.

//          If the space parameter is a non-empty string, then that string will
//          be used for indentation. If the space parameter is a number, then
//          the indentation will be that many spaces.

//          Example:

//          text = JSON.stringify(["e", {pluribus: "unum"}]);
//          // text is '["e",{"pluribus":"unum"}]'

//          text = JSON.stringify(["e", {pluribus: "unum"}], null, "\t");
//          // text is '[\n\t"e",\n\t{\n\t\t"pluribus": "unum"\n\t}\n]'

//          text = JSON.stringify([new Date()], function (key, value) {
//              return this[key] instanceof Date
//                  ? "Date(" + this[key] + ")"
//                  : value;
//          });
//          // text is '["Date(---current time---)"]'

//      JSON.parse(text, reviver)
//          This method parses a JSON text to produce an object or array.
//          It can throw a SyntaxError exception.

//          The optional reviver parameter is a function that can filter and
//          transform the results. It receives each of the keys and values,
//          and its return value is used instead of the original value.
//          If it returns what it received, then the structure is not modified.
//          If it returns undefined then the member is deleted.

//          Example:

//          // Parse the text. Values that look like ISO date strings will
//          // be converted to Date objects.

//          myData = JSON.parse(text, function (key, value) {
//              var a;
//              if (typeof value === "string") {
//                  a =
//   /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(value);
//                  if (a) {
//                      return new Date(Date.UTC(
//                         +a[1], +a[2] - 1, +a[3], +a[4], +a[5], +a[6]
//                      ));
//                  }
//                  return value;
//              }
//          });

//          myData = JSON.parse(
//              "[\"Date(09/09/2001)\"]",
//              function (key, value) {
//                  var d;
//                  if (
//                      typeof value === "string"
//                      && value.slice(0, 5) === "Date("
//                      && value.slice(-1) === ")"
//                  ) {
//                      d = new Date(value.slice(5, -1));
//                      if (d) {
//                          return d;
//                      }
//                  }
//                  return value;
//              }
//          );

//  This is a reference implementation. You are free to copy, modify, or
//  redistribute.

/*jslint
    eval, for, this
*/

/*property
    JSON, apply, call, charCodeAt, getUTCDate, getUTCFullYear, getUTCHours,
    getUTCMinutes, getUTCMonth, getUTCSeconds, hasOwnProperty, join,
    lastIndex, length, parse, prototype, push, replace, slice, stringify,
    test, toJSON, toString, valueOf
*/


// Create a JSON object only if one does not already exist. We create the
// methods in a closure to avoid creating global variables.

if (typeof JSON !== "object") {
    JSON = {};
}

(function () {
    "use strict";

    var rx_one = /^[\],:{}\s]*$/;
    var rx_two = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g;
    var rx_three = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g;
    var rx_four = /(?:^|:|,)(?:\s*\[)+/g;
    var rx_escapable = /[\\"\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    var rx_dangerous = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

    function f(n) {
        // Format integers to have at least two digits.
        return (n < 10)
            ? "0" + n
            : n;
    }

    function this_value() {
        return this.valueOf();
    }

    if (typeof Date.prototype.toJSON !== "function") {

        Date.prototype.toJSON = function () {

            return isFinite(this.valueOf())
                ? (
                    this.getUTCFullYear()
                    + "-"
                    + f(this.getUTCMonth() + 1)
                    + "-"
                    + f(this.getUTCDate())
                    + "T"
                    + f(this.getUTCHours())
                    + ":"
                    + f(this.getUTCMinutes())
                    + ":"
                    + f(this.getUTCSeconds())
                    + "Z"
                )
                : null;
        };

        Boolean.prototype.toJSON = this_value;
        Number.prototype.toJSON = this_value;
        String.prototype.toJSON = this_value;
    }

    var gap;
    var indent;
    var meta;
    var rep;


    function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

        rx_escapable.lastIndex = 0;
        return rx_escapable.test(string)
            ? "\"" + string.replace(rx_escapable, function (a) {
                var c = meta[a];
                return typeof c === "string"
                    ? c
                    : "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
            }) + "\""
            : "\"" + string + "\"";
    }


    function str(key, holder) {

// Produce a string from holder[key].

        var i;          // The loop counter.
        var k;          // The member key.
        var v;          // The member value.
        var length;
        var mind = gap;
        var partial;
        var value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

        if (
            value
            && typeof value === "object"
            && typeof value.toJSON === "function"
        ) {
            value = value.toJSON(key);
        }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

        if (typeof rep === "function") {
            value = rep.call(holder, key, value);
        }

// What happens next depends on the value's type.

        switch (typeof value) {
        case "string":
            return quote(value);

        case "number":

// JSON numbers must be finite. Encode non-finite numbers as null.

            return (isFinite(value))
                ? String(value)
                : "null";

        case "boolean":
        case "null":

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce "null". The case is included here in
// the remote chance that this gets fixed someday.

            return String(value);

// If the type is "object", we might be dealing with an object or an array or
// null.

        case "object":

// Due to a specification blunder in ECMAScript, typeof null is "object",
// so watch out for that case.

            if (!value) {
                return "null";
            }

// Make an array to hold the partial results of stringifying this object value.

            gap += indent;
            partial = [];

// Is the value an array?

            if (Object.prototype.toString.apply(value) === "[object Array]") {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || "null";
                }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

                v = partial.length === 0
                    ? "[]"
                    : gap
                        ? (
                            "[\n"
                            + gap
                            + partial.join(",\n" + gap)
                            + "\n"
                            + mind
                            + "]"
                        )
                        : "[" + partial.join(",") + "]";
                gap = mind;
                return v;
            }

// If the replacer is an array, use it to select the members to be stringified.

            if (rep && typeof rep === "object") {
                length = rep.length;
                for (i = 0; i < length; i += 1) {
                    if (typeof rep[i] === "string") {
                        k = rep[i];
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (
                                (gap)
                                    ? ": "
                                    : ":"
                            ) + v);
                        }
                    }
                }
            } else {

// Otherwise, iterate through all of the keys in the object.

                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (
                                (gap)
                                    ? ": "
                                    : ":"
                            ) + v);
                        }
                    }
                }
            }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

            v = partial.length === 0
                ? "{}"
                : gap
                    ? "{\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "}"
                    : "{" + partial.join(",") + "}";
            gap = mind;
            return v;
        }
    }

// If the JSON object does not yet have a stringify method, give it one.

    if (typeof JSON.stringify !== "function") {
        meta = {    // table of character substitutions
            "\b": "\\b",
            "\t": "\\t",
            "\n": "\\n",
            "\f": "\\f",
            "\r": "\\r",
            "\"": "\\\"",
            "\\": "\\\\"
        };
        JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

            var i;
            gap = "";
            indent = "";

// If the space parameter is a number, make an indent string containing that
// many spaces.

            if (typeof space === "number") {
                for (i = 0; i < space; i += 1) {
                    indent += " ";
                }

// If the space parameter is a string, it will be used as the indent string.

            } else if (typeof space === "string") {
                indent = space;
            }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

            rep = replacer;
            if (replacer && typeof replacer !== "function" && (
                typeof replacer !== "object"
                || typeof replacer.length !== "number"
            )) {
                throw new Error("JSON.stringify");
            }

// Make a fake root object containing our value under the key of "".
// Return the result of stringifying the value.

            return str("", {"": value});
        };
    }


// If the JSON object does not yet have a parse method, give it one.

    if (typeof JSON.parse !== "function") {
        JSON.parse = function (text, reviver) {

// The parse method takes a text and an optional reviver function, and returns
// a JavaScript value if the text is a valid JSON text.

            var j;

            function walk(holder, key) {

// The walk method is used to recursively walk the resulting structure so
// that modifications can be made.

                var k;
                var v;
                var value = holder[key];
                if (value && typeof value === "object") {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }


// Parsing happens in four stages. In the first stage, we replace certain
// Unicode characters with escape sequences. JavaScript handles many characters
// incorrectly, either silently deleting them, or treating them as line endings.

            text = String(text);
            rx_dangerous.lastIndex = 0;
            if (rx_dangerous.test(text)) {
                text = text.replace(rx_dangerous, function (a) {
                    return (
                        "\\u"
                        + ("0000" + a.charCodeAt(0).toString(16)).slice(-4)
                    );
                });
            }

// In the second stage, we run the text against regular expressions that look
// for non-JSON patterns. We are especially concerned with "()" and "new"
// because they can cause invocation, and "=" because it can cause mutation.
// But just to be safe, we want to reject all unexpected forms.

// We split the second stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace the JSON backslash pairs with "@" (a non-JSON character). Second, we
// replace all simple value tokens with "]" characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or "]" or
// "," or ":" or "{" or "}". If that is so, then the text is safe for eval.

            if (
                rx_one.test(
                    text
                        .replace(rx_two, "@")
                        .replace(rx_three, "]")
                        .replace(rx_four, "")
                )
            ) {

// In the third stage we use the eval function to compile the text into a
// JavaScript structure. The "{" operator is subject to a syntactic ambiguity
// in JavaScript: it can begin a block or an object literal. We wrap the text
// in parens to eliminate the ambiguity.

                j = eval("(" + text + ")");

// In the optional fourth stage, we recursively walk the new structure, passing
// each name/value pair to a reviver function for possible transformation.

                return (typeof reviver === "function")
                    ? walk({"": j}, "")
                    : j;
            }

// If the text is not JSON parseable, then a SyntaxError is thrown.

            throw new SyntaxError("JSON.parse");
        };
    }
}());

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
