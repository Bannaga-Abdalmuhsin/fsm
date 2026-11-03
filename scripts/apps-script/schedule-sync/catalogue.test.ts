import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,it,expect} from 'vitest';
const context:Record<string,any>={};runInNewContext(readFileSync(new URL('./Catalogue.gs',import.meta.url),'utf8'),context);
describe('monthly issued WO import without scheduling dates',()=>{
 it('discovers named monthly tabs without hardcoding one month',()=>{expect(context.projectWOPeriod_('NETOPS_PMR_WO_Nov_2026')).toBe('2026-11');expect(context.projectWOPeriod_('December 2026')).toBe('2026-12');expect(context.projectWOPeriod_('January 2027')).toBe('2027-01');expect(context.projectWOPeriod_('Notes')).toBeNull()});
 it('keeps exact WO/task identity and excludes all source dates',()=>{const rows=context.projectWORows_([['Report'],['Req ID','Task ID','Site #','Region','Scheduled Dt From& Time','ETL Period Start'],['100','200','SITE','EAST','date ignored','date ignored']]);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({request_id:'100',task_id:'200',site_id:'SITE',region:'EAST'});expect(Object.keys(rows[0]).some(k=>/date|scheduled|period/i.test(k))).toBe(false)});
 it('rejects duplicate request IDs instead of overwriting one WO with another',()=>{expect(()=>context.projectWORows_([['Req ID','Task ID','Site #','Region'],['100','200','SITE','EAST'],['100','201','SITE2','EAST']])).toThrow(/Duplicate/)});
});
