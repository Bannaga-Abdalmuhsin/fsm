import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {beforeAll,describe,expect,it} from 'vitest';
import {checklists} from '../shared/checklists';
import {defaultPolicy} from '../shared/pmr';
const fixture=readFileSync(new URL('./rls.spec.ts',import.meta.url),'utf8');
const sql=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const template=(name:string)=>fixture.match(new RegExp('const '+name+' = `([\\s\\S]*?)`;'))![1];
let db:PGlite;
const now=Date.now(),start=new Date(now-3600000).toISOString(),end=new Date(now+3600000).toISOString();
const fix={latitude:24.7,longitude:46.7,accuracy:5,timestamp:new Date().toISOString()};
async function as(email:string){await db.exec('reset role');await db.query('insert into auth.users values($1,$1,now()) on conflict(id) do nothing',[email]);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:email,email,role:'authenticated'})]);await db.exec('set role authenticated');}
async function admin(){await db.exec('reset role');}
beforeAll(async()=>{
 db=await PGlite.create({extensions:{pgcrypto}});await db.exec(template('supabaseStubs'));await db.exec(template('referenceTables'));await db.exec('alter table storage.buckets add column file_size_limit bigint, add column allowed_mime_types text[]');
 await db.exec(`create table public.pmr_sites(site_id text primary key,location text,latitude float8,longitude float8,site_status text,site_type text,vendor text,region text,district text,source_id text,source_row int,refreshed_at timestamptz,validation_errors jsonb);
 create table public.pmr_schedule_rows(source_id text,sync_id uuid,source_tab text,source_row int,site_id text,region text,district text,scheduled_date date,tcn_number text,tcn_time text,team_name text,supervisor_name text,raw jsonb,state text default 'draft',validation_errors jsonb default '[]',order_id text,synced_at timestamptz default now(),site_reference jsonb,primary key(source_id,sync_id));`);
 for(const file of ['./rls.sql','./migrations/0002_pmr_roles_scopes_ingest.sql','./migrations/0003_native_operations.sql','./migrations/0004_schedule_promotion.sql','./checklist-catalogue.sql','./migrations/20261102074756_generator_instances.sql','./migrations/20261102102453_admin_remote_test.sql','./migrations/20261102115601_simple_group_submissions_profiles_export.sql','./migrations/20261102123620_signed_dc_measurements.sql','./migrations/20261103083112_office_workflow_fsm_handoff.sql','./migrations/20261103095804_national_work_order_catalogue.sql','./migrations/20261104120000_pmr_group_photo_minimums.sql','./migrations/20261104120100_pmr_assignment_push.sql','./migrations/20261111120000_pmr_equipment_checks.sql'])await db.exec(sql(file).replaceAll("user_id uuid","user_id text"));
 await db.exec(`insert into public.pmr_members(id,owner_email,org_id,role,regions,teams) values('a','admin@test','org','admin','["CR"]','[]'),('t','tech@test','org','technician','["CR"]','[]'),('l','lead@test','org','team_leader','["CR"]','["Team"]'),('r','rm@test','org','regional_manager','["CR"]','[]');`);
 await db.query(`insert into public.pmr_orders(id,owner_email,org_id,site_id,site_type,region,team,assignee,wo,tcn,month,latitude,longitude,scheduled_start,scheduled_end,tcn_start,tcn_end,inventory,checklist,policy,created_at,updated_at) values('wo','admin@test','org','SITE','ODU','CR','Team','tech@test','WO1','TCN1','2026-11',24.7,46.7,$1,$2,$1,$2,'{}',$3,$4,$1,$1)`,[start,end,JSON.stringify(checklists.ODU),JSON.stringify(defaultPolicy)]);
},60000);
describe('native workflow enforcement',()=>{
 it('requires an accurate site fix to open the work order',async()=>{
  await as('tech@test');await expect(db.query("select public.pmr_open_order('wo',$1)",[JSON.stringify({...fix,latitude:25})])).rejects.toThrow(/250 m/);
  await expect(db.query("select public.pmr_open_order('wo',$1)",[JSON.stringify({...fix,accuracy:null})])).rejects.toThrow(/malformed/);
  expect((await db.query<{o:{id:string}}>("select public.pmr_open_order('wo',$1) o",[JSON.stringify(fix)])).rows[0].o.id).toBe('wo');
 });
 it('checks in, starts work and issues an order/group-bound capture authorization',async()=>{
  await as('tech@test');await db.query("select public.pmr_check_in('wo',1,$1)",[JSON.stringify(fix)]);await db.exec("select public.pmr_start_work('wo',2)");
  const c=await db.query<{c:{id:string}}>("select public.pmr_begin_capture('wo','O01',$1) c",[JSON.stringify(fix)]);expect(c.rows[0].c.id).toBeTruthy();
  const ctx=await db.query<{c:{capture:{group_id:string}}}>("select public.pmr_capture_context($1) c",[c.rows[0].c.id]);expect(ctx.rows[0].c.capture.group_id).toBe('O01');
  await expect(db.exec("select public.pmr_get_ingest_key()")).rejects.toThrow(/permission denied/);
 });
 it('requires TT and exception reasons and blocks self review',async()=>{
  await as('tech@test');const etl=checklists.ODU[0].etls[0];
  await expect(db.query("select public.pmr_record_etl_result('wo',$1,$2,'O01','Fail','','','','')",[etl.number,etl.code])).rejects.toThrow(/TT/);
  await db.query("select public.pmr_record_etl_result('wo',$1,$2,'O01','Fail','failed','','TT1','')",[etl.number,etl.code]);
  await expect(db.exec("select public.pmr_review_order('wo',3,'approved','')")).rejects.toThrow(/reviewer/);
  await expect(db.exec("select public.pmr_submit_order('wo',3)")).rejects.toThrow(/Complete every ETL/);
 });
 it('keeps gallery exception grants admin-only',async()=>{
  await as('lead@test');await expect(db.exec(`select public.pmr_grant_gallery_approval('wo','tech@test','["O01"]','reason',4,3)`)).rejects.toThrow(/Only admins/);
  await as('admin@test');expect((await db.query<{id:string}>(`select public.pmr_grant_gallery_approval('wo','tech@test','["O01"]','reason',4,3) id`)).rows[0].id).toBeTruthy();
 });
 it('requires team mapping and complete schedule fields before promotion, then links idempotently',async()=>{
  await admin();await db.exec(`insert into public.pmr_sites values('S2','Site2',24.7,46.7,'ON-AIR','ODU','Vendor','CENTRAL','Riyadh','cmdb',4,now(),'[]')`);
  const date=new Date(Date.parse(start)+10800000).toISOString().slice(0,10),id='11111111-2222-4333-8444-555555555555';
  await db.query(`insert into public.pmr_schedule_rows(source_id,sync_id,site_id,region,scheduled_date,tcn_number,team_name,raw) values('sheet',$1,'S2','CENTRAL',$2,'TCN2','Team',$3)`,[id,date,JSON.stringify({normalized:{wo_number:'WO2',tcn_start:start,tcn_end:end}})]);
  expect((await db.query<{n:number}>("select count(*)::int n from public.pmr_orders where wo='WO2'")).rows[0].n).toBe(0);
  await as('admin@test');await db.exec("select public.pmr_set_team_member('Team','CR','tech@test',true)");await db.exec('select public.pmr_promote_ready_schedules()');await db.exec('select public.pmr_promote_ready_schedules()');
  expect((await db.query<{n:number}>("select count(*)::int n from public.pmr_orders where wo='WO2'")).rows[0].n).toBe(1);
  await admin();const row=await db.query<{state:string}>("select state from public.pmr_schedule_rows where sync_id=$1",[id]);expect(row.rows[0].state).toBe('linked');
 });
 it('requires sequential independent photo and ETL approvals before closing a PMR',async()=>{
  await admin();
  const group={...checklists.ODU[0],etls:[checklists.ODU[0].etls[0]]};
  await db.query("insert into public.pmr_orders select (jsonb_populate_record(null::public.pmr_orders,to_jsonb(o)||$1::jsonb)).* from public.pmr_orders o where id='wo'",[JSON.stringify({id:'review-wo',wo:'reviewWO',checklist:[group],status:'In progress',version:3})]);
  await db.query("insert into public.pmr_evidence(id,owner_email,org_id,order_id,group_id,instance,source,capture_id,captured_at,uploaded_at,gps,sha,perceptual_hash,handle,mime,width,height,findings,quality,analysis,state,linked_etls) values('photo','tech@test','org','review-wo','O01','O01','capture','photo',$1,$1,$2,'sha','', '{}','image/jpeg',1200,900,'[]','{\"score\":95,\"provisional\":false}','{\"status\":\"complete\"}','Supervisor review',$3)",[start,JSON.stringify(fix),JSON.stringify([group.etls[0].number])]);
  await as('tech@test');await db.query("select public.pmr_record_etl_result('review-wo',$1,$2,'O01','Fail','observed fault','','TT99','')",[group.etls[0].number,group.etls[0].code]);
  const result=(await db.query<{id:string;updated_at:string}>("select id,updated_at from public.pmr_results where order_id='review-wo'")).rows[0];
  await db.exec("select public.pmr_submit_order('review-wo',3)");
  await as('rm@test');await expect(db.exec("select public.pmr_review_photo('photo',1,'approved','')")).rejects.toThrow(/Team leader/);
  await as('lead@test');await db.exec("select public.pmr_review_photo('photo',1,'approved','')");await db.query("select public.pmr_review_result($1,$2,'approved','checked')",[result.id,result.updated_at]);await db.exec("select public.pmr_review_order('review-wo',4,'approved','checked')");
  await as('rm@test');await db.exec("select public.pmr_review_photo('photo',2,'approved','')");await db.query("select public.pmr_review_result($1,$2,'approved','confirmed')",[result.id,result.updated_at]);await db.exec("select public.pmr_review_order('review-wo',5,'approved','confirmed')");
  expect((await db.query<{status:string}>("select status from public.pmr_orders where id='review-wo'")).rows[0].status).toBe('Approved');
  await as('lead@test');await expect(db.exec("select public.pmr_review_photo('photo',3,'returned','change')")).rejects.toThrow(/approved PMR/);
 });
 it('expands separate generator instances before check-in and rejects later inventory changes',async()=>{
  await as('tech@test');
  const r=await db.query<{o:{checklist:{id:string}[];inventory:{generators:number}}}>("select public.pmr_set_generator_count((select id from public.pmr_orders where wo='WO2'),1,2) o");
  expect(r.rows[0].o.checklist).toHaveLength(20); expect(r.rows[0].o.checklist.some(g=>g.id==='O07_GEN2')).toBe(true);expect(r.rows[0].o.inventory.generators).toBe(2);
  await expect(db.exec("select public.pmr_set_generator_count('wo',3,2)")).rejects.toThrow(/before check-in/);
 });
 it('reopens submitted PMRs when an individual ETL is returned',async()=>{
  await admin();await db.exec("select set_config('pmr.workflow','on',false); update public.pmr_orders set status='Submitted',version=4 where id='wo'");
  await as('lead@test');const result=(await db.query<{id:string;updated_at:string}>("select id,updated_at from public.pmr_results where order_id='wo'")).rows[0];
  await db.query("select public.pmr_review_result($1,$2,'returned','Repeat measurement')",[result.id,result.updated_at]);
  expect((await db.query<{status:string;version:number}>("select status,version from public.pmr_orders where id='wo'")).rows[0]).toEqual({status:'In progress',version:5});
 });
 it('allows only admins to create remote test copies and keeps live geofences intact',async()=>{
  await as('tech@test');await expect(db.exec("select public.pmr_create_admin_test('wo')")).rejects.toThrow(/admin/);
  await as('admin@test');const test=(await db.query<{o:{id:string;version:number;inventory:{admin_test:boolean}}}>("select public.pmr_create_admin_test('wo') o")).rows[0].o;
  expect(test.inventory.admin_test).toBe(true);
  const remote={...fix,latitude:30,timestamp:new Date().toISOString()};
  await db.query("select public.pmr_check_in($1,1,$2)",[test.id,JSON.stringify(remote)]);
  await db.query("select public.pmr_start_work($1,2)",[test.id]);
  expect((await db.query<{c:{id:string}}>("select public.pmr_begin_capture($1,'O01',$2) c",[test.id,JSON.stringify({...remote,timestamp:new Date().toISOString()})])).rows[0].c.id).toBeTruthy();
  await expect(db.query("update public.pmr_orders set status='Approved' where id=$1",[test.id])).rejects.toThrow(/Admin tests cannot/);
  await expect(db.query("update public.pmr_orders set inventory='{}' where id=$1",[test.id])).rejects.toThrow(/immutable/);
  await as('tech@test');
  await expect(db.query("select public.pmr_open_order('wo',$1)",[JSON.stringify(remote)])).rejects.toThrow(/250 m/);
await expect(db.query("select public.pmr_open_order($1,$2)",[test.id,JSON.stringify(remote)])).rejects.toThrow(/not assigned/);
 });
 it('saves group results atomically with optional remarks and only four measurement fields',async()=>{
  await as('tech@test');
  const g=checklists.ODU[0];
  await expect(db.query("select public.pmr_save_group('wo','O01','Fail','',$1,0)",[JSON.stringify({fuel:30})])).rejects.toThrow(/Only numeric/);
  const saved=(await db.query<{g:{revision:number}}>("select public.pmr_save_group('wo','O01','Fail','',$1,0) g",[JSON.stringify({temperature_c:32,dc_busbar_v:-54,bbu_v:-53,ac_v:230})])).rows[0].g;
  expect(saved.revision).toBe(1);
  expect((await db.query<{n:number}>("select count(*)::int n from public.pmr_results where order_id='wo' and instance='O01' and status='Fail' and remarks='' and tt='' ")).rows[0].n).toBe(g.etls.length);
  await expect(db.exec("select public.pmr_save_group('wo','O01','Pass','','{}',0)")).rejects.toThrow(/changed/);
  await as('lead@test');await expect(db.exec("select public.pmr_save_group('wo','O01','Pass','','{}',1)")).rejects.toThrow(/not assigned/);
  const r=(await db.query<{id:string;updated_at:string}>("select id,updated_at from public.pmr_results where order_id='wo' and instance='O01' limit 1")).rows[0];
  await db.query("select public.pmr_review_result($1,$2,'approved','')",[r.id,r.updated_at]);
 });
 it('lets office export scoped submissions but prevents technician export',async()=>{
  await as('tech@test');await expect(db.exec("select public.pmr_export_snapshot('wo')")).rejects.toThrow(/Office access/);
  await as('lead@test');const snapshot=(await db.query<{s:{order:{id:string};groups:unknown[]}}>("select public.pmr_export_snapshot('wo') s")).rows[0].s;expect(snapshot.order.id).toBe('wo');expect(snapshot.groups).toHaveLength(1);
  await expect(db.exec("select public.pmr_export_snapshot('missing')")).rejects.toThrow(/Office access/);
 });
 it('keeps group N/A and Not tested explicit without requiring remarks',async()=>{
  await as('tech@test');
  await db.exec("select public.pmr_save_group('wo','O01','Not applicable','','{}',1)");
  await db.exec("select public.pmr_save_group('wo','O01','Not tested','','{}',2)");
  expect((await db.query<{status:string}>("select status from public.pmr_group_submissions where order_id='wo' and group_id='O01'")).rows[0].status).toBe('Not tested');
 });
 it('allows own profile edits without changing membership or exposing other technicians',async()=>{
  await as('tech@test');await db.exec("select public.pmr_save_profile('Technician','+966 500000000','ur',null)");
  expect((await db.query<{name:string}>("select name from public.pmr_profiles where user_id=auth.uid()")).rows[0].name).toBe('Technician');
  await expect(db.exec("select public.pmr_save_profile('X','invalid!','ar',null)")).rejects.toThrow(/Invalid profile/);
  await expect(db.exec("select public.pmr_save_profile('X','','en','someone/avatar.jpg')")).rejects.toThrow(/own profile/);
  await expect(db.exec("update public.pmr_profiles set org_id='other'")).rejects.toThrow(/permission denied/);
  await as('other@test');expect((await db.query("select * from public.pmr_profiles")).rows).toHaveLength(0);
  await expect(db.exec("select public.pmr_save_profile('Other','','en',null)")).rejects.toThrow(/Provisioned/);
 });
 it('requires three uploaded photos for five ETLs but accepts pending quality checks for office review',async()=>{
  await admin();
  const group={...checklists.ODU[0],etls:checklists.ODU.flatMap(group => group.etls).slice(0,5)};
  await db.query("insert into public.pmr_orders select (jsonb_populate_record(null::public.pmr_orders,to_jsonb(o)||$1::jsonb)).* from public.pmr_orders o where id='wo'",[JSON.stringify({id:'simple-wo',wo:'simpleWO',checklist:[group],status:'In progress',version:3})]);
  await as('tech@test');await db.exec("select public.pmr_save_group('simple-wo','O01','Fail','','{}',0)");
  await expect(db.exec("select public.pmr_submit_order('simple-wo',3)")).rejects.toThrow(/required number of photos/);
  await admin();await db.exec("insert into public.pmr_evidence select (jsonb_populate_record(null::public.pmr_evidence,to_jsonb(e)||'{\"id\":\"pending-photo\",\"capture_id\":\"pending-photo\",\"order_id\":\"simple-wo\",\"state\":\"Pending analysis\",\"analysis\":null,\"quality\":{\"score\":null,\"provisional\":true}}'::jsonb)).* from public.pmr_evidence e where id='photo'");
  await as('tech@test');
  await expect(db.exec("select public.pmr_submit_order('simple-wo',3)")).rejects.toThrow(/required number of photos/);
  await admin();
  for (const id of ['second-photo','third-photo']) {
    await db.query("insert into public.pmr_evidence select (jsonb_populate_record(null::public.pmr_evidence,to_jsonb(e)||$1::jsonb)).* from public.pmr_evidence e where id='pending-photo'",[JSON.stringify({id,capture_id:id,sha:id})]);
  }
  await as('tech@test');await db.exec("select public.pmr_submit_order('simple-wo',3)");
  await as('lead@test');await expect(db.exec("select public.pmr_review_photo('pending-photo',3,'approved','')")).rejects.toThrow();
 });
 it('saves individual equipment results and enforces mandatory readings', async () => {
  await admin();
  const group = checklists.ODU.find((g) => g.id === 'O08')!;
  await db.query("insert into public.pmr_orders select (jsonb_populate_record(null::public.pmr_orders,to_jsonb(o)||$1::jsonb)).* from public.pmr_orders o where id='wo'",
   [JSON.stringify({id:'equipment-wo',wo:'equipmentWO',checklist:[group],status:'In progress',version:3})]);
  const checks = Object.fromEntries(group.etls.map((check, i) => [check.code, i === 0 ? 'Pass' : 'Fail']));
  await as('tech@test');
  const save = (readings: string, remarks: string, revision = 0) =>
   db.query("select public.pmr_save_equipment_group('equipment-wo','O08',$1,$2,$3,null,$4)",
    [JSON.stringify(checks), remarks, readings, revision]);
  await expect(save('{}', 'Exhaust leak')).rejects.toThrow(/required equipment readings/);
  await expect(save('{"fuel_pct":60}', '')).rejects.toThrow(/Add remarks/);
  await save('{"fuel_pct":60}', 'Exhaust leak');
  const rows = (await db.query<{etl_code:string;status:string}>(
   "select etl_code,status from public.pmr_results where order_id='equipment-wo'")).rows;
  expect(Object.fromEntries(rows.map((row) => [row.etl_code, row.status]))).toEqual(checks);
  await expect(save('{"fuel_pct":60}', 'Exhaust leak')).rejects.toThrow(/Group changed/);
 });
 it('enforces FSM region scope, regional approval and ownership before recording a real stc reference',async()=>{
  await admin();await db.exec(`insert into public.pmr_members(id,owner_email,org_id,role,regions,teams) values('fsm','fsm@test','org','fsm_team','["CR"]','[]'),('fsm2','fsm2@test','org','fsm_team','["ER"]','[]');`);
  await as('fsm@test');await expect(db.exec("select public.pmr_fsm_action('wo',5,'claim','','')")).rejects.toThrow(/Regional approval/);
  await expect(db.exec("select public.pmr_export_snapshot('wo')")).rejects.toThrow(/region-approved/);
  await expect(db.exec("select public.pmr_review_order('wo',5,'approved','')")).rejects.toThrow(/Reviewer role/);
  await admin();await db.exec("select set_config('pmr.workflow','on',false);update public.pmr_orders set status='Approved',version=10 where id='wo'");
  await as('fsm2@test');expect((await db.query("select id from public.pmr_orders where id='wo'")).rows).toHaveLength(1);
  await as('fsm@test');await db.exec("select public.pmr_fsm_action('wo',10,'claim','','')");await as('fsm2@test');await expect(db.exec("select public.pmr_fsm_action('wo',11,'claim','','')")).rejects.toThrow(/Another FSM/);await as('fsm@test');
  await expect(db.exec("select public.pmr_fsm_action('wo',11,'uploaded','','')")).rejects.toThrow(/reference/);
  await expect(db.exec("select public.pmr_fsm_action('wo',10,'uploaded','STC-1','')")).rejects.toThrow(/refresh/);
  await db.exec("select public.pmr_fsm_action('wo',11,'return','','Check the export')");
  expect((await db.query<{status:string}>("select status from public.pmr_orders where id='wo'")).rows[0].status).toBe('Leader approved');
  await admin();await db.exec("update public.pmr_orders set status='Approved',version=14 where id='wo'");
  await as('fsm@test');await db.exec("select public.pmr_fsm_action('wo',14,'claim','','')");await db.exec("select public.pmr_fsm_action('wo',15,'uploaded','STC-1','Manually uploaded')");
  expect((await db.query<{state:string;stc_reference:string}>("select state,stc_reference from public.pmr_fsm_handoffs where order_id='wo'")).rows[0]).toEqual({state:'Uploaded',stc_reference:'STC-1'});
  await as('rm@test');await expect(db.exec("select public.pmr_review_order('wo',16,'returned','change')")).rejects.toThrow(/already recorded/);
 });
 it('rejects group approval with pending photos atomically and includes team scopes in membership',async()=>{
  await as('lead@test');const m=(await db.query<{m:{member:{teams:string[]}}}>("select public.pmr_membership() m")).rows[0].m;expect(m.member.teams).toEqual(['Team']);
  const photos=(await db.query<{id:string;revision:number}>("select id,revision from public.pmr_evidence where order_id='simple-wo'")).rows;
  const results=(await db.query<{id:string;updated_at:string}>("select id,updated_at from public.pmr_results where order_id='simple-wo'")).rows;
  await expect(db.query("select public.pmr_review_group('simple-wo','O01',4,'approved','',$1,$2)",[JSON.stringify(photos),JSON.stringify(results)])).rejects.toThrow(/incomplete|retake/);
  expect((await db.query("select * from public.pmr_review_events where order_id='simple-wo' and decision='approved'")).rows).toHaveLength(0);
 });
 it('shows national issued WOs to admin and FSM and regional WOs to regional teams without imported dates',async()=>{
  await admin();await db.exec("insert into pmr_private.project_wo_sources values('master','org',true)");
  await db.query("select pmr_private.ingest_project_wos('master','November 2026','2026-11',$1)",[JSON.stringify([{request_id:'100',task_id:'200',site_id:'SITE',region:'EAST',source_row:10,scheduled_start:'ignored',created_date:'ignored'},{request_id:'101',task_id:'201',site_id:'SITE2',region:'CENTRAL',source_row:11}])]);
  await as('fsm@test');expect((await db.query("select request_id from public.pmr_project_work_orders")).rows).toHaveLength(2);
  await as('admin@test');expect((await db.query("select request_id from public.pmr_project_work_orders")).rows).toHaveLength(2);
  await as('lead@test');expect((await db.query<{request_id:string}>("select request_id from public.pmr_project_work_orders")).rows).toEqual([{request_id:'101'}]);
  await admin();const detail=(await db.query<{details:Record<string,unknown>}>("select details from public.pmr_project_work_orders where request_id='100'")).rows[0].details;expect(detail).not.toHaveProperty('scheduled_start');expect(detail).not.toHaveProperty('created_date');
 });
 it('versions quality policies and refuses location weakening',async()=>{
  await as('admin@test');await expect(db.query('select public.pmr_save_quality_policy($1)',[JSON.stringify({...defaultPolicy,radius:500})])).rejects.toThrow(/cannot be relaxed/);
  await expect(db.query('select public.pmr_save_quality_policy($1)',[JSON.stringify({weights:defaultPolicy.weights})])).rejects.toThrow(/required numbers/);
  await expect(db.query('select public.pmr_save_quality_policy($1)',[JSON.stringify({...defaultPolicy,maxAccuracy:0})])).rejects.toThrow(/cannot be relaxed/);
  await db.query('select public.pmr_save_quality_policy($1)',[JSON.stringify(defaultPolicy)]);
  await as('tech@test');await expect(db.query('select public.pmr_save_quality_policy($1)',[JSON.stringify(defaultPolicy)])).rejects.toThrow(/Admin/);
 });
});

it('queues a newly assigned WO for the assigned technician only and leases once', async () => {
  await as('tech@test');
  await db.exec("select public.pmr_register_push_device('ExpoPushToken[technician-demo]')");
  await expect(db.exec("select * from public.pmr_push_devices")).rejects.toThrow(/permission denied/);
  await expect(db.exec("select public.pmr_claim_assignment_push()")).rejects.toThrow(/permission denied/);
  await as('lead@test');
  await expect(db.exec("select public.pmr_register_push_device('ExpoPushToken[lead-demo]')")).rejects.toThrow(/Technician membership/);
  await admin();
  await db.query("insert into public.pmr_orders select (jsonb_populate_record(null::public.pmr_orders,to_jsonb(o)||$1::jsonb)).* from public.pmr_orders o where id='wo'",[JSON.stringify({id:'push-wo',wo:'pushWO',status:'Assigned',version:1})]);
  await db.exec("update public.pmr_orders set status='Assigned' where id='push-wo'");
  await db.exec("set role service_role");
  expect((await db.query("select token, attempts from public.pmr_claim_assignment_push()")).rows).toEqual([{token:'ExpoPushToken[technician-demo]',attempts:1}]);
  expect((await db.query("select * from public.pmr_claim_assignment_push()")).rows).toHaveLength(0);
  await as('tech@test');
  await db.exec("select public.pmr_unregister_push_device('ExpoPushToken[technician-demo]')");
  await admin();
  expect((await db.query("select * from public.pmr_assignment_push where order_id='push-wo'")).rows).toHaveLength(0);
});
