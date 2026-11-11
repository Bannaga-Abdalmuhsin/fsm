import {File,Paths} from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {supabase} from './supabase';
import {supabaseUrl,supabasePublishableKey} from './config';
export async function exportSubmission(orderId:string,wo:string){
 if(!supabase)throw new Error('Supabase not configured');
 const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('Sign in again');
 const response=await fetch(`${supabaseUrl}/functions/v1/submission-export`,{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,apikey:supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({orderId})});
 if(!response.ok){const err=await response.json().catch(()=>({error:'Export failed'}));throw new Error(err.error??'Export failed')}
 if(!await Sharing.isAvailableAsync())throw new Error('Sharing is unavailable on this device');
 const file=new File(Paths.cache,`WO-${wo.replace(/[^a-zA-Z0-9_-]/g,'_')}.zip`);file.create({overwrite:true});file.write(new Uint8Array(await response.arrayBuffer()));
 await Sharing.shareAsync(file.uri,{mimeType:'application/zip',UTI:'public.zip-archive',dialogTitle:`WO ${wo}`});
}
