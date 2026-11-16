import difflib
import json
import re
import sys
import unicodedata

WORD = 0.3      # seconds per unheard word when extrapolating
LEAD = 0.05     # show a subtitle slightly before the first word
TAIL = 0.25     # keep it on screen after the last word
JOIN = 0.6      # close shorter pauses so subtitles do not flicker
MIN_LEN = 0.5   # shortest subtitle on screen
GAP = 1.5       # a longer silence inside one block means a word was matched to the wrong place


def tokens(text):
    return re.findall(r"[^\W_]+", unicodedata.normalize("NFKC", text).casefold().replace("’", "").replace("'", ""), re.UNICODE)


def cluster(hit, links, stamps):
    """Longest run of a block's matched words that sit together in the audio.
    Drops stray links to the same word said much later, which used to stretch one subtitle over the next ones."""
    best, run = [], [hit[0]]
    for prev, j in zip(hit, hit[1:]):
        a, b = links[prev], links[j]
        if b - a <= (j - prev) + 2 and stamps[b][0] - stamps[a][1] <= GAP:
            run.append(j)
        else:
            best, run = max(best, run, key=len), [j]
    return max(best, run, key=len)


def rescue(block_tokens, heard, stamps, lo, hi):
    """Match consecutive unmatched blocks to heard words lo..hi-1 letter by letter ('wurst' ~ 'worst')."""
    out = [None] * len(block_tokens)
    if hi <= lo:
        return out
    text_a, own_a, text_b, own_b = "", [], "", []
    for k, toks in enumerate(block_tokens):
        for t in toks:
            text_a += t + " "
            own_a += [k] * (len(t) + 1)
    for h in range(lo, hi):
        text_b += heard[h] + " "
        own_b += [h] * (len(heard[h]) + 1)
    got = [[] for _ in block_tokens]
    for a, b, n in difflib.SequenceMatcher(None, text_a, text_b, autojunk=False).get_matching_blocks():
        if n >= 3:
            for d in range(n):
                if text_a[a + d] != " ":
                    got[own_a[a + d]].append(own_b[b + d])
    last = lo - 1
    for k, toks in enumerate(block_tokens):
        letters = sum(len(t) for t in toks)
        if got[k] and len(got[k]) >= 0.5 * letters and min(got[k]) > last:
            h0, h1 = min(got[k]), max(got[k])
            out[k], last = [stamps[h0][0], stamps[h1][1], False, h0, h1], h1
    return out


def align(blocks, words):
    """Return [start, end, estimated] per text block, trimmed to the heard words."""
    script, spans, heard, stamps = [], [], [], []
    for text in blocks:
        start = len(script)
        script.extend(tokens(text.replace("[", "").replace("]", "")))
        spans.append((start, len(script)))
    for word, start, end in words:
        for key in tokens(word):
            heard.append(key)
            stamps.append((start, end))
    if not heard:
        raise ValueError("No speech found. Check the dialogue track and mute loud music.")
    if len(script) > 5000 or len(heard) > 8000:
        raise ValueError("Sequence too long. Use a shorter edited sequence.")
    links = {}
    for a, b, n in difflib.SequenceMatcher(None, script, heard, autojunk=False).get_matching_blocks():
        links.update((a + i, b + i) for i in range(n))

    found = []  # per block: [start, end, estimated, first heard index, last heard index] or None
    for a, b in spans:
        hit = [j for j in range(a, b) if j in links]
        run = cluster(hit, links, stamps) if hit else []
        prev = next((f for f in reversed(found) if f), None)
        # A match behind the previous block is a repeated phrase from another take.
        if len(run) < max(1, 0.4 * (b - a)) or (prev and links[run[0]] <= prev[4]):
            found.append(None)
            continue
        h0, h1 = links[run[0]], links[run[-1]]
        start = stamps[h0][0] - (run[0] - a) * WORD
        end = stamps[h1][1] + (b - 1 - run[-1]) * WORD
        found.append([max(0.0, start), end, False, h0, h1])
    if not any(found):
        raise ValueError("Could not match the text to the speech. Check wording against the voiceover. No timings were applied.")

    # Blocks the recogniser misspelled: compare letters, not whole words, inside the gap between matched neighbours.
    i = 0
    while i < len(found):
        if found[i]:
            i += 1
            continue
        j = i
        while j < len(found) and not found[j]:
            j += 1
        lo = found[i - 1][4] + 1 if i else 0
        hi = found[j][3] if j < len(found) else len(heard)
        found[i:j] = rescue([script[a:b] for a, b in spans[i:j]], heard, stamps, lo, hi)
        i = j

    # Spread blocks that are still unmatched between their neighbours by word count.
    first, last = stamps[0][0], stamps[-1][1]
    i = 0
    while i < len(found):
        if found[i]:
            i += 1
            continue
        j = i
        while j < len(found) and not found[j]:
            j += 1
        lo = found[i - 1][1] if i else first
        hi = found[j][0] if j < len(found) else max(last, lo + WORD * sum(max(1, spans[k][1] - spans[k][0]) for k in range(i, j)))
        sizes = [max(1, spans[k][1] - spans[k][0]) for k in range(i, j)]
        step, t = (hi - lo) / sum(sizes), lo
        for k, size in zip(range(i, j), sizes):
            found[k] = [t, t + step * size, True]
            t += step * size
        i = j

    result = [[s, e, bool(rest and rest[0])] for s, e, *rest in found]
    for k, cue in enumerate(result):
        prev_end = result[k - 1][1] if k else 0.0
        nxt = result[k + 1][0] if k + 1 < len(result) else None
        cue[0] = max(prev_end, cue[0] - LEAD)
        end = cue[1] + TAIL
        if nxt is not None:
            end = nxt if nxt - cue[1] < JOIN else min(end, nxt)
        cue[1] = max(end, min(cue[0] + MIN_LEN, nxt if nxt is not None else cue[0] + MIN_LEN))
        if cue[1] - cue[0] < MIN_LEN / 2:  # squeezed by a neighbour: keep it readable and flag it for review
            cue[1], cue[2] = cue[0] + MIN_LEN, True
        cue[0], cue[1] = round(cue[0], 3), round(cue[1], 3)
    return result


def timeline_words(clip, words):
    """Move words timed from the clip's source in-point onto the sequence timeline; drop what the cut hides."""
    speed = clip.get("speed") or 1.0
    out = []
    for word, start, end in words:
        start, end = clip["start"] + start / speed, clip["start"] + end / speed
        if start < clip["end"]:
            out.append((word, start, min(end, clip["end"])))
    return out


def report(fraction, text):
    """Progress line for the panel: PROGRESS <0..1> <text>."""
    print(f"PROGRESS {min(max(fraction, 0.0), 1.0):.3f} {text}", file=sys.stderr, flush=True)


def transcribe_track(model, clips, rate=16000, progress=report):
    from faster_whisper import decode_audio
    audio, words = {}, []
    total = sum(max(0.0, c["srcOut"] - c["srcIn"]) for c in clips) or 1.0
    done = 0.0
    # Model loading takes the first 5 %, recognition the rest, weighted by seconds of used audio.
    for n, clip in enumerate(clips, 1):
        length = max(0.0, clip["srcOut"] - clip["srcIn"])
        label = f"clip {n}/{len(clips)}"
        progress(0.05 + 0.95 * done / total, f"Reading {label}")
        if clip["path"] not in audio:
            try:
                audio[clip["path"]] = decode_audio(clip["path"], sampling_rate=rate)
            except Exception as exc:
                raise ValueError(f"Cannot read audio of clip \"{clip.get('name', '')}\": {clip['path']} ({exc})")
        piece = audio[clip["path"]][int(clip["srcIn"] * rate):int(clip["srcOut"] * rate)]
        if len(piece) >= rate // 10:
            # No script prompt and no carried-over context: both made Whisper skip or invent words near the start.
            segments, _ = model.transcribe(piece, word_timestamps=True, vad_filter=True, condition_on_previous_text=False)
            heard = []
            for s in segments:  # lazy: each segment is recognised as it is pulled
                heard += [(w.word, w.start, w.end) for w in (s.words or [])]
                progress(0.05 + 0.95 * (done + min(s.end, length)) / total, f"Recognising {label}")
            words += timeline_words(clip, heard)
        done += length
    progress(1.0, "Matching text to speech")
    return sorted(words, key=lambda w: w[1])


if __name__ == "__main__":
    try:
        from faster_whisper import WhisperModel
        job = json.loads(sys.stdin.buffer.read().decode("utf-8-sig"))
        blocks = job["blocks"]
        report(0.0, "Loading speech model")
        model =WhisperModel("small", device="cpu", compute_type="int8", local_files_only=True)
        print(json.dumps(align(blocks, transcribe_track(model, job["clips"]))))
    except Exception as exc:
        sys.exit(str(exc))
