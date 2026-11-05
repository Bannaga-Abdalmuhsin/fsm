import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { promoteSchedules, savePolicy, scheduleIssues, setTeamMember } from "../api";
import { defaultPolicy } from "../../../shared/pmr";
import { colors, fonts } from "../theme";
export function AdminScreen({ onBack }: {onBack:()=>void}) {
 const [team,setTeam]=useState(""),[email,setEmail]=useState(""),[region,setRegion]=useState("CR");
 const [policy,setPolicy]=useState(JSON.stringify(defaultPolicy,null,2)),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [issues,setIssues]=useState<Awaited<ReturnType<typeof scheduleIssues>>>([]);
 async function refresh(){setIssues(await scheduleIssues());}
 useEffect(()=>{refresh().catch(e=>setMessage(e.message));},[]);
 async function run(fn:()=>Promise<unknown>){setBusy(true);setMessage("");try{await fn();await refresh();setMessage("Saved.");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 const button=(label:string,fn:()=>Promise<unknown>)=><Pressable key={label} accessibilityRole="button" disabled={busy} onPress={()=>{void run(fn);}} style={styles.button}><Text style={styles.action}>{label}</Text></Pressable>;
 return <ScrollView style={styles.root} contentContainerStyle={{gap:12,paddingBottom:80}}>
  <Pressable onPress={onBack}><Text style={styles.action}>← Back</Text></Pressable>
  <Text style={styles.heading}>Scheduling and quality settings</Text>
  {message?<Text style={styles.action} accessibilityLiveRegion="polite">{message}</Text>:null}
  <Text style={styles.text}>Assign an existing Supabase technician to the exact team name used in the schedule. The technician must already have membership in this region.</Text>
  {[['Team name',team,setTeam],['Technician email',email,setEmail],['Region: CR / ER / WR / SR',region,setRegion]].map(([label,value,setter])=><TextInput key={label as string} accessibilityLabel={label as string} placeholder={label as string} value={value as string} onChangeText={setter as (s:string)=>void} placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none"/>)}
  {button('Assign team',()=>setTeamMember(team.trim(),region.trim().toUpperCase(),email.trim().toLowerCase(),true))}
  {button('Remove team assignment',()=>setTeamMember(team.trim(),region.trim().toUpperCase(),email.trim().toLowerCase(),false))}
  {button('Create WOs from complete schedules',promoteSchedules)}
  <Text style={styles.heading}>Schedule readiness</Text>
  {issues.map((s,i)=><Text key={i} style={styles.text}>{s.site_id} · {s.date} · {s.team} · {s.state}{s.errors.length?`\n${[...new Set(s.errors)].join('; ')}`:''}</Text>)}
  <Text style={styles.heading}>Quality policy for future WOs</Text>
  <Text style={styles.text}>Weights total 100. Existing work orders keep their frozen policy. Site boundary remains 250 m. Optional criteria in the policy are sent to the vision reviewer.</Text>
  <TextInput accessibilityLabel="Quality policy JSON" style={styles.input} multiline value={policy} onChangeText={setPolicy} autoCapitalize="none" autoCorrect={false}/>
  {button('Save quality policy',()=>savePolicy(JSON.parse(policy)))}
 </ScrollView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:colors.background,padding:20,paddingTop:56},heading:{color:colors.foreground,fontFamily:fonts.bold,fontSize:21},text:{color:colors.muted,fontSize:14},input:{color:colors.foreground,backgroundColor:colors.panel,padding:12,borderRadius:8,minHeight:48},button:{minHeight:48,padding:12,borderRadius:8,borderWidth:1,borderColor:colors.action,justifyContent:'center'},action:{color:colors.action,fontFamily:fonts.medium,fontSize:15}});
