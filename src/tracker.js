// Local zero-mean normalized cross-correlation template matching.
// Method: https://docs.opencv.org/4.x/de/da9/tutorial_template_matching.html
export function videoPoint(clientX, clientY, rect, width, height) {
  const scale = Math.min(rect.width/width,rect.height/height);
  const x = (clientX-rect.left-(rect.width-width*scale)/2)/scale;
  const y = (clientY-rect.top-(rect.height-height*scale)/2)/scale;
  return x<0 || y<0 || x>=width || y>=height ? null : {x,y};
}
export class PatchTracker {
  constructor(image, x, y) {
    this.radius = 7; this.search = 24; this.x = Math.round(x); this.y = Math.round(y);
    this.width=image.width;this.height=image.height;
    const r=this.radius;
    if(this.x<r || this.y<r || this.x>=image.width-r || this.y>=image.height-r) throw new Error('Choose a point farther from the image edge.');
    // A smooth bar end may have no detail at its center. Expand around the
    // selected dot to include the collar outline rather than moving the dot.
    for(const radius of [7,11,15]) {
      if(this.x<radius || this.y<radius || this.x>=image.width-radius || this.y>=image.height-radius)break;
      const samples=[];for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)samples.push(image.data[(this.y+dy)*image.width+this.x+dx]);
      const mean=samples.reduce((a,b)=>a+b,0)/samples.length;
      this.template=Float32Array.from(samples,v=>v-mean);
      this.energy=this.template.reduce((a,b)=>a+b*b,0);this.radius=radius;
      if(this.energy/samples.length>=100)break;
    }
    if(this.energy/this.template.length<100) throw new Error('Not enough detail here. Tap a visible bar end with a clear outline.');
    this.adaptive=this.template.slice();this.adaptiveEnergy=this.energy;this.vx=this.vy=0;
  }
  score(image,x,y) {
    let sum=0,squares=0,dot=0,adaptiveDot=0,k=0;const r=this.radius;
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++) {const v=image.data[(y+dy)*image.width+x+dx];sum+=v;squares+=v*v;dot+=v*this.template[k];adaptiveDot+=v*this.adaptive[k++];}
    const energy=squares-sum*sum/k;
    return energy>1 ? Math.max(dot/Math.sqrt(energy*this.energy),adaptiveDot/Math.sqrt(energy*this.adaptiveEnergy)) : -1;
  }
  step(image,elapsed=1/15) {
    if(image.width!==this.width || image.height!==this.height) return null;
    const r=this.radius,s=this.search;
    const predictedX=this.x+Math.round(Math.max(-s/2,Math.min(s/2,this.vx*elapsed)));
    const predictedY=this.y+Math.round(Math.max(-s/2,Math.min(s/2,this.vy*elapsed)));
    const minX=Math.max(r,Math.min(this.x,predictedX)-s),maxX=Math.min(image.width-r-1,Math.max(this.x,predictedX)+s);
    const minY=Math.max(r,Math.min(this.y,predictedY)-s),maxY=Math.min(image.height-r-1,Math.max(this.y,predictedY)+s);
    let best={score:-1};const candidates=[];
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const c={x,y,score:this.score(image,x,y)};candidates.push(c);if(c.score>best.score)best=c;}
    const rival=Math.max(-1,...candidates.filter(c=>Math.hypot(c.x-best.x,c.y-best.y)>r*1.5).map(c=>c.score));
    // Reject weak or ambiguous matches rather than jumping to a similar object.
    if(best.score<.67 || best.score-rival<.06 || Math.hypot(best.x-this.x,best.y-this.y)>s*1.5)return null;
    this.vx=.5*this.vx+.5*(best.x-this.x)/Math.max(.02,elapsed);
    this.vy=.5*this.vy+.5*(best.y-this.y)/Math.max(.02,elapsed);
    // Adapt only on strong, unambiguous matches. Keep the original template as
    // a fallback rather than learning blurred/occluded or ambiguous objects.
    if(best.score>=.8 && best.score-rival>=.1) {
      const values=[];for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)values.push(image.data[(best.y+dy)*image.width+best.x+dx]);
      const mean=values.reduce((a,b)=>a+b,0)/values.length;
      for(let i=0;i<values.length;i++)this.adaptive[i]=this.adaptive[i]*.84+(values[i]-mean)*.16;
      this.adaptiveEnergy=this.adaptive.reduce((a,b)=>a+b*b,0);
    }
    this.x=best.x;this.y=best.y;return best;
  }
}
export class BarPath {
  constructor(decode) {this.decode=decode;this.generation=0;this.clear();}
  cancel() {this.generation++;}
  clear() {this.cancel();this.points=[];this.tracker=null;this.time=-Infinity;this.lostAt=null;this.segment=0;this.busy=false;this.offsetX=this.offsetY=0;}
  async select(frame,x,y) {
    this.cancel();const token=this.generation;
    const image=await this.decode(frame);
    if(token!==this.generation)return false;
    const tracker=new PatchTracker(image,x*image.width,y*image.height);
    this.points=this.points.filter(p=>p.time<frame.time);this.segment++;
    this.tracker=tracker;this.time=frame.time;this.lostAt=null;
    this.offsetX=x*image.width-tracker.x;this.offsetY=y*image.height-tracker.y;
    this.points.push({time:frame.time,x,y,segment:this.segment});
    return true;
  }
  async through(frames,time) {
    if(!this.tracker || this.lostAt!==null || time<=this.time)return;
    const token=this.generation;this.busy=true;
    try {
      // Each retained frame is visited, including during forward seeks. A gap
      // caused by expired/thinned frames is a loss, never an invented bridge.
      for(const frame of frames) {
        if(token!==this.generation)return;
        if(frame.time<=this.time)continue;
        if(frame.time>time)break;
        if(frame.time-this.time>.35){this.lostAt=frame.time;break;}
        const image=await this.decode(frame);
        if(token!==this.generation)return;
        const point=this.tracker.step(image,frame.time-this.time);
        if(!point){this.lostAt=frame.time;break;}
        this.time=frame.time;
        this.points.push({time:frame.time,x:(point.x+this.offsetX)/image.width,y:(point.y+this.offsetY)/image.height,segment:this.segment});
        // Do not hold a long seek on the UI thread.
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    } finally {this.busy=false;}
  }
  visible(time,first=-Infinity) {return this.points.filter(p=>p.time>=first&&p.time<=time);}
  prune(first) {this.points=this.points.filter(p=>p.time>=first);}
}
