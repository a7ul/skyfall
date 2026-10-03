import {test,expect} from 'bun:test';
import {createStoryDirector,MISSION_STAGES} from '../../src/mission/story.js';

test('story transmissions arrive in order and reset for each act',()=>{
  const story=createStoryDirector();
  expect(story.tick(.4).map(cue=>cue.speaker)).toEqual(['ECHO / AWACS']);
  expect(story.tick(7).map(cue=>cue.speaker)).toEqual(['MERCY SEVEN']);
  expect(story.tick(20).map(cue=>cue.speaker)).toEqual(['ECHO / AWACS']);
  expect(story.tick(20)).toEqual([]);
  expect(story.enter(1).id).toBe('ambush');
  expect(story.tick(.1).map(cue=>cue.speaker)).toEqual(['ECHO / AWACS']);
});

test('the playable sortie has four distinct acts and a final exit objective',()=>{
  expect(MISSION_STAGES.map(stage=>stage.id)).toEqual(['veil','ambush','wraith','corridor']);
  expect(MISSION_STAGES[3].objective).toBe('REACH THE EXIT GATE');
});
