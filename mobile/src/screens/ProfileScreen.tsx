import {useEffect,useState} from 'react';
import {ActivityIndicator,Image,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {manipulateAsync,SaveFormat} from 'expo-image-manipulator';
import {Ionicons} from '@expo/vector-icons';
import {loadProfile,saveProfile,uploadAvatar,profileImageUrl,type Profile} from '../api';
import {languages,useLanguage} from '../i18n';
import {colors} from '../theme';
export function ProfileScreen({email,onBack}:{email:string;onBack:()=>void}){
 const {t,locale,rtl,setLocale}=useLanguage();const [profile,setProfile]=useState<Profile>({name:'',mobile:'',locale,avatar_path:null});
 const [url,setUrl]=useState(''),[busy,setBusy]=useState(true),[message,setMessage]=useState(''),[loaded,setLoaded]=useState(false);
 useEffect(()=>{loadProfile().then(async p=>{if(p){setProfile(p);setLocale(p.locale);if(p.avatar_path)setUrl(await profileImageUrl(p.avatar_path));}setLoaded(true)}).catch(e=>setMessage(e.message)).finally(()=>setBusy(false))},[]);
 async function run(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn()}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 async function pick(){if(!(await ImagePicker.requestMediaLibraryPermissionsAsync()).granted)throw new Error('Allow access to your profile photo.');const selected=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:.8});if(selected.canceled)return;const image=await manipulateAsync(selected.assets[0].uri,[{resize:{width:512}}],{compress:.8,format:SaveFormat.JPEG});const path=await uploadAvatar(image.uri);setProfile(p=>({...p,avatar_path:path}));setUrl(image.uri);}
 return <ScrollView style={s.root} contentContainerStyle={{gap:20,paddingBottom:80,direction:rtl?'rtl':'ltr'}} keyboardShouldPersistTaps="handled">
 <Pressable accessibilityRole="button" onPress={onBack} style={s.linkButton}><Text style={s.link}>‹ {t('back')}</Text></Pressable>
 <Text style={s.heading}>{t('profile')}</Text>
 <View style={s.avatar}>{url?<Image source={{uri:url}} style={{width:104,height:104,borderRadius:52}} accessibilityLabel={t('profile')}/>:<Ionicons name="person-outline" size={44} color={colors.action}/>}</View>
 <Pressable accessibilityRole="button" disabled={busy||!loaded} onPress={()=>void run(pick)} style={s.linkButton}><Text style={[s.link,{textAlign:'center'}]}>{t('avatar')}</Text></Pressable>
 <View style={s.card}><Text style={s.label}>{t('name')}</Text><TextInput accessibilityLabel={t('name')} style={s.input} value={profile.name} onChangeText={name=>setProfile(p=>({...p,name}))} maxLength={120} editable={!busy&&loaded}/>
 <Text style={s.label}>{t('mobile')}</Text><TextInput accessibilityLabel={t('mobile')} style={s.input} value={profile.mobile} onChangeText={mobile=>setProfile(p=>({...p,mobile}))} keyboardType="phone-pad" maxLength={32} editable={!busy&&loaded}/>
 <Text style={s.label}>{t('email')}</Text><Text style={s.muted}>{email}</Text></View>
 <Text style={s.label}>{t('language')}</Text><View style={s.card}>{languages.map(l=><Pressable key={l.id} accessibilityRole="radio" accessibilityState={{checked:locale===l.id}} onPress={()=>{setLocale(l.id);setProfile(p=>({...p,locale:l.id}))}} style={s.row}><Text style={s.label}>{l.label}</Text><Ionicons name={locale===l.id?'checkmark-circle':'ellipse-outline'} size={23} color={locale===l.id?colors.action:colors.border}/></Pressable>)}</View>
 {message?<Text accessibilityLiveRegion="polite" style={s.link}>{message}</Text>:null}
 <Pressable accessibilityRole="button" style={[s.button,(busy||!loaded)&&{opacity:.5}]} disabled={busy||!loaded} onPress={()=>void run(async()=>{await saveProfile({...profile,locale});setMessage(t('saved'))})}>{busy?<ActivityIndicator color="white"/>:<Text style={s.buttonText}>{t("saveProfile")}</Text>}</Pressable>
 </ScrollView>
}
const s=StyleSheet.create({root:{flex:1,padding:24,paddingTop:56,backgroundColor:colors.background},heading:{fontSize:32,fontWeight:'700',color:colors.foreground},avatar:{width:104,height:104,borderRadius:52,backgroundColor:colors.panelRaised,alignSelf:'center',alignItems:'center',justifyContent:'center'},card:{backgroundColor:colors.panel,padding:20,gap:14,borderRadius:20,borderWidth:1,borderColor:colors.border},label:{fontSize:16,color:colors.foreground,fontWeight:'500'},input:{fontSize:17,color:colors.foreground,backgroundColor:colors.secondary,borderRadius:12,padding:14,minHeight:52},muted:{color:colors.muted,fontSize:14},linkButton:{minHeight:44,justifyContent:'center'},link:{color:colors.action,fontSize:16},row:{minHeight:48,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},button:{minHeight:54,borderRadius:14,backgroundColor:colors.action,alignItems:'center',justifyContent:'center'},buttonText:{color:'white',fontSize:16,fontWeight:'600'}});
