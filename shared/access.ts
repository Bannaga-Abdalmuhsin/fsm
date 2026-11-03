export const roles = ["admin", "supervisor", "technician", "team_leader", "regional_manager", "fsm_team"] as const;
export type Role = (typeof roles)[number];
export type Member={ownerEmail:string;orgId:string|null;role:Role;regions:string[];teams?:string[]};
export type ScopedOrder={assignee:string;orgId:string|null;region:string;team?:string};
export const regionCode=(v:string)=>({CENTRAL:"CR",EAST:"ER",WEST:"WR",SOUTH:"SR"}[v.trim().toUpperCase()]??v.trim().toUpperCase());
export const roleLabel=(r:Role)=>({admin:"Administrator",supervisor:"Regional supervisor",technician:"Field technician",team_leader:"Regional team leader",regional_manager:"Regional manager",fsm_team:"FSM team"}[r]);
export const canManage=(m:Member)=>m.role!=="technician";
export const canSchedule=(m:Member)=>["admin","supervisor"].includes(m.role);
export function canViewOrder(m:Member,o:ScopedOrder){return (m.orgId??"")===(o.orgId??"")&&m.regions.map(regionCode).includes(regionCode(o.region))&&(m.role==='technician'?o.assignee.toLowerCase()===m.ownerEmail.toLowerCase():m.role==='team_leader'?(m.teams??[]).includes(o.team??''):true)}
export const canAssignOrder=(m:Member,o:ScopedOrder)=>canSchedule(m)&&canViewOrder(m,o);
export const canOperateOrder=(m:Member,o:ScopedOrder)=>canViewOrder(m,o)&&o.assignee.toLowerCase()===m.ownerEmail.toLowerCase();
export const canReviewEvidence=(m:Member,o:ScopedOrder)=>canViewOrder(m,o)&&["admin","supervisor","team_leader","regional_manager"].includes(m.role)&&o.assignee.toLowerCase()!==m.ownerEmail.toLowerCase();
export const scopeOrders=<T extends ScopedOrder>(m:Member,orders:T[])=>orders.filter(o=>canViewOrder(m,o));
