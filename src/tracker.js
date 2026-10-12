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
    const samples=[];for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)samples.push(image.data[(this.y+dy)*image.width+this.x+dx]);
    const mean=samples.reduce((a,b)=>a+b,0)/samples.length;
    this.template=Float32Array.from(samples,v=>v-mean);
    this.energy=this.template.reduce((a,b)=>a+b*b,0);
    if(this.energy/samples.length<100) throw new Error('Not enough detail here. Tap the visible sleeve or plate center.');
  }
  score(image,x,y) {
    let sum=0,squares=0,dot=0,k=0;const r=this.radius;
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++) {const v=image.data[(y+dy)*image.width+x+dx];sum+=v;squares+=v*v;dot+=v*this.template[k++];}
    const energy=squares-sum*sum/k;
    return energy>1 ? dot/Math.sqrt(energy*this.energy) : -1;
  }
  step(image) {
    if(image.width!==this.width || image.height!==this.height) return null;
    const r=this.radius,s=this.search;
    const minX=Math.max(r,this.x-s),maxX=Math.min(image.width-r-1,this.x+s);
    const minY=Math.max(r,this.y-s),maxY=Math.min(image.height-r-1,this.y+s);
    let best={score:-1};const candidates=[];
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const c={x,y,score:this.score(image,x,y)};candidates.push(c);if(c.score>best.score)best=c;}
    const rival=Math.max(-1,...candidates.filter(c=>Math.hypot(c.x-best.x,c.y-best.y)>r*1.5).map(c=>c.score));
    // Reject weak or ambiguous matches rather than jumping to a similar object.
    if(best.score<.72 || best.score-rival<.07 || Math.hypot(best.x-this.x,best.y-this.y)>s-2)return null;
    this.x=best.x;this.y=best.y;return best;
  }
}
export class BarPath {
  constructor(decode) {this.decode=decode;this.generation=0;this.clear();}
  cancel() {this.generation++;}
  clear() {this.cancel();this.points=[];this.tracker=null;this.time=-Infinity;this.lostAt=null;this.segment=0;this.busy=false;}
  async select(frame,x,y) {
    this.cancel();const token=this.generation;
    const image=await this.decode(frame);
    if(token!==this.generation)return false;
    const tracker=new PatchTracker(image,x*image.width,y*image.height);
    this.points=this.points.filter(p=>p.time<frame.time);this.segment++;
    this.tracker=tracker;this.time=frame.time;this.lostAt=null;
    this.points.push({time:frame.time,x:tracker.x/image.width,y:tracker.y/image.height,segment:this.segment});
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
        const point=this.tracker.step(image);
        if(!point){this.lostAt=frame.time;break;}
        this.time=frame.time;
        this.points.push({time:frame.time,x:point.x/image.width,y:point.y/image.height,segment:this.segment});
        // Do not hold a long seek on the UI thread.
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    } finally {this.busy=false;}
  }
  visible(time,first=-Infinity) {return this.points.filter(p=>p.time>=first&&p.time<=time);}
  prune(first) {this.points=this.points.filter(p=>p.time>=first);}
}
