import {roleLabel,canManage,type Member} from '@shared/access';
import {officeStage,stageLabel,needsMyAction,stageLabels} from '@shared/office-workflow';
import {formatTime} from '@shared/pmr';
import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {Link} from 'react-router';
import {Notice,Page,RequireMember} from '@/components/pmr/pmr-shell';
import {Button} from '@/components/ui/button';
import {fetchOrders} from '@/lib/pmr-api';
import {fetchHandoffs} from '@/lib/office-api';
export default function HomeRoute(){return <RequireMember render={m=><Dashboard member={m}/>}/>}
function Dashboard({member:m}:{member:Member}){
 const [search,setSearch]=useState(''),[region,setRegion]=useState(''),[stage,setStage]=useState(''),[mine,setMine]=useState(false),[showTests,setShowTests]=useState(false);
 const q=useQuery({queryKey:['office-orders',m.ownerEmail,m.role,m.regions.join(','),(m.teams??[]).join(',')],queryFn:async()=>{const [orders,handoffs]=await Promise.all([fetchOrders(m),fetchHandoffs()]);return {orders,handoffs}}});
 const h=(id:string)=>q.data?.handoffs.find(v=>v.order_id===id);
 const base=(q.data?.orders??[]).filter(o=>showTests||o.inventory.admin_test!==true);
 const orders=base.filter(o=>(!region||o.region===region)&&(!stage||String(officeStage(o.status,h(o.id)))===stage)&&(!mine||needsMyAction(m,o.status,h(o.id)))&&[o.wo,o.siteId,o.tcn,o.team,o.assignee].join(' ').toLowerCase().includes(search.toLowerCase()));
 return <Page title={canManage(m)?'Regional work orders':'Assigned work orders'}>
  <div className="office-heading"><p>{roleLabel(m.role)} · {m.regions.join(' / ')}{m.teams?.length?` · ${m.teams.join(', ')}`:''}</p><Button variant="outline" disabled={q.isFetching} onClick={()=>void q.refetch()}>{q.isFetching?'Refreshing…':'Refresh'}</Button></div>
  <div className="office-summary">{stageLabels.map((label,i)=><button key={label} className={stage===String(i)?'active':''} onClick={()=>setStage(stage===String(i)?'':String(i))}><span>{base.filter(o=>officeStage(o.status,h(o.id))===i).length}</span>{label}</button>)}</div>
  <div className="office-filters"><input aria-label="Search work orders" placeholder="Search WO, site, TCN or team" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Region" value={region} onChange={e=>setRegion(e.target.value)}><option value="">All my regions</option>{m.regions.map(r=><option key={r}>{r}</option>)}</select><label><input type="checkbox" checked={mine} onChange={e=>setMine(e.target.checked)}/>Needs my action</label>{m.role==='admin'?<label><input type="checkbox" checked={showTests} onChange={e=>setShowTests(e.target.checked)}/>Include admin tests</label>:null}</div>
  {q.error?<Notice>Work orders could not be loaded. Refresh to retry. {(q.error as Error).message}</Notice>:null}
  {q.isLoading?<p className="office-muted">Loading your regional work orders…</p>:null}
  {!q.isLoading&&!q.error&&!orders.length?<div className="office-empty">No work orders match these filters.</div>:null}
  <div className="office-table-scroll"><table className="office-table"><thead><tr><th>Work order / site</th><th>Region / team</th><th>TCN / Riyadh schedule</th><th>Current stage</th><th>Next owner</th><th/></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><Link className="office-link" to={`/orders/${o.id}`}>WO {o.wo}</Link><small>{o.siteId} · {o.siteType}{o.inventory.admin_test===true?' · ADMIN TEST':''}</small></td><td>{o.region}<small>{o.team}<br/>{o.assignee}</small></td><td>{o.tcn}<small>{formatTime(o.scheduledStart)}<br/>{formatTime(o.tcnStart)} – {formatTime(o.tcnEnd)}</small></td><td><span className={`office-badge stage-${officeStage(o.status,h(o.id))}`}>{stageLabel(o.status,h(o.id))}</span>{o.reviewNote?<small>{o.reviewNote}</small>:null}</td><td>{stageLabels[officeStage(o.status,h(o.id))]}<small>{h(o.id)?.assigned_to}</small></td><td><Link className="office-link" to={`/orders/${o.id}`}>Open →</Link></td></tr>)}</tbody></table></div>
  <p className="office-muted">{orders.length} work orders · Region and team access is enforced by Supabase. Schedule updates come from the shared PMR schedule.</p>
 </Page>
}
