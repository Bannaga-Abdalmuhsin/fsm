// Add this file to the existing PMR Apps Script project. No spreadsheet cells are changed.
// Keep CATALOGUE_SHEET_ID, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SYNC_TOKEN in Script Properties.
function installProjectWOTrigger() {
 ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==='syncProjectWOs')ScriptApp.deleteTrigger(t);});
 ScriptApp.newTrigger('syncProjectWOs').timeBased().everyMinutes(10).create();
 syncProjectWOs();
}
function projectWOPeriod_(name) {
 var months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
 var text=String(name).toLowerCase(),year=text.match(/\b(20\d{2})\b/);if(!year)year=text.match(/(20\d{2})/);if(!year)return null;
 var words=text.split(/[^a-z]+/),month=null;words.forEach(function(w){if(months[w])month=months[w];});
 if(!month){var numeric=text.match(/(20\d{2})[-_ ](0?[1-9]|1[0-2])\b/);if(numeric)month=Number(numeric[2]);}
 return month?year[1]+'-'+('0'+month).slice(-2):null;
}
function projectWORows_(grid) {
 var header=-1;for(var i=0;i<Math.min(grid.length,30);i++){if(grid[i].some(function(v){return String(v).trim()==='Req ID';})){header=i;break;}}
 if(header<0)throw new Error('Req ID header not found');
 var cols={};grid[header].forEach(function(v,i){cols[String(v).trim().toLowerCase()]=i;});
 ['req id','task id','site #','region'].forEach(function(k){if(cols[k]===undefined)throw new Error('Missing '+k);});
 var mapping={request_id:'req id',task_id:'task id',site_id:'site #',region:'region',district:'district',service_provider:'service  provider',network:'network',clli_code:'clli code',manufacturer:'manufacturer',equipment:'equipment',technology:'technology',technology_group:'technology group name',node:'node',combined_node:'nmc combined node',service_type:'service type',source_technician:'technician name',frequency:'stc frequency',work_group:'work group',request_status:'request status'};
 var rows=[],seen={};for(var r=header+1;r<grid.length;r++){
 var row={source_row:r+1};Object.keys(mapping).forEach(function(k){var index=cols[mapping[k]];row[k]=index===undefined?'':String(grid[r][index]||'').trim();});
 if(!row.request_id)continue;if(seen[row.request_id])throw new Error('Duplicate Req ID '+row.request_id);seen[row.request_id]=true;rows.push(row);
 }return rows;
}
function syncProjectWOs() {
 var lock=LockService.getScriptLock();if(!lock.tryLock(20000))return;
 try{
 var p=PropertiesService.getScriptProperties(),id=p.getProperty('CATALOGUE_SHEET_ID');if(!id)throw new Error('Set CATALOGUE_SHEET_ID');
 var url=p.getProperty('SUPABASE_URL'),key=p.getProperty('SUPABASE_PUBLISHABLE_KEY'),token=p.getProperty('SYNC_TOKEN');if(!url||!key||!token)throw new Error('PMR sync properties are incomplete');
 var sheets=SpreadsheetApp.openById(id).getSheets(),synced=0;
 sheets.forEach(function(sheet){var period=projectWOPeriod_(sheet.getName());if(!period)return;
 var rows=projectWORows_(sheet.getDataRange().getDisplayValues());
 var result=UrlFetchApp.fetch(url+'/rest/v1/rpc/pmr_sync_project_wos',{method:'post',contentType:'application/json',muteHttpExceptions:true,headers:{apikey:key,'x-pmr-sync-token':token},payload:JSON.stringify({p_sheet_id:id,p_payload:{tab:sheet.getName(),period:period,rows:rows}})});
 if(result.getResponseCode()<200||result.getResponseCode()>=300)throw new Error('WO sync failed for '+sheet.getName()+': '+result.getResponseCode());
 console.log(sheet.getName()+': '+result.getContentText());synced++;
 });if(!synced)throw new Error('No monthly WO tabs found; include month and year in each tab name');
 }finally{lock.releaseLock();}
}
