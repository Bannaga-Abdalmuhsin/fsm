import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { analyzeEvidence, bucket, buildPayload, checkFile, hmacSha256Hex, IngestError, objectPath, parseMetadata, sha256Hex, type AnalysisResult } from "./core.ts";
import { decode, imageMetrics, originalExif, stampImage } from "./image.ts";
import { visionProvider } from "./vision.ts";

const headers = { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,apikey,content-type,x-client-info" };
const json = (status:number, body:Record<string,unknown>) => new Response(JSON.stringify(body),{status,headers});
async function storeOnce(client:SupabaseClient,path:string,bytes:Uint8Array,mime:string,sha:string) {
  const {error}=await client.storage.from(bucket).upload(path,new Blob([new Uint8Array(bytes).buffer],{type:mime}),{contentType:mime,upsert:false});
  if(!error)return;
  if(String(error.statusCode)!=="409"&&!/already exists|duplicate/i.test(error.message))throw new IngestError(503,"Private photo storage unavailable; retry upload");
  const {data,error:downloadError}=await client.storage.from(bucket).download(path);
  if(downloadError||!data||await sha256Hex(new Uint8Array(await data.arrayBuffer()))!==sha)throw new IngestError(409,"Capture file conflicts with a previously uploaded original");
}
Deno.serve(async(req)=>{
 try{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=="POST")throw new IngestError(405,"Method not allowed");
  const jwt=(req.headers.get("authorization")??"").replace(/^Bearer /,"");
  if(!jwt)throw new IngestError(401,"Sign in required");
  const env=Deno.env.toObject(), url=env.SUPABASE_URL, key=env.SUPABASE_ANON_KEY??env.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key||!env.SUPABASE_SERVICE_ROLE_KEY)throw new IngestError(503,"Ingest service is not configured");
  const client=createClient(url,key,{global:{headers:{Authorization:`Bearer ${jwt}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:user,error:authError}=await client.auth.getUser(jwt);
  if(authError||!user.user)throw new IngestError(401,"Sign in required");
  const contentLength=Number(req.headers.get('content-length')??0);
  if(contentLength>32*1024*1024)throw new IngestError(413,"Photo upload exceeds 32 MB");
  let raw: unknown, original: File, reanalyze = false;
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    const body = await req.json();
    if (typeof body.reanalyze !== 'string' || body.reanalyze.length > 64) throw new IngestError(400,'Evidence ID required');
    const { data: stored, error: storedError } = await client.from('pmr_evidence').select('*').eq('id',body.reanalyze).single();
    if (storedError || !stored || stored.state !== 'Pending analysis') throw new IngestError(403,'Pending evidence not found');
    const { data: blob, error: fileError } = await client.storage.from(bucket).download(stored.handle.path);
    if(fileError || !blob) throw new IngestError(503,'Original photo unavailable');
    original = new File([blob], 'original', { type:stored.mime });
    raw = { ...stored, captured_at_source:stored.source === 'gallery' ? 'exif' : 'device-camera' };
    reanalyze = true;
  } else {
    const form = await req.formData(), metadata = form.get('metadata'), photo = form.get('original');
    if(typeof metadata!=='string'||metadata.length>16000||!(photo instanceof File)) throw new IngestError(400,'Original photo and metadata required');
    original = photo;
    try{raw=JSON.parse(metadata);}catch{throw new IngestError(400,'Invalid metadata JSON');}
  }
  const meta=parseMetadata(raw);
  const {data:context,error:contextError}=await client.rpc('pmr_capture_context',{p_capture:meta.capture_id});
  if(contextError||!context)throw new IngestError(403,"Capture authorization not found");
  const order=context.order, ticket=context.capture;
  if(ticket.order_id!==meta.order_id||ticket.group_id!==meta.group_id||ticket.source!==meta.source||ticket.approval_id!==meta.approval_id)throw new IngestError(403,"Photo does not match its capture authorization");
  const bytes=new Uint8Array(await original.arrayBuffer()), mime=checkFile(bytes,original.type), sha=await sha256Hex(bytes);
  const {data:prior,error:priorError}=await client.from('pmr_evidence').select('sha,order_id').eq('id',meta.capture_id).maybeSingle();
  if(priorError)throw new IngestError(503,"Evidence lookup unavailable");
  if(prior&&!reanalyze){if(prior.sha===sha&&prior.order_id===meta.order_id)return json(200,{status:'registered',capture_id:meta.capture_id});throw new IngestError(409,"Capture already registered with different content");}
  const group=order.checklist.find((g:{id:string})=>g.id===meta.group_id);
  if(!group||meta.linked_etls.some(n=>!group.etls.some((e:{number:number})=>e.number===n)))throw new IngestError(422,"Photo ETLs do not match the selected equipment group");
  const image=decode(bytes,mime), metrics=imageMetrics(image), exif=await originalExif(bytes);
  meta.width=image.width;meta.height=image.height;
  if(meta.source==='gallery'){
    if(!exif?.capturedAt||!Number.isFinite(exif.latitude)||!Number.isFinite(exif.longitude))throw new IngestError(422,"Approved gallery photo needs original EXIF date, timezone and GPS");
    meta.captured_at=exif.capturedAt;meta.captured_at_source='exif';
    meta.gps={latitude:exif.latitude,longitude:exif.longitude,accuracy:50,timestamp:exif.capturedAt,accuracy_source:'conservative_gallery_limit'};
  }else{
    if(meta.captured_at_source!=='device-camera'||Date.parse(meta.captured_at)<Date.parse(ticket.issued_at)-2000||Date.parse(meta.captured_at)>Date.parse(ticket.expires_at))throw new IngestError(422,"Camera time is outside its server capture authorization");
    meta.gps=ticket.gps;
  }
  if(!Number.isFinite(Date.parse(meta.captured_at))||Date.parse(meta.captured_at)>Date.now()+120000||Date.parse(meta.captured_at)<Date.parse(order.tcn_start)||Date.parse(meta.captured_at)>Date.parse(order.tcn_end))throw new IngestError(422,"Photo capture time is outside the TCN window");
  const provider=visionProvider(env,{group:group.title,etls:group.etls,capturedAt:meta.captured_at,siteType:order.site_type,onAir:order.site_reference?.site_status??'unknown',policy:order.policy});
  let analysis:AnalysisResult;
  try{analysis=!reanalyze ? {status:'unavailable',provider:provider?.name??null,reason:provider?'Photo stored; analysis queued':'Vision provider not configured'} : await analyzeEvidence(provider,provider?.name??null,'Vision provider not configured',{bytes,mime,linkedEtls:meta.linked_etls});}
  catch{analysis={status:'unavailable',provider:provider?.name??null,reason:'Vision service failed; retry analysis required'};}
  if(analysis.status==='complete'){
    const findings=analysis.findings as {code:string;message:string;severity:string;confidence:number}[];
    if(image.width<640||image.height<480||metrics.sharpness<2)findings.push({code:'unclear_photo',message:'Image is too small or lacks visible detail. Retake a clear equipment photo.',severity:'block',confidence:1});
    if(exif?.software&&/photoshop|lightroom|snapseed|picsart/i.test(String(exif.software)))findings.push({code:'editing_software',message:'Image metadata names editing software; integrity review required.',severity:'review',confidence:.8});
    const dims=analysis.quality.dimensions as Record<string,number>;
    const weights=order.policy?.weights??{clarity:25,coverage:25,integrity:20,location:15,time:15};
    let total=0,weighted=0;for(const d of ['clarity','coverage','integrity','location','time']){const weight=Number(weights[d]);if(!Number.isFinite(weight)||weight<0)throw new IngestError(500,'Invalid quality policy');total+=weight;weighted+=weight*dims[d];}
    const score=total>0?Math.round(weighted/total):0;
    analysis.quality={score,dimensions:dims,provisional:false,metrics};
    if(score<Number(order.policy?.review??75))findings.push({code:'quality_below_threshold',message:'Photo quality is below the configured minimum; retake required.',severity:'block',confidence:1});
  }
  if(order.inventory?.admin_test && analysis.status==='complete') {
    analysis.quality={...analysis.quality,provisional:true};
    analysis.findings.push({code:'admin_remote_test',message:'Admin remote test only. Actual GPS retained; not operational PMR evidence.',severity:'review',confidence:1});
  }
  const shifted=new Date(Date.parse(meta.captured_at)+3*3600000).toISOString();
  const stamped=stampImage(image,[...(order.inventory?.admin_test ? ["ADMIN REMOTE TEST - NOT OPERATIONAL EVIDENCE"] : []),`${shifted.slice(0,10)} ${shifted.slice(11,19)} GMT+03:00`,`GPS ${Number(meta.gps.latitude).toFixed(6)}, ${Number(meta.gps.longitude).toFixed(6)} +/-${meta.gps.accuracy}M`,`SITE ${order.site_id} | WO ${order.wo} | TCN ${order.tcn}`,`GROUP ${group.id} | ETLS ${meta.linked_etls.join(',')}`,`TECH ${order.assignee} | TEAM ${order.team}`]);
  const derivativeSha=await sha256Hex(stamped),originalPath=objectPath(meta.order_id,meta.capture_id,mime,false),derivativePath=objectPath(meta.order_id,meta.capture_id,'image/jpeg',true);
  if (!reanalyze) { await storeOnce(client,originalPath,bytes,mime,sha);await storeOnce(client,derivativePath,stamped,'image/jpeg',derivativeSha); }
  const payload=buildPayload({meta,sha,derivativeSha,mime,originalPath,derivativePath,analysis,perceptualHash:metrics.perceptualHash});
  const privileged=createClient(url,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:secret,error:secretError}=await privileged.rpc('pmr_get_ingest_key');
  if(secretError||typeof secret!=='string')throw new IngestError(503,'Evidence signing unavailable');
  const {error:registerError}=await client.rpc(reanalyze ? 'pmr_update_analysis' : 'pmr_register_evidence',{p_payload:payload,p_signature:await hmacSha256Hex(secret,payload)});
  if(registerError)throw new IngestError(422,registerError.message.slice(0,300));
  if(!reanalyze && provider) {
    // Respond after durable storage/registration. Independent QC cannot approve pending evidence.
    // Retry uses the same caller JWT and the existing RLS-protected analysis endpoint.
    const task=fetch(`${url}/functions/v1/evidence-ingest`,{
      method:'POST',headers:{Authorization:`Bearer ${jwt}`,apikey:key,'content-type':'application/json'},
      body:JSON.stringify({reanalyze:meta.capture_id}),signal:AbortSignal.timeout(60000),
    }).then(async response=>{await response.arrayBuffer();if(!response.ok)console.warn('Background evidence analysis deferred',response.status);}).catch(()=>console.warn('Background evidence analysis deferred'));
    EdgeRuntime.waitUntil(task);
  }
  return json(201,{status:'registered',capture_id:meta.capture_id,analysis:analysis.status});
 }catch(e){return e instanceof IngestError?json(e.status,{error:e.message}):json(500,{error:'Evidence ingest failed; retry later'});}
});
