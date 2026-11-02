import { describe, expect, it, vi } from 'vitest';
import jpeg from 'jpeg-js';
import { decode, imageMetrics, originalExif, stampImage } from './image.ts';
import { visionProvider } from './vision.ts';
const image = { width:64,height:48,data:new Uint8Array(64*48*4) };
for(let y=0;y<48;y++)for(let x=0;x<64;x++){const at=(y*64+x)*4;image.data[at]=x*4;image.data[at+1]=y*5;image.data[at+2]=(x+y)%2?255:0;image.data[at+3]=255;}
describe('real image processing',()=>{
 it('decodes real JPEG pixels and rejects a truncated signature',()=>{
  const bytes=new Uint8Array(jpeg.encode(image,90).data);const decoded=decode(bytes,'image/jpeg');
  expect(decoded.width).toBe(64);expect(decoded.height).toBe(48);
  expect(()=>decode(new Uint8Array([255,216,255]),'image/jpeg')).toThrow(/decode/);
 });
 it('computes a stable pixel hash and sharpness',()=>{
  const a=imageMetrics(image),b=imageMetrics(image);expect(a.perceptualHash).toMatch(/^[0-9a-f]{16}$/);expect(a).toEqual(b);expect(a.sharpness).toBeGreaterThan(0);
 });
 it('generates a deterministic server stamp without changing original pixels',()=>{
  const before=new Uint8Array(image.data);const a=stampImage(image,['2026-11-01 16:00:00 GMT+03:00','GPS 24.700000, 46.700000']);const b=stampImage(image,['2026-11-01 16:00:00 GMT+03:00','GPS 24.700000, 46.700000']);
  expect(a).toEqual(b);expect(image.data).toEqual(before);expect(decode(a,'image/jpeg').height).toBeGreaterThan(48);
 });
 it('never invents EXIF for a camera JPEG',async()=>expect(await originalExif(new Uint8Array(jpeg.encode(image,90).data))).toBeNull());
});
describe('vision boundary',()=>{
 const context={group:'Rectifier controller',etls:[{number:1,description:'Read rectifier display'}],capturedAt:'2026-11-01T13:00:00Z',siteType:'ODU',onAir:'ON-AIR',policy:{}};
 it('stays unavailable without an actual credential and model',()=>expect(visionProvider({},context)).toBeNull());
 it('validates model output and supplies an image request',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({findings:[{code:'equipment_mismatch',message:'Generator shown instead of rectifier',severity:'block',confidence:.99,etls:[1,999]}],quality:{dimensions:{clarity:95,coverage:0,integrity:80}},ocr_text:'GENERATOR'})}}]}),{status:200}));
  vi.stubGlobal('fetch',fetcher);
  try{
   const result=await visionProvider({PMR_VISION_API_KEY:'synthetic-test-key',PMR_VISION_MODEL:'synthetic-model'},context)!.analyze({bytes:new Uint8Array([1,2]),mime:'image/jpeg',linkedEtls:[1]});
   expect(result.findings[0]).toMatchObject({severity:'block',etls:[1]});expect(JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  }finally{vi.unstubAllGlobals();}
 });
 it('rejects fabricated or out-of-range model scores',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{"findings":[],"quality":{"dimensions":{"clarity":999,"coverage":90,"integrity":90}}}'}}]}))));
  try{await expect(visionProvider({PMR_VISION_API_KEY:'synthetic-test-key',PMR_VISION_MODEL:'synthetic-model'},context)!.analyze({bytes:new Uint8Array([1]),mime:'image/jpeg',linkedEtls:[1]})).rejects.toThrow(/validation/);}finally{vi.unstubAllGlobals();}
 });
});
