import {getSupabase} from './supabase';
export type Photo={id:string;group_id:string;state:string;revision:number;sha:string;captured_at:string;gps:{latitude:number;longitude:number;accuracy:number};quality:{score:number|null;provisional?:boolean};analysis:{status:string}|null;findings:{code:string;message:string;severity:string}[];handle:{bucket:string;path:string;derivative?:{path:string}}};
export type EtlResult={id:string;etl_code:string;instance:string;status:string;remarks:string;readings:string;updated_at:string};
export type Review={kind:string;target_id:string;stage:string;decision:string;fingerprint:string;reviewer:string;reviewed_at:string;note:string};
export type Handoff={order_id:string;state:string;assigned_to:string;claimed_at:string;stc_reference:string;note:string;uploaded_at:string|null;updated_at:string};
export type Assessment={group_id:string;status:string;remarks:string;measurements:Record<string,number>};
export type Audit={id:string;action:string;detail:string;at:string;actor:string};
export async function officeRecords(orderId:string){
 const c=getSupabase();const [e,r,v,g,h]=await Promise.all([c.from('pmr_evidence').select('*').eq('order_id',orderId).neq('state','Superseded'),c.from('pmr_results').select('*').eq('order_id',orderId),c.from('pmr_review_events').select('*').eq('order_id',orderId),c.from('pmr_group_submissions').select('*').eq('order_id',orderId),c.from('pmr_fsm_handoffs').select('*').eq('order_id',orderId).maybeSingle()]);
 for(const q of [e,r,v,g,h])if(q.error)throw new Error(q.error.message);
 return {photos:e.data as Photo[],results:r.data as EtlResult[],reviews:v.data as Review[],groups:g.data as Assessment[],handoff:h.data as Handoff|null};
}
export async function fetchHandoffs(){const {data,error}=await getSupabase().from('pmr_fsm_handoffs').select('*');if(error)throw error;return data as Handoff[];}
export async function photoUrl(photo:Photo){const {data,error}=await getSupabase().storage.from(photo.handle.bucket).createSignedUrl(photo.handle.derivative?.path??photo.handle.path,240);if(error)throw error;return data.signedUrl;}
async function rpc(name:string,args:Record<string,unknown>){const {data,error}=await getSupabase().rpc(name,args);if(error)throw new Error(error.message);return data;}
export const decidePhoto=(photo:Photo,decision:string,note:string)=>rpc('pmr_review_photo',{p_evidence:photo.id,p_revision:photo.revision,p_decision:decision,p_note:note});
export const decideResult=(r:EtlResult,decision:string,note:string)=>rpc('pmr_review_result',{p_result:r.id,p_expected_updated_at:r.updated_at,p_decision:decision,p_note:note});
export const decideOrder=(id:string,version:number,decision:string,note:string)=>rpc('pmr_review_order',{p_order:id,p_expected_version:version,p_decision:decision,p_note:note});
export const decideGroup=(id:string,group:string,version:number,decision:string,note:string,records:Awaited<ReturnType<typeof officeRecords>>)=>rpc('pmr_review_group',{p_order:id,p_group:group,p_expected_version:version,p_decision:decision,p_note:note,p_photos:records.photos.filter(e=>e.group_id===group).map(e=>({id:e.id,revision:e.revision})),p_results:records.results.filter(r=>r.instance===group).map(r=>({id:r.id,updated_at:r.updated_at}))});
export const fsmAction=(id:string,version:number,action:string,reference:string,note:string)=>rpc('pmr_fsm_action',{p_order:id,p_expected_version:version,p_action:action,p_reference:reference,p_note:note});
export async function officeMembers(){const {data,error}=await getSupabase().from('pmr_members').select('owner_email,org_id,role,regions,teams').order('owner_email');if(error)throw error;return data as {owner_email:string;org_id:string;role:string;regions:string[];teams:string[]}[];}
export const saveOfficeMember=(email:string,org:string|null,role:string,regions:string[],teams:string[])=>rpc('pmr_upsert_member',{p_owner_email:email,p_org_id:org,p_role:role,p_regions:regions,p_teams:teams});
