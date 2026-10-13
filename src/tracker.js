// Local zero-mean normalized cross-correlation template matching.
// Method: https://docs.opencv.org/4.x/de/da9/tutorial_template_matching.html
export function videoPoint(clientX, clientY, rect, width, height) {
  const scale = Math.min(rect.width/width,rect.height/height);
  const x = (clientX-rect.left-(rect.width-width*scale)/2)/scale;
  const y = (clientY-rect.top-(rect.height-height*scale)/2)/scale;
  return x<0 || y<0 || x>=width || y>=height ? null : {x,y};
}
function smooth(image) {
  const {width,height}=image, temp=new Float32Array(width*height),data=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    let sum=0;for(let dx=-2;dx<=2;dx++)sum+=image.data[y*width+Math.max(0,Math.min(width-1,x+dx))];
    temp[y*width+x]=sum/5;
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    let sum=0;for(let dy=-2;dy<=2;dy++)sum+=temp[Math.max(0,Math.min(height-1,y+dy))*width+x];
    data[y*width+x]=Math.round(sum/5);
  }
  return {width,height,data};
}
function centered(values) {
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  const template=Float32Array.from(values,v=>v-mean);
  return {template,energy:template.reduce((a,b)=>a+b*b,0)};
}
function patch(image,x,y,radius) {
  const values=[];
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)values.push(image.data[(y+dy)*image.width+x+dx]);
  const model={radius,...centered(values)};model.adaptive=model.template.slice();model.adaptiveEnergy=model.energy;
  sparse(model);return model;
}
function sparse(model) {
  const original=[],adaptive=[],side=model.radius*2+1;
  for(let y=0;y<side;y+=2)for(let x=0;x<side;x+=2){original.push(model.template[y*side+x]);adaptive.push(model.adaptive[y*side+x]);}
  const next=centered(adaptive);model.coarse={...centered(original),adaptive:next.template,adaptiveEnergy:next.energy};
}
function correlate(image,x,y,model,step=1) {
  let sum=0,squares=0,dot=0,adaptiveDot=0,k=0;
  const {template,energy:referenceEnergy,adaptive,adaptiveEnergy}=step===1?model:model.coarse,r=model.radius;
  for(let dy=-r;dy<=r;dy+=step)for(let dx=-r;dx<=r;dx+=step) {
    const v=image.data[(y+dy)*image.width+x+dx];sum+=v;squares+=v*v;dot+=v*template[k];adaptiveDot+=v*adaptive[k++];
  }
  const energy=squares-sum*sum/k;
  return energy>1 && referenceEnergy>1 && adaptiveEnergy>1 ? Math.max(dot/Math.sqrt(energy*referenceEnergy),adaptiveDot/Math.sqrt(energy*adaptiveEnergy)) : -1;
}
function match(image,model,minX,maxX,minY,maxY) {
  const candidates=[];
  // Test every candidate position with a sparse patch first. Only refine the
  // strongest distinct peaks; an odd-pixel movement never skips a position.
  const stride=model.coarse.energy>1 && model.coarse.adaptiveEnergy>1 ? 2 : 1;
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)candidates.push({x,y,score:correlate(image,x,y,model,stride)});
  candidates.sort((a,b)=>b.score-a.score);
  const peaks=[];
  for(const c of candidates) {
    if(peaks.every(p=>Math.hypot(p.x-c.x,p.y-c.y)>model.radius/2))peaks.push(c);
    if(peaks.length===8)break;
  }
  const refined=new Map();let best={score:-1};
  for(const peak of peaks)for(let y=Math.max(minY,peak.y-2);y<=Math.min(maxY,peak.y+2);y++)for(let x=Math.max(minX,peak.x-2);x<=Math.min(maxX,peak.x+2);x++) {
    const key=y*image.width+x;if(refined.has(key))continue;
    const c={x,y,score:correlate(image,x,y,model)};refined.set(key,c);if(c.score>best.score)best=c;
  }
  let rival=-1;for(const c of refined.values())if(Math.hypot(c.x-best.x,c.y-best.y)>model.radius*1.5)rival=Math.max(rival,c.score);
  return {...best,margin:best.score-rival};
}
function adapt(image,x,y,model) {
  const next=patch(image,x,y,model.radius);
  for(let i=0;i<model.adaptive.length;i++)model.adaptive[i]=model.adaptive[i]*.84+next.template[i]*.16;
  model.adaptiveEnergy=model.adaptive.reduce((a,b)=>a+b*b,0);sparse(model);
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
      this.model=patch(image,this.x,this.y,radius);this.radius=radius;
      if(this.model.energy/this.model.template.length>=100)break;
    }
    if(this.model.energy/this.model.template.length<100) throw new Error('Not enough detail here. Tap a visible bar end with a clear outline.');
    const contextRadius=Math.min(15,this.x,this.y,image.width-this.x-1,image.height-this.y-1);
    this.context=patch(smooth(image),this.x,this.y,contextRadius);
    this.vx=this.vy=0;this.updates=0;
  }
  score(image,x,y) {
    return correlate(image,x,y,this.model);
  }
  step(image,elapsed=1/15) {
    if(image.width!==this.width || image.height!==this.height) return null;
    const s=Math.max(this.search,Math.min(48,Math.ceil(Math.hypot(this.vx,this.vy)*elapsed)+12));
    const predictedX=this.x+Math.round(Math.max(-s/2,Math.min(s/2,this.vx*elapsed)));
    const predictedY=this.y+Math.round(Math.max(-s/2,Math.min(s/2,this.vy*elapsed)));
    const find=(source,model,search)=>match(source,model,Math.max(model.radius,Math.min(this.x,predictedX)-search),Math.min(image.width-model.radius-1,Math.max(this.x,predictedX)+search),Math.max(model.radius,Math.min(this.y,predictedY)-search),Math.min(image.height-model.radius-1,Math.max(this.y,predictedY)+search));
    let best=find(image,this.model,s),blurred=null,recovered=false;
    // Strong competing detail matches are genuinely ambiguous. Do not use a
    // smoother outline to excuse that ambiguity or learn a neighbouring plate.
    if(best.score>=.67 && best.margin<.06)return null;
    if(best.score<.67) {
      blurred=smooth(image);const context=find(blurred,this.context,Math.max(32,s));
      if(context.score<.78 || context.margin<.08 || this.score(image,context.x,context.y)<.25)return null;
      best=context;recovered=true;
    }
    if(best.margin<.06 || Math.hypot(best.x-this.x,best.y-this.y)>Math.max(32,s)*1.5)return null;
    this.vx=.5*this.vx+.5*(best.x-this.x)/Math.max(.02,elapsed);
    this.vy=.5*this.vy+.5*(best.y-this.y)/Math.max(.02,elapsed);
    // Adapt only on strong, unambiguous matches. Keep the original template as
    // a fallback rather than learning blurred/occluded or ambiguous objects.
    if(!recovered && best.score>=.8 && best.margin>=.1) {
      adapt(image,best.x,best.y,this.model);
      if(++this.updates%4===0 && best.x>=this.context.radius && best.y>=this.context.radius && best.x<image.width-this.context.radius && best.y<image.height-this.context.radius)adapt(smooth(image),best.x,best.y,this.context);
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
      for await(const frame of frames) {
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
