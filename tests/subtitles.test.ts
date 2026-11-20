import test from 'node:test';
import assert from 'node:assert/strict';
import { addSecondsToTimestamp, createSubtitleCue, normalizeTimestamp, parseSubtitleFile, serializeSubtitles } from '../src/subtitles.ts';

test('imports SRT cues into Myanmar text',()=>{
 const cues=parseSubtitleFile('1\n00:00:01,000 --> 00:00:03,500\nမင်္ဂလာပါ။','myanmar');
 assert.equal(cues.length,1);
 assert.equal(cues[0].myanmar,'မင်္ဂလာပါ။');
 assert.equal(cues[0].english,'');
 assert.equal(cues[0].start,'00:00:01,000');
});

test('imports WebVTT cues into English text',()=>{
 const cues=parseSubtitleFile('WEBVTT\n\n00:00:01.000 --> 00:00:02.250\nHello there.','english');
 assert.equal(cues.length,1);
 assert.equal(cues[0].english,'Hello there.');
 assert.equal(cues[0].myanmar,'');
 assert.equal(cues[0].end,'00:00:02,250');
});

test('normalizes timestamps and adds seconds safely',()=>{
 assert.equal(normalizeTimestamp('00:01:02.5'),'00:01:02,500');
 assert.equal(addSecondsToTimestamp('00:00:58,500',3),'00:01:01,500');
});

test('rejects subtitle cues with end before start',()=>{
 assert.throws(()=>parseSubtitleFile('1\n00:00:03,000 --> 00:00:02,000\nInvalid','myanmar'),/later than start/);
 const cue=createSubtitleCue('bad','00:00:03,000','00:00:02,000');
 cue.myanmar='မမှန်';
 assert.throws(()=>serializeSubtitles([cue],'myanmar','srt'),/later than start/);
});

test('exports Myanmar SRT and English VTT independently',()=>{
 const cue=createSubtitleCue('a','00:00:01,000','00:00:02,000');
 cue.myanmar='မြန်မာစာ';
 cue.english='English text';
 assert.match(serializeSubtitles([cue],'myanmar','srt'),/1\n00:00:01,000 --> 00:00:02,000\nမြန်မာစာ/);
 assert.match(serializeSubtitles([cue],'english','vtt'),/^WEBVTT\n\n00:00:01\.000 --> 00:00:02\.000\nEnglish text/);
});
