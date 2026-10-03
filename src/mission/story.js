export const MISSION_TITLE='OPERATION NIGHTGLASS';

export const MISSION_STAGES=[
  {
    id:'veil',label:'ACT I / THE BLACKOUT',title:'CUT THE VEIL',objective:'DESTROY JAMMER RELAYS',targetCount:2,
    description:'Sable has blinded the relief corridor. Break both emitters to restore the rescue channel.',
    cues:[
      {at:.3,speaker:'ECHO / AWACS',text:'Viper One, Lyon went dark six minutes ago. Sable took our evacuation frequencies. Two relays are holding the blackout.'},
      {at:7,speaker:'MERCY SEVEN',text:'Echo, Mercy Seven. Our convoy is waiting at the river. We have the recorder from the relief plane Sable shot down. We need a clear sky.'},
      {at:16,speaker:'ECHO / AWACS',text:'Viper, find the orange relay dishes. Guns, missiles, or bombs will bring them down. Stay above the rooftops.'},
    ]
  },
  {
    id:'ambush',label:'ACT II / THE TRAP',title:'BREAK THE AMBUSH',objective:'SPLASH SABLE INTERCEPTORS',targetCount:2,
    description:'The jammers were bait. Two Sable fighters have crossed the Rhône to intercept you.',
    cues:[
      {at:0,speaker:'ECHO / AWACS',text:'Signals are back. Wait—two fast movers, split formation, both turning toward you. Bandits!'},
      {at:4.5,speaker:'SABLE TWO',text:'Viper One. You lit the city up for us. Now there is nowhere to hide.'},
      {at:10,speaker:'MERCY SEVEN',text:'We are still on the ground. Keep those fighters away from the corridor.'},
    ]
  },
  {
    id:'wraith',label:'ACT III / THE REVEAL',title:'DEFEAT WRAITH FLIGHT',objective:'DEFEAT WRAITH FLIGHT',targetCount:2,
    description:'The Sable commander enters the fight with a wingman. Clear both aircraft before the convoy moves.',
    cues:[
      {at:0,speaker:'ECHO / AWACS',text:'New contacts. The lead transponder reads WRAITH. He planned the blackout and has a wingman on his six.'},
      {at:5,speaker:'WRAITH / SABLE ONE',text:'That recorder proves who ordered the relief strike. It cannot leave Lyon, Viper.'},
      {at:11,speaker:'VIPER ONE',text:'Then you should have kept it off the air. Echo, I am engaging Wraith.'},
    ]
  },
  {
    id:'corridor',label:'ACT IV / DAYBREAK',title:'OPEN THE CORRIDOR',objective:'REACH THE EXIT GATE',targetCount:1,
    description:'The route is clear. Fly through the green gate to guide Mercy Seven out of the city.',
    cues:[
      {at:0,speaker:'MERCY SEVEN',text:'Viper, the corridor is open. We are moving now. Meet us at the north exit beacon.'},
      {at:6,speaker:'ECHO / AWACS',text:'One final pass, Viper. Guide Mercy Seven through the gate and bring the evidence home.'},
    ]
  }
];

export function createStoryDirector(){
  let stage=0,time=0,nextCue=0;
  return {
    get stage(){return stage;},
    get current(){return MISSION_STAGES[stage];},
    enter(index){
      if(index<0||index>=MISSION_STAGES.length)throw new RangeError('Unknown mission stage');
      stage=index;time=0;nextCue=0;
      return MISSION_STAGES[stage];
    },
    tick(dt){
      time+=Math.max(0,dt);
      const due=[];
      const cues=MISSION_STAGES[stage].cues;
      while(nextCue<cues.length&&cues[nextCue].at<=time)due.push(cues[nextCue++]);
      return due;
    },
  };
}
