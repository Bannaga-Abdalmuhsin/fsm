import jpeg from "npm:jpeg-js@0.4.4";
import { PNG } from "npm:pngjs@7.0.0";
import * as exifr from "npm:exifr@7.1.3";
import { Buffer } from "node:buffer";
import { IngestError, type Mime } from "./core.ts";
import {stampFont} from "./stamp-font.ts";

type Pixels = { width: number; height: number; data: Uint8Array };
// Apply only the original EXIF display orientation; never guess from aspect ratio.
export function orientImage(image: Pixels, orientation = 1): Pixels {
  if (!Number.isInteger(orientation) || orientation < 2 || orientation > 8) return image;
  const swap = orientation >= 5, width = swap ? image.height : image.width, height = swap ? image.width : image.height;
  const data = new Uint8Array(width * height * 4);
  for(let y=0;y<image.height;y++) for(let x=0;x<image.width;x++) {
    let tx=x, ty=y;
    if(orientation===2) tx=image.width-1-x;
    if(orientation===3) {tx=image.width-1-x;ty=image.height-1-y;}
    if(orientation===4) ty=image.height-1-y;
    if(orientation===5) {tx=y;ty=x;}
    if(orientation===6) {tx=image.height-1-y;ty=x;}
    if(orientation===7) {tx=image.height-1-y;ty=image.width-1-x;}
    if(orientation===8) {tx=y;ty=image.width-1-x;}
    data.set(image.data.subarray((y*image.width+x)*4,(y*image.width+x)*4+4),(ty*width+tx)*4);
  }
  return {width,height,data};
}
export function decode(bytes: Uint8Array, mime: Mime, orientation=1): Pixels {
  try {
    if (mime === "image/jpeg") return orientImage(jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 96, maxResolutionInMP: 16 }), orientation);
    if (mime === "image/png") {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (view.getUint32(16) * view.getUint32(20) > 16000000) throw new Error("Too many pixels");
      return orientImage((PNG as unknown as {sync:{read(input:Buffer):Pixels}}).sync.read(Buffer.from(bytes)),orientation);
    }
  } catch { throw new IngestError(422, "Retake required: image exceeds decoder limits or is not a supported JPEG/PNG. Use the updated app camera at the evidence photo size."); }
  throw new IngestError(415, "Use an original JPEG or PNG image.");
}
export function imageMetrics(image: Pixels) {
  const sample = (x: number, y: number, w: number, h: number) => {
    const at = (Math.min(image.height - 1, Math.floor(y * image.height / h)) * image.width + Math.min(image.width - 1, Math.floor(x * image.width / w))) * 4;
    return image.data[at] * .299 + image.data[at + 1] * .587 + image.data[at + 2] * .114;
  };
  let hash = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) hash = (hash << 1n) | (sample(x, y, 9, 8) > sample(x + 1, y, 9, 8) ? 1n : 0n);
  let sum = 0, square = 0, brightness = 0, count = 0;
  for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) {
    const center = sample(x, y, 64, 64);
    const laplacian = 4 * center - sample(x - 1, y, 64, 64) - sample(x + 1, y, 64, 64) - sample(x, y - 1, 64, 64) - sample(x, y + 1, 64, 64);
    sum += laplacian; square += laplacian ** 2; brightness += center; count++;
  }
  return { perceptualHash: hash.toString(16).padStart(16, "0"), sharpness: square / count - (sum / count) ** 2, brightness: brightness / count };
}
export async function originalExif(bytes: Uint8Array) {
  try {
    const data = await exifr.parse(bytes, { tiff: true, exif: true, gps: true, reviveValues: false, translateValues: false });
    if (!data) return null;
    const date = data.DateTimeOriginal, offset = data.OffsetTimeOriginal;
    const capturedAt = typeof date === "string" && typeof offset === "string" && /^[+-]\d{2}:\d{2}$/.test(offset)
      ? new Date(date.replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3T") + offset).toISOString() : null;
    return { orientation: Number(data.Orientation) || 1, capturedAt, latitude: data.latitude, longitude: data.longitude, software: data.Software ?? null };
  } catch { return null; }
}

type StampRow = {text:string;size:number;baseline:number;left:number};
const textWidth=(text:string,size:number)=>[...text].reduce((sum,c)=>sum+(stampFont.glyphs[c]??stampFont.glyphs['?']).advance*size/stampFont.em,0);
export function fitStampText(text:string,size:number,width:number){
  text=text.replace(/[\r\n]+/g,' ').trim();
  if(textWidth(text,size)<=width)return text;
  while(text.length&&textWidth(text+'…',size)>width)text=text.slice(0,-1);
  return text+'…';
}
export function stampLayout(width:number,height:number,lines:string[]):StampRow[]{
  const margin=Math.max(5,Math.round(Math.min(width,height)*.022));
  const maxWidth=width*.68;
  // Date/GPS stay prominent. Reference lines are deliberately smaller and never wrap.
  const base=Math.max(7,Math.min(32,Math.min(width,height)*.035));
  const sizes=lines.map((line,i)=>line.startsWith('ADMIN')?base*.65:i<(lines[0]?.startsWith('ADMIN')?3:2)?base:base*.72);
  const total=sizes.reduce((a,size)=>a+size*1.32,0);
  const shrink=Math.min(1,(height*.30)/Math.max(1,total));
  let cursor=height-margin-sizes.reduce((a,size)=>a+size*1.32*shrink,0);
  return lines.slice(0,8).map((line,i)=>{
    const size=sizes[i]*shrink,text=fitStampText(line,size,maxWidth);
    cursor+=size*1.32;
    return {text,size,baseline:cursor-size*.18,left:width-margin-textWidth(text,size)};
  });
}
// Rasterize real font outlines with 3×3 subpixel coverage. The same renderer and
// bundled typeface run on the server for both platforms; client text is untrusted.
export function stampImage(image:Pixels,lines:string[]):Uint8Array {
  const scale=Math.min(1,1200/image.width,1600/image.height),w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));
  const pixels=new Uint8Array(w*h*4),mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const source=(Math.min(image.height-1,Math.floor(y*image.height/h))*image.width+Math.min(image.width-1,Math.floor(x*image.width/w)))*4;
    const at=(y*w+x)*4;pixels.set(image.data.subarray(source,source+4),at);pixels[at+3]=255;
  }
  for(const row of stampLayout(w,h,lines)){
    const edges:number[][]=[];let cursor=row.left,minY=h,maxY=0;
    for(const char of row.text){
      const glyph=stampFont.glyphs[char]??stampFont.glyphs['?'],factor=row.size/stampFont.em;
      for(const contour of glyph.contours){
        for(let i=0;i<contour.length;i++){
          const a=contour[i],b=contour[(i+1)%contour.length];
          const x1=cursor+a[0]*factor,y1=row.baseline-a[1]*factor,x2=cursor+b[0]*factor,y2=row.baseline-b[1]*factor;
          minY=Math.min(minY,y1,y2);maxY=Math.max(maxY,y1,y2);
          if(y1!==y2)edges.push([x1,y1,x2,y2]);
        }
      }
      cursor+=glyph.advance*factor;
    }
    const first=Math.max(0,Math.floor(minY*3)),last=Math.min(h*3,Math.ceil(maxY*3));
    for(let sy=first;sy<last;sy++){
      const y=(sy+.5)/3,crossings:number[]=[];
      for(const [x1,y1,x2,y2] of edges)if((y1<=y&&y2>y)||(y2<=y&&y1>y))crossings.push(x1+(y-y1)*(x2-x1)/(y2-y1));
      crossings.sort((a,b)=>a-b);
      for(let i=0;i+1<crossings.length;i+=2){
        const from=Math.max(0,Math.ceil(crossings[i]*3-.5)),to=Math.min(w*3,Math.ceil(crossings[i+1]*3-.5));
        for(let sx=from;sx<to;sx++){const at=Math.floor(sy/3)*w+Math.floor(sx/3);mask[at]=Math.min(9,mask[at]+1);}
      }
    }
  }
  // A single subtle one-pixel shadow, never an opaque rectangle or thick outline.
  for(let y=1;y<h;y++)for(let x=1;x<w;x++){
    const alpha=mask[(y-1)*w+x-1]/9*.55,at=(y*w+x)*4;
    if(alpha)for(let c=0;c<3;c++)pixels[at+c]=Math.round(pixels[at+c]*(1-alpha));
  }
  for(let i=0;i<mask.length;i++)if(mask[i]){const alpha=mask[i]/9;for(let c=0;c<3;c++)pixels[i*4+c]=Math.round(pixels[i*4+c]*(1-alpha)+255*alpha);}
  return new Uint8Array(jpeg.encode({width:w,height:h,data:pixels},90).data);
}
