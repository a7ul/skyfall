export class FlightAudio{
  constructor(){this.ctx=null;this.master=null;this.engine=null;this.engineGain=null;this.volume=.35;this.previousVolume=.35;}
  init(){if(this.ctx)return;const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=this.volume;this.master.connect(this.ctx.destination);const o=this.ctx.createOscillator();o.type='sawtooth';o.frequency.value=57;const filter=this.ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=180;this.engineGain=this.ctx.createGain();this.engineGain.gain.value=.055;o.connect(filter);filter.connect(this.engineGain);this.engineGain.connect(this.master);o.start();this.engine={osc:o,filter};}
  setVolume(value){this.volume=Math.max(0,Math.min(1,value));if(this.volume>0)this.previousVolume=this.volume;if(this.ctx)this.master.gain.setTargetAtTime(this.volume,this.ctx.currentTime,.03);}
  toggleMute(){this.setVolume(this.volume?0:this.previousVolume);return this.volume;}
  update(throttle,speed){if(!this.ctx||!this.engine)return;this.engine.osc.frequency.setTargetAtTime(43+throttle*67+speed*.04,this.ctx.currentTime,.08);this.engine.filter.frequency.setTargetAtTime(125+throttle*470,this.ctx.currentTime,.1);this.engineGain.gain.setTargetAtTime(.025+throttle*.08,this.ctx.currentTime,.1);}
  tone(freq,duration=.12,type='sine',gain=.15,endFreq=freq){if(!this.ctx)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq),t+duration);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.02);}
  noise(duration=.3,gain=.16,filterFreq=900){if(!this.ctx)return;const len=Math.ceil(this.ctx.sampleRate*duration),buffer=this.ctx.createBuffer(1,len,this.ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);const src=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),g=this.ctx.createGain();src.buffer=buffer;filter.type='lowpass';filter.frequency.value=filterFreq;g.gain.value=gain;src.connect(filter);filter.connect(g);g.connect(this.master);src.start();}
  click(){this.tone(720,.07,'triangle',.08,510);}
  lock(){this.tone(920,.15,'sine',.12,1250);}
  missile(){this.tone(80,.55,'sawtooth',.22,720);this.noise(.45,.1,1300);}
  gun(){this.noise(.08,.11,420);this.tone(90,.07,'square',.06,50);}
  explosion(){this.noise(.78,.30,370);this.tone(85,.65,'sawtooth',.17,28);}
  warning(){this.tone(720,.13,'square',.12,720);}
}
