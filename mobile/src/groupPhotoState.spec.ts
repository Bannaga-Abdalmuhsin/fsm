import {describe,it,expect} from 'vitest';
import {groupPhotoState} from './groupPhotoState';
import type {LocalEvidence} from './uploadQueue';
import type {Evidence} from './api';
const local=(id:string,state='queued')=>({evidenceId:id,groupId:'S01',uploadState:state} as LocalEvidence);
const remote=(id:string)=>({id,group_id:'S01',state:'Pending analysis'} as Evidence);
describe('captured photos remain visible before upload',()=>{
 it('shows taken for queued and failed captures',()=>{expect(groupPhotoState('S01',[local('a','retry')],[])).toMatchObject({count:1,taken:true,failed:true,uploaded:false})});
 it('does not double count local and server versions of the same photo',()=>{expect(groupPhotoState('S01',[local('a')],[remote('a')])).toMatchObject({count:1,taken:true,uploaded:true,pending:[]})});
 it('hides replaced missing captures but keeps the new photo',()=>{expect(groupPhotoState('S01',[{...local('old','blocked'),supersededBy:'new'},local('new')],[])).toMatchObject({count:1,taken:true,failed:false})});
});
