import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {zipSync,strToU8} from 'npm:fflate@0.8.2';
import {csv,report,safeName,type Snapshot} from './report.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Expose-Headers':'Content-Disposition','Cache-Control':'no-store'};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return new Response('Method not allowed',{status:405,headers});
 try{
 const authorization=req.headers.get('authorization');if(!authorization)throw new Error('Sign in required');
 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const {data:auth,error:authError}=await client.auth.getUser();if(authError||!auth.user)return new Response('Unauthorized',{status:401,headers});
 const body=await req.json();if(typeof body.orderId!=='string'||body.orderId.length>120)throw new Error('Invalid work order');
 const {data,error}=await client.rpc('pmr_export_snapshot',{p_order:body.orderId});if(error)throw new Error('Work order unavailable for office export');
 const snapshot=data as Snapshot,files:Record<string,Uint8Array>={},photos:{id:string;path:string}[]=[];
 if(snapshot.evidence.length>250)throw new Error('Package exceeds 250 photos; contact administrator');
 let total=0;
 for(const e of snapshot.evidence){const path=e.handle?.derivative?.path;if(e.handle?.bucket!=='pmr-evidence'||!path)throw new Error('Stamped photo is unavailable; retry after ingestion completes');
 const {data:blob,error}=await client.storage.from('pmr-evidence').download(path);if(error||!blob)throw new Error('A stamped photo could not be downloaded; retry export');
 total+=blob.size;if(total>60*1024*1024)throw new Error('Package exceeds 60 MB; contact administrator');
 const name=`photos/${safeName(String(e.group_id))}/${safeName(String(e.id))}.jpg`;files[name]=new Uint8Array(await blob.arrayBuffer());photos.push({id:e.id,path:name});}
 files['report.html']=strToU8(report(snapshot,photos));files['etl-results.csv']=strToU8(csv(snapshot));files['manifest.json']=strToU8(JSON.stringify(snapshot,null,2));
 const zip=zipSync(files,{level:0});return new Response(new Uint8Array(zip).buffer,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="WO-${safeName(String(snapshot.order.wo))}.zip"`}});
 }catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:'Export failed'}),{status:400,headers:{...headers,'Content-Type':'application/json'}})}
});
