import type {LocalEvidence} from './uploadQueue';
import type {Evidence} from './api';
// Capture and upload are separate facts. Never show zero photos just because upload failed.
export function groupPhotoState(groupId:string,local:LocalEvidence[],remote:Evidence[]){
 local=local.filter(e=>!e.supersededBy);
 const stored=remote.filter(e=>e.group_id===groupId&&e.state!=='Superseded');
 const serverIds=new Set(stored.map(e=>e.id));
 const pending=local.filter(e=>e.groupId===groupId&&!serverIds.has(e.evidenceId));
 const count=new Set([...stored.map(e=>e.id),...local.filter(e=>e.groupId===groupId).map(e=>e.evidenceId)]).size;
 const requiresRetake=pending.length>0&&pending.every(e=>e.lastError?.startsWith("Retake required")||e.lastError?.startsWith("Local photo changed"));
 return {requiresRetake,count,taken:count>0,pending,uploading:pending.some(e=>e.uploadState==='uploading'),failed:pending.some(e=>['retry','blocked'].includes(e.uploadState)),uploaded:stored.length>0&&pending.length===0};
}
