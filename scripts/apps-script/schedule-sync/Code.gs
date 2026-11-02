var SCHEDULE_SHEET_ID_ = '<SCHEDULE_SHEET_ID>';
var CMDB_SHEET_ID_ = '<CMDB_SHEET_ID>';
var EXPECTED_SUPABASE_URL_ = 'https://gzjikifzdmfkrvxcixlw.supabase.co';
var SCHEDULE_TAB_ = 'Sheet1';
var SCHEDULE_TIME_ZONE_ = 'Asia/Riyadh';
var CMDB_TAB_ = 'Mastersheet Data Base';
var CMDB_TIME_ZONE_ = 'Antarctica/Syowa';
var CMDB_FIRST_DATA_ROW_ = 4;
var UTC_OFFSET_ = '+03:00';
var SYNC_HANDLER_ = 'syncSources';
var SYNC_INTERVAL_MINUTES_ = 10;
var SYNC_HEADER_ = 'Sync ID';
var REQUIRED_HEADERS_ = ['Site ID', 'Region', 'District', 'Date', 'TCN Number', 'TCN Time', 'Field team name', 'Supervisor name'];
var CMDB_COLUMNS_ = {
  site_id: 'B',
  region: 'E',
  district: 'F',
  location: 'I',
  latitude: 'J',
  longitude: 'K',
  site_status: 'L',
  vendor: 'Q',
  site_type: 'AH'
};
var MONTHS_ = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

function installSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === SYNC_HANDLER_) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(SYNC_HANDLER_).timeBased().everyMinutes(SYNC_INTERVAL_MINUTES_).create();
}

function syncSources() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    console.log('Sync skipped: a previous run still holds the lock.');
    return;
  }
  var failures = [];
  try {
    var config = readConfig_();
    runSource_('cmdb', function () { runSiteSync_(config); }, failures);
    runSource_('schedule', function () { runScheduleSync_(config); }, failures);
  } finally {
    lock.releaseLock();
  }
  if (failures.length) throw new Error(failures.join(' | '));
}

function runSource_(name, work, failures) {
  try {
    work();
  } catch (err) {
    failures.push(name + ': ' + err.message);
  }
}

function readConfig_() {
  var props = PropertiesService.getScriptProperties();
  var config = {
    sheetId: requireProperty_(props, 'SHEET_ID'),
    cmdbSheetId: requireProperty_(props, 'CMDB_SHEET_ID'),
    supabaseUrl: requireProperty_(props, 'SUPABASE_URL'),
    publishableKey: requireProperty_(props, 'SUPABASE_PUBLISHABLE_KEY'),
    syncToken: requireProperty_(props, 'SYNC_TOKEN')
  };
  if (config.sheetId !== SCHEDULE_SHEET_ID_) throw new Error('SHEET_ID does not match the schedule sheet.');
  if (config.cmdbSheetId !== CMDB_SHEET_ID_) throw new Error('CMDB_SHEET_ID does not match the CMDB sheet.');
  if (config.supabaseUrl !== EXPECTED_SUPABASE_URL_) throw new Error('SUPABASE_URL does not match the FSM Supabase project.');
  return config;
}

function requireProperty_(props, name) {
  var value = props.getProperty(name);
  if (!value) throw new Error('Script property is not set: ' + name);
  return value;
}

function runScheduleSync_(config) {
  var spreadsheet = SpreadsheetApp.openById(config.sheetId);
  if (spreadsheet.getSpreadsheetTimeZone() !== SCHEDULE_TIME_ZONE_) {
    throw new Error('Schedule spreadsheet time zone must be ' + SCHEDULE_TIME_ZONE_ + '.');
  }
  var sheet = spreadsheet.getSheetByName(SCHEDULE_TAB_);
  if (!sheet) throw new Error('Tab ' + SCHEDULE_TAB_ + ' not found.');

  var range = sheet.getDataRange();
  var plan = buildSyncPlan_(range.getValues(), range.getDisplayValues());
  if (plan.syncHeaderMissing || plan.newSyncIds.length) writeSyncIds_(sheet, plan);

  var result = postRpc_(config, 'pmr_sync_schedule', config.sheetId, {
    tab: SCHEDULE_TAB_,
    ran_at: new Date().toISOString(),
    rows: plan.rows
  });
  console.log('Schedule sync ' + result.run_id + ' ' + JSON.stringify(result.counts));
}

function buildSyncPlan_(values, display) {
  var headers = display[0].map(function (h) { return String(h).trim(); });
  var col = columnIndex_(headers);
  var missing = REQUIRED_HEADERS_.filter(function (h) { return col[h] === undefined; });
  if (missing.length) throw new Error('Missing required headers: ' + missing.join(', '));

  var syncHeaderMissing = col[SYNC_HEADER_] === undefined;
  var syncColumn = syncHeaderMissing ? headers.length : col[SYNC_HEADER_];
  var newSyncIds = [];
  var rows = [];
  for (var i = 1; i < display.length; i++) {
    var cells = display[i];
    if (cells.every(isBlank_)) continue;
    var syncId = String(cells[syncColumn] === undefined ? '' : cells[syncColumn]).trim();
    if (!syncId) {
      syncId = Utilities.getUuid();
      newSyncIds.push({ row: i + 1, id: syncId });
    }
    rows.push(normalizeRow_(headers, col, cells, values[i], syncId, i + 1));
  }
  assertUniqueSyncIds_(rows);
  return { syncHeaderMissing: syncHeaderMissing, syncColumn: syncColumn, newSyncIds: newSyncIds, rows: rows };
}

function columnIndex_(headers) {
  var col = {};
  headers.forEach(function (h, i) {
    if (!h) return;
    if (col[h] !== undefined) throw new Error('Duplicate header: ' + h);
    col[h] = i;
  });
  return col;
}

function isBlank_(value) {
  return String(value).trim() === '';
}

function normalizeRow_(headers, col, cells, rawValues, syncId, sheetRow) {
  var raw = {};
  headers.forEach(function (h, i) {
    if (h) raw[h] = cells[i] === undefined ? '' : String(cells[i]);
  });

  var siteId = field_(col, cells, 'Site ID').toUpperCase();
  var region = field_(col, cells, 'Region');
  var district = field_(col, cells, 'District');
  var tcnNumber = field_(col, cells, 'TCN Number');
  var teamName = field_(col, cells, 'Field team name');
  var supervisorName = field_(col, cells, 'Supervisor name');
  var woNumber = field_(col, cells, 'WO Number');
  var siteType = field_(col, cells, 'Site Type').toUpperCase();
  var email = field_(col, cells, 'Technician Email').toLowerCase();
  var dateText = field_(col, cells, 'Date');
  var startText = field_(col, cells, 'TCN Time');
  var endText = field_(col, cells, 'TCN End Time');

  var pmrDate = parseCellDate_(rawValues[col['Date']], dateText);
  var startClock = parseClock_(startText);
  var endClock = parseClock_(endText);
  var latitude = parseNumber_(field_(col, cells, 'Latitude'), -90, 90);
  var longitude = parseNumber_(field_(col, cells, 'Longitude'), -180, 180);
  var tcnStart = pmrDate && startClock ? pmrDate + 'T' + startClock + ':00' + UTC_OFFSET_ : null;
  var tcnEnd = pmrDate && endClock ? pmrDate + 'T' + endClock + ':00' + UTC_OFFSET_ : null;

  var issues = [];
  requirePresent_(issues, 'Site ID', siteId);
  requirePresent_(issues, 'Region', region);
  requirePresent_(issues, 'District', district);
  requirePresent_(issues, 'TCN Number', tcnNumber);
  requirePresent_(issues, 'Field team name', teamName);
  requirePresent_(issues, 'Supervisor name', supervisorName);
  requirePresent_(issues, 'WO Number', woNumber);
  requirePresent_(issues, 'Technician Email', email);
  if (!pmrDate) issues.push('Date is missing or not a valid date');
  if (!startClock) issues.push('TCN Time is missing or not HH:mm');
  if (!endText) issues.push('TCN End Time is missing');
  if (endText && !endClock) issues.push('TCN End Time is not HH:mm');
  // Site type and GPS are resolved authoritatively from the server CMDB.
  if (email && !/^[^@\s]+@[^@\s]+$/.test(email)) issues.push('Technician Email is not a valid email');
  if (siteType && ['ODU', 'SHELTER'].indexOf(siteType) < 0) issues.push('Site Type must be ODU or SHELTER');
  if (tcnStart && tcnEnd && Date.parse(tcnEnd) <= Date.parse(tcnStart)) issues.push('TCN End Time is not after TCN Time');

  return {
    sync_id: syncId,
    sheet_row: sheetRow,
    raw: raw,
    site_id: siteId || null,
    region: region || null,
    district: district || null,
    pmr_date: pmrDate,
    tcn_number: tcnNumber || null,
    tcn_start: tcnStart,
    tcn_end: tcnEnd,
    team_name: teamName || null,
    supervisor_name: supervisorName || null,
    wo_number: woNumber || null,
    site_type: siteType || null,
    latitude: latitude,
    longitude: longitude,
    technician_email: email || null,
    issues: issues
  };
}

function field_(col, cells, name) {
  if (col[name] === undefined || cells[col[name]] === undefined) return '';
  return String(cells[col[name]]).trim();
}

function requirePresent_(issues, label, value) {
  if (!value) issues.push(label + ' is missing');
}

function parseCellDate_(value, displayText) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, SCHEDULE_TIME_ZONE_, 'yyyy-MM-dd');
  }
  var match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(displayText);
  if (!match || !MONTHS_[match[2]]) return null;
  return match[3] + '-' + pad2_(MONTHS_[match[2]]) + '-' + pad2_(Number(match[1]));
}

function parseClock_(text) {
  var match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return pad2_(Number(match[1])) + ':' + match[2];
}

function parseNumber_(text, min, max) {
  if (text === '') return null;
  text = String(text).trim().replace(/°$/, '');
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  var n = Number(text);
  return isFinite(n) && n >= min && n <= max ? n : null;
}

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

function assertUniqueSyncIds_(rows) {
  var seen = {};
  var duplicates = [];
  rows.forEach(function (row) {
    if (seen[row.sync_id]) duplicates.push(row.sync_id);
    seen[row.sync_id] = true;
  });
  if (duplicates.length) {
    throw new Error('Duplicate Sync ID in sheet (each row needs a unique ID): ' + duplicates.join(', '));
  }
}

function writeSyncIds_(sheet, plan) {
  if (plan.syncHeaderMissing) sheet.getRange(1, plan.syncColumn + 1).setValue(SYNC_HEADER_);
  plan.newSyncIds.forEach(function (item) {
    sheet.getRange(item.row, plan.syncColumn + 1).setValue(item.id);
  });
}

function runSiteSync_(config) {
  var spreadsheet = SpreadsheetApp.openById(config.cmdbSheetId);
  if (spreadsheet.getSpreadsheetTimeZone() !== CMDB_TIME_ZONE_) {
    throw new Error('CMDB spreadsheet time zone must be ' + CMDB_TIME_ZONE_ + '.');
  }
  var sheet = spreadsheet.getSheetByName(CMDB_TAB_);
  if (!sheet) throw new Error('Tab ' + CMDB_TAB_ + ' not found.');
  var lastRow = sheet.getLastRow();
  if (lastRow < CMDB_FIRST_DATA_ROW_) throw new Error('CMDB has no site rows.');

  var range = sheet.getRange(1, 1, lastRow, columnNumber_('AH'));
  var rows = buildSiteRows_(range.getValues(), range.getDisplayValues());
  var result = postRpc_(config, 'pmr_sync_sites', config.cmdbSheetId, {
    tab: CMDB_TAB_,
    ran_at: new Date().toISOString(),
    rows: rows
  });
  console.log('CMDB sync ' + result.run_id + ' ' + JSON.stringify(result.counts));
}

function buildSiteRows_(values, display) {
  var rows = [];
  var seen = {};
  for (var i = CMDB_FIRST_DATA_ROW_ - 1; i < display.length; i++) {
    var sheetRow = i + 1;
    var fields = {};
    var anyValue = false;
    Object.keys(CMDB_COLUMNS_).forEach(function (name) {
      var text = String(cellAt_(display, i, CMDB_COLUMNS_[name])).trim();
      fields[name] = text;
      if (text) anyValue = true;
    });
    if (!anyValue) continue;
    fields.site_id = fields.site_id.toUpperCase();
    if (!fields.site_id) throw new Error('CMDB row ' + sheetRow + ' has data but no Site ID.');
    if (seen[fields.site_id]) {
      throw new Error('Duplicate CMDB Site ID ' + fields.site_id + ' on rows ' + seen[fields.site_id] + ' and ' + sheetRow + '.');
    }
    seen[fields.site_id] = sheetRow;

    var raw = {};
    Object.keys(CMDB_COLUMNS_).forEach(function (name) {
      raw[CMDB_COLUMNS_[name]] = fields[name];
    });
    rows.push({
      site_id: fields.site_id,
      source_row: sheetRow,
      location: fields.location || null,
      latitude: numberAt_(values, display, i, CMDB_COLUMNS_.latitude, -90, 90),
      longitude: numberAt_(values, display, i, CMDB_COLUMNS_.longitude, -180, 180),
      site_status: fields.site_status || null,
      site_type: siteTypeOf_(fields.site_type),
      vendor: fields.vendor || null,
      region: fields.region || null,
      district: fields.district || null,
      raw: raw
    });
  }
  return rows;
}

function siteTypeOf_(text) {
  var upper = text.toUpperCase();
  if (upper === 'SHELTER') return 'SHELTER';
  if (upper === 'OUTDOOR' || upper === 'ODU') return 'ODU';
  return null;
}

function numberAt_(values, display, rowIndex, letter, min, max) {
  var raw = cellAt_(values, rowIndex, letter);
  if (typeof raw === 'number') return isFinite(raw) && raw >= min && raw <= max ? raw : null;
  return parseNumber_(String(cellAt_(display, rowIndex, letter)).trim(), min, max);
}

function cellAt_(grid, rowIndex, letter) {
  var row = grid[rowIndex];
  var index = columnNumber_(letter) - 1;
  if (!row || row[index] === undefined || row[index] === null) return '';
  return row[index];
}

function columnNumber_(letters) {
  var n = 0;
  for (var i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n;
}

function postRpc_(config, rpcName, sheetId, payload) {
  var response = UrlFetchApp.fetch(config.supabaseUrl + '/rest/v1/rpc/' + rpcName, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      apikey: config.publishableKey,
      'x-pmr-sync-token': config.syncToken
    },
    payload: JSON.stringify({ p_sheet_id: sheetId, p_payload: payload })
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(rpcName + ' rejected with HTTP ' + status + ': ' + response.getContentText().slice(0, 300));
  }
  var result = JSON.parse(response.getContentText());
  if (!result.ok) throw new Error(rpcName + ' rejected: ' + result.error);
  return result;
}