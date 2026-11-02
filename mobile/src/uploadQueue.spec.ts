import {convertFormDataAsync} from '../node_modules/expo/src/winter/fetch/convertFormData';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({files:new Map<string,string>(),email:'tech@example.com',fetch:vi.fn()}));
vi.mock('expo-file-system',()=>{
 const path=(parts:unknown[])=>parts.map(p=>typeof p==='string'?p:(p as {uri:string}).uri).join('/');
 class File {get name(){return this.uri.split('/').pop()!;} get type(){return 'image/jpeg';} async bytes(){if(!this.exists)throw new Error('No such file');return new TextEncoder().encode(state.files.get(this.uri)!);} uri:string;constructor(...parts:unknown[]){this.uri=path(parts);}get exists(){return state.files.has(this.uri);}async text(){return state.files.get(this.uri)!;}write(s:string){state.files.set(this.uri,s);}delete(){state.files.delete(this.uri);}move(to:File){state.files.set(to.uri,state.files.get(this.uri)!);state.files.delete(this.uri);this.uri=to.uri;}}
 class Directory {uri:string;constructor(...parts:unknown[]){this.uri=path(parts);}get exists(){return [...state.files.keys()].some(p=>p.startsWith(this.uri+'/'));}list(){return [...new Set([...state.files.keys()].filter(p=>p.startsWith(this.uri+'/')).map(p=>p.slice(this.uri.length+1).split('/')[0]))].map(p=>new Directory(this,p));}}
 return {File,Directory,Paths:{document:'document'}};
});
vi.mock('expo/fetch',()=>({fetch:state.fetch}));
vi.mock('./supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{email:state.email},access_token:'test-session'}}})}}}));
vi.mock('./config',()=>({supabaseUrl:'https://example.supabase.co',supabasePublishableKey:'public-test-key'}));
vi.mock('./evidence',()=>({sha256Hex:async(f:{uri:string})=>state.files.get(f.uri)}));
const row=(id='a',technician='tech@example.com')=>({evidenceId:id,orderId:'wo',siteId:'site',groupId:'O01',linkedEtls:[1],technician,team:'Team',capturedAtUtc:'2026-11-02T00:00:00Z',width:1000,height:800,gps:{latitude:0,longitude:0,accuracy:5,timestamp:'2026-11-02T00:00:00Z'},original:{path:`document/evidence/${id}/original.jpg`,sha256:'original'},derivative:{path:`document/evidence/${id}/derivative.jpg`,sha256:'derivative'},uploadState:'queued'});
function seed(r= row(),pending=false){state.files.set(`document/evidence/${r.evidenceId}/metadata.${pending?'next.':''}json`,JSON.stringify(r));state.files.set(r.original.path,'original');state.files.set(r.derivative.path,'derivative');}
beforeEach(()=>{vi.resetModules();state.files.clear();state.email='tech@example.com';state.fetch.mockReset();vi.stubGlobal('fetch',state.fetch);vi.stubGlobal('FormData',class {
 parts:[string,unknown][]=[];append(name:string,value:unknown){this.parts.push([name,value]);}entries(){return this.parts[Symbol.iterator]();}
 });});
describe('durable native photo uploads',()=>{
 it('recovers a metadata write interrupted during restart and isolates owners',async()=>{seed(row(),true);seed(row('other','other@example.com'));const q=await import('./uploadQueue');expect((await q.queuedEvidence(state.email)).map(r=>r.evidenceId)).toEqual(['a']);});
 it('marks a successful upload persistently and does not upload it twice',async()=>{seed();state.fetch.mockResolvedValue(new Response('{}'));const q=await import('./uploadQueue');await q.flushEvidence(state.email);await q.flushEvidence(state.email);expect(state.fetch).toHaveBeenCalledTimes(1);expect((await q.queuedEvidence(state.email))[0].uploadState).toBe('uploaded');expect(state.files.get(row().original.path)).toBe('original');});
 it('backs off temporary failures and serializes simultaneous drain requests',async()=>{seed();state.fetch.mockResolvedValue(new Response('{}',{status:503}));const q=await import('./uploadQueue');await Promise.all([q.flushEvidence(state.email),q.flushEvidence(state.email)]);await q.flushEvidence(state.email);const [r]=await q.queuedEvidence(state.email);expect(state.fetch).toHaveBeenCalledTimes(1);expect(r.uploadState).toBe('retry');expect(r.nextAttemptAt).toBeGreaterThan(Date.now());});
 it('blocks permanent rejections until an explicit retry',async()=>{seed();state.fetch.mockResolvedValue(new Response('{"error":"Wrong equipment"}',{status:422}));const q=await import('./uploadQueue');await q.flushEvidence(state.email);expect((await q.queuedEvidence(state.email))[0]).toMatchObject({uploadState:'blocked',lastError:'Wrong equipment'});state.fetch.mockResolvedValue(new Response('{}'));await q.retryEvidence(state.email);expect((await q.queuedEvidence(state.email))[0].uploadState).toBe('uploaded');});
 it('rejects changed local bytes before transmitting the photo',async()=>{seed();state.files.set(row().original.path,'modified');const q=await import('./uploadQueue');await q.flushEvidence(state.email);expect(state.fetch).not.toHaveBeenCalled();expect((await q.queuedEvidence(state.email))[0].uploadState).toBe('blocked');});
 it('does not upload a previous account’s queue after sign-out/account switch',async()=>{seed();state.email='different@example.com';const q=await import('./uploadQueue');await q.flushEvidence('tech@example.com');expect(state.fetch).not.toHaveBeenCalled();});
});

describe('Expo multipart compatibility and iPhone path recovery',()=>{
 it('serializes real File bytes with the installed Expo converter',async()=>{
  seed();state.fetch.mockImplementation(async(_url,init)=>{const encoded=await convertFormDataAsync(init.body);const parsed=await new Response(new Uint8Array(encoded.body).buffer,{headers:{'Content-Type':`multipart/form-data; boundary=${encoded.boundary}`}}).formData() as unknown as {get:(name:string)=>Blob|string|null};expect(JSON.parse(String(parsed.get('metadata'))).capture_id).toBe('a');expect(await (parsed.get('original') as Blob).text()).toBe('original');expect(await (parsed.get('stamped') as Blob).text()).toBe('derivative');return new Response('{}');});
  const q=await import('./uploadQueue');await q.flushEvidence(state.email);expect((await q.queuedEvidence(state.email))[0].uploadState).toBe('uploaded');expect(state.fetch).toHaveBeenCalledTimes(1);
 });
 it('recovers old absolute paths after an iOS container relocation without changing hashes',async()=>{
  seed();const old={...row(),original:{...row().original,path:'file:///old-ios-container/Documents/evidence/a/original.jpg'},derivative:{...row().derivative,path:'file:///old-ios-container/Documents/evidence/a/derivative.jpg'}};
  state.files.set('document/evidence/a/metadata.json',JSON.stringify(old));state.fetch.mockResolvedValue(new Response('{}'));const q=await import('./uploadQueue');await q.flushEvidence(state.email);const [r]=await q.queuedEvidence(state.email);expect(r.uploadState).toBe('uploaded');expect(r.original.sha256).toBe('original');expect(r.original.path).toBe(row().original.path);
 });
 it('stops retrying truly missing files and preserves records for recapture',async()=>{
  seed();state.files.delete(row().original.path);const q=await import('./uploadQueue');await q.flushEvidence(state.email);await q.flushEvidence(state.email);expect(state.fetch).not.toHaveBeenCalled();expect((await q.queuedEvidence(state.email))[0]).toMatchObject({uploadState:'blocked',lastError:expect.stringContaining('Retake required')});
  seed(row('new'));await q.replaceMissingCaptures(state.email,'wo','O01','new');expect((await q.queuedEvidence(state.email)).find(r=>r.evidenceId==='a')?.supersededBy).toBe('new');expect(state.files.has('document/evidence/a/metadata.json')).toBe(true);
 });
});
