import { describe, expect, it, vi } from 'vitest';
import jpeg from 'jpeg-js';
import { decode, imageMetrics, originalExif, orientImage, stampImage, stampLayout, fitStampText } from './image.ts';
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
  expect(a).toEqual(b);expect(image.data).toEqual(before);expect(decode(a,'image/jpeg')).toMatchObject({width:64,height:48});
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
 it.each([{confidence:.99,outdoor_natural_light:true,expected:'block'},{confidence:.99,outdoor_natural_light:false,expected:'review'},{confidence:.8,outdoor_natural_light:true,expected:'review'}])('uses Riyadh time and blocks only high-confidence outdoor day/night mismatches: $expected',async({confidence,outdoor_natural_light,expected})=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({findings:[{code:'day_night_mismatch',message:'Lighting inconsistent with capture window',severity:'block',confidence,outdoor_natural_light,etls:[1]}],quality:{dimensions:{clarity:90,coverage:90,integrity:90}}})}}]})));
  vi.stubGlobal('fetch',fetcher);
  try{const result=await visionProvider({PMR_VISION_API_KEY:'synthetic-test-key',PMR_VISION_MODEL:'synthetic-model'},context)!.analyze({bytes:new Uint8Array([1]),mime:'image/jpeg',linkedEtls:[1]});expect(result.findings[0].severity).toBe(expected);expect(fetcher.mock.calls[0][1].body).toContain('2026-11-01T16:00:00.000+03:00');}finally{vi.unstubAllGlobals();}
 });
 it('rejects fabricated or out-of-range model scores',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{"findings":[],"quality":{"dimensions":{"clarity":999,"coverage":90,"integrity":90}}}'}}]}))));
  try{await expect(visionProvider({PMR_VISION_API_KEY:'synthetic-test-key',PMR_VISION_MODEL:'synthetic-model'},context)!.analyze({bytes:new Uint8Array([1]),mime:'image/jpeg',linkedEtls:[1]})).rejects.toThrow(/validation/);}finally{vi.unstubAllGlobals();}
 });
});

describe('orientation and transparent overlay',()=>{
 it('leaves normally oriented photo pixels and dimensions alone',()=>{expect(orientImage(image,1)).toBe(image)});
 it.each([2,3,4,5,6,7,8])('applies EXIF orientation %i without modifying the original',o=>{
  const before=new Uint8Array(image.data);const out=orientImage(image,o);
  expect(out.width).toBe(o>=5?48:64);expect(out.height).toBe(o>=5?64:48);expect(image.data).toEqual(before);
  const first=o===2?[63,0]:o===3?[63,47]:o===4?[0,47]:o===5?[0,0]:o===6?[0,47]:o===7?[63,47]:[63,0];
  expect([...out.data.slice(0,4)]).toEqual([...image.data.slice((first[1]*64+first[0])*4,(first[1]*64+first[0])*4+4)]);
 });
 it('keeps the photo visible where no overlay text is drawn',()=>{
  const data=new Uint8Array(600*800*4);for(let i=0;i<data.length;i+=4){data[i]=80;data[i+1]=140;data[i+2]=180;data[i+3]=255;}
  const result=decode(stampImage({width:600,height:800,data},['2026-11-03 16:00:00','ETLS 1,2 | TEAM A']),'image/jpeg');
  expect(result).toMatchObject({width:600,height:800});const at=(799*600+1)*4;expect(result.data[at+1]).toBeGreaterThan(100);
 });
});

describe('smooth compact timestamp',()=>{
 it('reads the actual EXIF orientation from JPEG bytes before rendering',async()=>{
  const jpg=jpeg.encode(image,90).data;
  const payload=Buffer.from('45786966000049492a0008000000010012010300010000000600000000000000','hex');
  const length=payload.length+2;const file=Buffer.concat([jpg.subarray(0,2),Buffer.from([255,225,length>>8,length&255]),payload,jpg.subarray(2)]);
  const exif=await originalExif(file);expect(exif?.orientation).toBe(6);
  expect(decode(file,'image/jpeg',exif?.orientation)).toMatchObject({width:48,height:64});
 });
 it.each([[900,1600],[1200,675]])('keeps long references inside a compact block at %ix%i',(w,h)=>{
  const rows=stampLayout(w,h,['2026-11-03 16:00:00 (Riyadh)','GPS 0.000000, 0.000000 +/-5 m','WO '+ 'LONG'.repeat(50),'ETLs 1,2,3','Member example | Team example']);
  expect(rows).toHaveLength(5);expect(rows.every(r=>r.left>=w*.29&&r.baseline<h)).toBe(true);expect(rows[2].text.endsWith('…')).toBe(true);
 });
 it('uses actual font widths when fitting mixed-width characters',()=>{expect(fitStampText('iiiiiiiiii',20,80)).toBe('iiiiiiiiii');expect(fitStampText('WWWWWWWWWW',20,80).endsWith('…')).toBe(true)});
});
