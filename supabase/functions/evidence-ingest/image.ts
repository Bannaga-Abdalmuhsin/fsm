import jpeg from "npm:jpeg-js@0.4.4";
import { PNG } from "npm:pngjs@7.0.0";
import * as exifr from "npm:exifr@7.1.3";
import { Buffer } from "node:buffer";
import { IngestError, type Mime } from "./core.ts";

type Pixels = { width: number; height: number; data: Uint8Array };
export function decode(bytes: Uint8Array, mime: Mime): Pixels {
  try {
    if (mime === "image/jpeg") return jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 96, maxResolutionInMP: 16 });
    if (mime === "image/png") {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (view.getUint32(16) * view.getUint32(20) > 16000000) throw new Error("Too many pixels");
      return (PNG as unknown as {sync:{read(input:Buffer):Pixels}}).sync.read(Buffer.from(bytes));
    }
  } catch { throw new IngestError(422, "Image cannot be decoded or exceeds 16 megapixels."); }
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
    const data = await exifr.parse(bytes, { tiff: true, exif: true, gps: true, reviveValues: false });
    if (!data) return null;
    const date = data.DateTimeOriginal, offset = data.OffsetTimeOriginal;
    const capturedAt = typeof date === "string" && typeof offset === "string" && /^[+-]\d{2}:\d{2}$/.test(offset)
      ? new Date(date.replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3T") + offset).toISOString() : null;
    return { capturedAt, latitude: data.latitude, longitude: data.longitude, software: data.Software ?? null };
  } catch { return null; }
}

// A fixed bitmap font makes the final server stamp identical on Android and iOS.
const font: Record<string, string> = {
 A:"01110/10001/10001/11111/10001/10001/10001",B:"11110/10001/10001/11110/10001/10001/11110",C:"01111/10000/10000/10000/10000/10000/01111",D:"11110/10001/10001/10001/10001/10001/11110",E:"11111/10000/10000/11110/10000/10000/11111",F:"11111/10000/10000/11110/10000/10000/10000",G:"01111/10000/10000/10111/10001/10001/01111",H:"10001/10001/10001/11111/10001/10001/10001",I:"11111/00100/00100/00100/00100/00100/11111",J:"00111/00010/00010/00010/10010/10010/01100",K:"10001/10010/10100/11000/10100/10010/10001",L:"10000/10000/10000/10000/10000/10000/11111",M:"10001/11011/10101/10101/10001/10001/10001",N:"10001/11001/10101/10011/10001/10001/10001",O:"01110/10001/10001/10001/10001/10001/01110",P:"11110/10001/10001/11110/10000/10000/10000",Q:"01110/10001/10001/10001/10101/10010/01101",R:"11110/10001/10001/11110/10100/10010/10001",S:"01111/10000/10000/01110/00001/00001/11110",T:"11111/00100/00100/00100/00100/00100/00100",U:"10001/10001/10001/10001/10001/10001/01110",V:"10001/10001/10001/10001/10001/01010/00100",W:"10001/10001/10001/10101/10101/10101/01010",X:"10001/10001/01010/00100/01010/10001/10001",Y:"10001/10001/01010/00100/00100/00100/00100",Z:"11111/00001/00010/00100/01000/10000/11111",
 "0":"01110/10001/10011/10101/11001/10001/01110","1":"00100/01100/00100/00100/00100/00100/01110","2":"01110/10001/00001/00010/00100/01000/11111","3":"11110/00001/00001/01110/00001/00001/11110","4":"00010/00110/01010/10010/11111/00010/00010","5":"11111/10000/10000/11110/00001/00001/11110","6":"01110/10000/10000/11110/10001/10001/01110","7":"11111/00001/00010/00100/01000/01000/01000","8":"01110/10001/10001/01110/10001/10001/01110","9":"01110/10001/10001/01111/00001/00001/01110", ":":"00000/00100/00100/00000/00100/00100/00000", ".":"00000/00000/00000/00000/00000/00100/00100", ",":"00000/00000/00000/00000/00100/00100/01000", "-":"00000/00000/00000/11111/00000/00000/00000", "+":"00000/00100/00100/11111/00100/00100/00000", "/":"00001/00010/00010/00100/01000/01000/10000", "@":"01110/10001/10111/10101/10111/10000/01111", "|":"00100/00100/00100/00100/00100/00100/00100", "_":"00000/00000/00000/00000/00000/00000/11111", "?":"01110/10001/00001/00010/00100/00000/00100",
};
export function stampImage(image: Pixels, lines: string[]): Uint8Array {
  const scale = Math.min(1, 1200 / image.width, 1600 / image.height), w = Math.max(320, Math.round(image.width * scale)), photoH = Math.round(image.height * w / image.width);
  const charScale = w >= 700 ? 2 : 1, lineH = 10 * charScale, columns = Math.floor((w - 20) / (6 * charScale));
  const wrapped = lines.flatMap(l => { const value = l.toUpperCase(); const rows: string[] = []; for (let i=0;i<value.length;i+=columns) rows.push(value.slice(i,i+columns)); return rows; });
  const h = photoH + wrapped.length * lineH + 20, pixels = new Uint8Array(w * h * 4);
  for (let i=3;i<pixels.length;i+=4) pixels[i]=255;
  for (let y=0;y<photoH;y++) for (let x=0;x<w;x++) {
    const source=(Math.min(image.height-1,Math.floor(y*image.height/photoH))*image.width+Math.min(image.width-1,Math.floor(x*image.width/w)))*4;
    const target=(y*w+x)*4; pixels[target]=image.data[source]; pixels[target+1]=image.data[source+1]; pixels[target+2]=image.data[source+2];
  }
  wrapped.forEach((line,index) => [...line].forEach((char,col) => {
    if(char===' ')return;
    (font[char] ?? font['?']).split('/').forEach((row,gy)=>[...row].forEach((p,gx)=>{
      if(p!=='1')return;
      for(let dy=0;dy<charScale;dy++)for(let dx=0;dx<charScale;dx++){
        const at=((photoH+10+index*lineH+gy*charScale+dy)*w+10+col*6*charScale+gx*charScale+dx)*4;
        pixels[at]=pixels[at+1]=pixels[at+2]=255;
      }
    }));
  }));
  return new Uint8Array(jpeg.encode({ width:w,height:h,data:pixels },88).data);
}
