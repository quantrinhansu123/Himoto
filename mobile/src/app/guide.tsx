import {useEffect,useRef,useState} from 'react';
import {FlatList,Platform,RefreshControl,ScrollView,Text,View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {uuid} from 'expo';
import {Image} from 'expo-image';
import {openURL} from 'expo-linking';
import {useSession} from '@/providers/session';
import {useDebouncedValue} from '@/hooks/use-debounced-value';
import {Button,Card,InlineError,StateView} from '@/components/ui';
import {ChoiceField,FormField} from '@/components/form-fields';
import {EditorSheet,ConfirmEdit} from '@/components/editor-sheet';
import {selectRecordMediaPhotos,type RecordMediaPhoto} from '@/lib/record-media-photo';
import {supportFormData} from '@/lib/support-form-data';
import {GUIDE_WORKFLOWS} from '../../../shared/user-guide';
import {FAQ_CATEGORIES,type GuideFaq} from '../../../shared/guide-faq';
import {dateTime,useTheme} from '@/theme';

function FaqEditor({row,name,onClose,onSaved}:{row:GuideFaq|null;name:string;onClose:()=>void;onSaved:()=>void}) {
  const {api}=useSession(),theme=useTheme();
  const [category,setCategory]=useState<string>(FAQ_CATEGORIES[0]),[question,setQuestion]=useState(''),[answer,setAnswer]=useState(row?.answer||''),[keep,setKeep]=useState(row?.images||[]),[photos,setPhotos]=useState<RecordMediaPhoto[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[closing,setClosing]=useState(false);
  const lock=useRef(false),request=useRef(uuid.v4().toLowerCase()),alive=useRef(true),current=useRef(photos);
  useEffect(()=>{current.current=photos;},[photos]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;current.current.forEach(photo=>photo.dispose());};},[]);
  async function pick(camera=false){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await selectRecordMediaPhotos(camera,new AbortController().signal,next=>{if(!alive.current){next.dispose();return;}setPhotos(items=>[...items,next]);});}catch(failure){setError((failure as Error).message);}finally{lock.current=false;if(alive.current)setBusy(false);}}
  async function save(){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try {
      const fields:Record<string,string>=row?{action:'answer',id:String(row.id),revision:String(row.revision),answer,keep_images:JSON.stringify(keep)}:{action:'ask',category,question,request_id:request.current};
      const body=await supportFormData(fields,undefined,photos);
      await api!.saveGuideFaq(body);if(alive.current)onSaved();
    }catch(failure){if(alive.current){setUncertain(true);setError((failure as Error).message);}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  const disabled=busy||uncertain;
  return <EditorSheet title={row?'Trả lời câu hỏi':'Đặt câu hỏi'} onClose={()=>{if(!busy)setClosing(true);}}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,gap:16}}>
      {row?<>
        <Text style={{color:theme.text,fontSize:18,fontWeight:'700',lineHeight:26}}>{row.question}</Text><Text style={{color:theme.muted}}>{row.asker_name} · {row.category}</Text>
        <FormField label="Câu trả lời" value={answer} onChangeText={setAnswer} editable={!disabled} multiline maxLength={10000}/>
        <Text style={{color:theme.muted,lineHeight:22}}>Tối đa 10 ảnh; mỗi ảnh được chuẩn bị dưới 2 MB.</Text>
        {keep.map(id=><View key={id} style={{gap:8}}><Image cachePolicy="none" source={api!.supportPhoto('guide-faq',String(id))} style={{width:'100%',aspectRatio:4/3,borderRadius:12}} contentFit="contain" accessibilityLabel={`Ảnh câu trả lời #${id}`}/><Button secondary label={`Bỏ ảnh đã lưu #${id}`} disabled={disabled} onPress={()=>setKeep(items=>items.filter(value=>value!==id))}/></View>)}
        {photos.map((photo,index)=><View key={photo.uri} style={{gap:8}}><Image cachePolicy="none" source={{uri:photo.uri}} style={{width:'100%',aspectRatio:4/3,borderRadius:12}} contentFit="contain" accessibilityLabel={`Ảnh mới ${index+1}`}/><Button secondary label={`Bỏ ảnh mới ${index+1}`} disabled={disabled} onPress={()=>{setPhotos(items=>items.filter(item=>item!==photo));photo.dispose();}}/></View>)}
        <Button secondary label="Chọn ảnh trả lời" disabled={disabled||keep.length+photos.length>=10} onPress={()=>{void pick();}}/>
        {Platform.OS!=='web'&&<Button secondary label="Chụp ảnh trả lời" disabled={disabled||keep.length+photos.length>=10} onPress={()=>{void pick(true);}}/>}
      </>:<>
        <ChoiceField label="Hạng mục câu hỏi" value={category} choices={FAQ_CATEGORIES.map(item=>({value:item,label:item}))} onChange={setCategory} disabled={disabled}/>
        <FormField label="Câu hỏi" value={question} onChangeText={setQuestion} editable={!disabled} multiline maxLength={2000}/>
        <Text style={{color:theme.muted,lineHeight:22}}>Người hỏi: {name}</Text>
      </>}
      {!!error&&<InlineError message={error}/>}
      {uncertain&&<Text style={{color:theme.muted,lineHeight:23}}>Nội dung và ảnh đang được giữ. Thử lại với cùng dữ liệu; nếu máy chủ báo phiên bản đã thay đổi, đóng biểu mẫu và làm mới để kiểm tra.</Text>}
      <Button label={uncertain?'Thử lại cùng nội dung':row?'Lưu câu trả lời':'Gửi câu hỏi'} loading={busy} disabled={row?!answer.trim()&&!keep.length&&!photos.length:!question.trim()} onPress={()=>{void save();}}/>
    </ScrollView>
    {closing&&<ConfirmEdit title="Đóng biểu mẫu?" message="Thông tin chưa xác nhận và ảnh mới đang chọn sẽ không được giữ trong biểu mẫu. Nếu vừa gửi bị mất kết nối, làm mới danh sách để kiểm tra kết quả." confirmLabel="Đóng biểu mẫu" onCancel={()=>setClosing(false)} onConfirm={onClose}/>}
  </EditorSheet>;
}

function FaqList() {
  const {api,session}=useSession(),theme=useTheme();
  const [category,setCategory]=useState(''),[status,setStatus]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[editor,setEditor]=useState<{row:GuideFaq|null}|null>(null);
  const debounced=useDebouncedValue(search,300);
  const query=useQuery({queryKey:['guide-faq',session!.user.id,category,status,debounced,page],queryFn:({signal})=>api!.guideFaq(new URLSearchParams({category,status,search:debounced,page:String(page)}).toString(),signal)});
  return <>
    <FlatList data={query.data?.rows||[]} keyExtractor={row=>String(row.id)} contentContainerStyle={{padding:20,gap:16,maxWidth:800,width:'100%',alignSelf:'center'}} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={()=>{void query.refetch();}} tintColor={theme.primary}/>}
      ListHeaderComponent={<View style={{gap:16}}>
        <Button label="Đặt câu hỏi" onPress={()=>setEditor({row:null})}/>
        <FormField label="Tìm câu hỏi" value={search} onChangeText={value=>{setSearch(value);setPage(1);}} maxLength={120} placeholder="Câu hỏi, câu trả lời, người hỏi…"/>
        <ChoiceField label="Hạng mục hỏi đáp" value={category} choices={[{value:'',label:'Tất cả hạng mục'},...FAQ_CATEGORIES.map(item=>({value:item,label:item}))]} onChange={value=>{setCategory(value);setPage(1);}}/>
        <ChoiceField label="Trạng thái câu hỏi" value={status} choices={[{value:'',label:'Tất cả'},{value:'answered',label:'Đã trả lời'},{value:'pending',label:'Chờ trả lời'}]} onChange={value=>{setStatus(value);setPage(1);}}/>
        {query.isPending&&<StateView loading title="Đang tải hỏi đáp"/>}
        {query.isError&&<StateView title="Chưa tải được hỏi đáp" message={query.error.message} retry={()=>{void query.refetch();}}/>}
      </View>}
      renderItem={({item:row})=><Card style={{gap:12}}>
        <Text style={{color:theme.primary,fontSize:13,fontWeight:'700'}}>{row.category} · {row.answer||row.images.length?'Đã trả lời':'Chờ trả lời'}</Text>
        <Text selectable style={{color:theme.text,fontSize:18,fontWeight:'700',lineHeight:26}}>{row.question}</Text>
        <Text style={{color:theme.muted,fontSize:13,lineHeight:21}}>{row.asker_name} · {dateTime(row.created_at)}</Text>
        {!!row.answer&&<Text selectable style={{color:theme.text,fontSize:16,lineHeight:25}}>{row.answer}</Text>}
        {!!row.answerer_name&&<Text style={{color:theme.muted}}>Trả lời: {row.answerer_name}</Text>}
        {row.images.map(id=><Image cachePolicy="none" key={id} source={api!.supportPhoto('guide-faq',String(id))} style={{width:'100%',aspectRatio:4/3,borderRadius:12}} contentFit="contain" accessibilityLabel={`Ảnh minh họa câu trả lời #${id}`}/>)}
        {query.data?.can_answer&&<Button secondary label={`Trả lời câu hỏi #${row.id}`} onPress={()=>setEditor({row})}/>}
      </Card>}
      ListEmptyComponent={!query.isPending&&!query.isError?<Text style={{color:theme.muted,padding:20,textAlign:'center'}}>Chưa có câu hỏi phù hợp.</Text>:undefined}
      ListFooterComponent={query.data?<View style={{gap:10}}><Text style={{color:theme.muted}}>Trang {query.data.page} · {query.data.total} câu hỏi</Text><Button secondary label="Trang câu hỏi trước" disabled={page<=1||query.isFetching} onPress={()=>setPage(value=>value-1)}/><Button secondary label="Trang câu hỏi sau" disabled={!query.data.hasMore||query.isFetching} onPress={()=>setPage(value=>value+1)}/></View>:undefined}/>
    {editor&&<FaqEditor row={editor.row} name={query.data?.user_name||session!.user.name} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);void query.refetch();}}/>}
  </>;
}

export default function Guide() {
  const theme=useTheme(),{api}=useSession();
  const [downloadError,setDownloadError]=useState('');
  const [tab,setTab]=useState<'guide'|'faq'>('guide'),[workflow,setWorkflow]=useState(GUIDE_WORKFLOWS[0].id),[step,setStep]=useState(0);
  const selected=GUIDE_WORKFLOWS.find(item=>item.id===workflow)!,current=selected.steps[step];
  return <View style={{flex:1}}>
    <View style={{paddingHorizontal:20,paddingTop:16,gap:10}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:27,fontWeight:'800'}}>Hướng dẫn và hỏi đáp</Text><View style={{flexDirection:'row',gap:10}}><View style={{flex:1}}><Button secondary={tab!=='guide'} label="Hướng dẫn" onPress={()=>setTab('guide')}/></View><View style={{flex:1}}><Button secondary={tab!=='faq'} label="Hỏi đáp" onPress={()=>setTab('faq')}/></View></View></View>
    {tab==='faq'?<FaqList/>:<ScrollView contentContainerStyle={{padding:20,gap:18,maxWidth:800,width:'100%',alignSelf:'center'}}>
      <ChoiceField label="Nghiệp vụ cần hướng dẫn" value={workflow} choices={GUIDE_WORKFLOWS.map(item=>({value:item.id,label:item.name}))} onChange={value=>{setWorkflow(value);setStep(0);}}/>
      <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>{selected.description}</Text>
      <Button secondary label="Tải hướng dẫn và ảnh" onPress={()=>{void openURL(api!.origin+'/help/HIMOTO-huong-dan-su-dung.zip').catch(()=>setDownloadError('Chưa mở được tệp hướng dẫn. Kiểm tra mạng rồi thử lại.'));}}/>
      {!!downloadError&&<InlineError message={downloadError}/>}
      <ChoiceField label="Bước thao tác" value={String(step)} choices={selected.steps.map((item,index)=>({value:String(index),label:`${index+1}. ${item.short}`}))} onChange={value=>setStep(Number(value))}/>
      <Card style={{gap:16}}><Text style={{color:theme.primary,fontSize:13,fontWeight:'700'}}>BƯỚC {step+1} / {selected.steps.length}</Text><Text accessibilityRole="header" style={{color:theme.text,fontSize:22,fontWeight:'800',lineHeight:30}}>{current.title}</Text>
        <Text style={{color:theme.muted,lineHeight:23}}>{current.place}</Text>
        {current.actions.map((action,index)=><View key={action} style={{flexDirection:'row',gap:10}}><Text style={{color:theme.primary,fontWeight:'700'}}>{index+1}.</Text><Text style={{color:theme.text,fontSize:16,lineHeight:25,flex:1}}>{action}</Text></View>)}
        {current.note&&<Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>{current.note}</Text>}
        {current.table&&<View style={{gap:12}}>{current.table.rows.map((row,index)=><View key={index} style={{paddingVertical:8,borderBottomWidth:1,borderColor:theme.border,gap:5}}>{row.map((cell,column)=><Text key={column} style={{color:theme.text,lineHeight:22}}>{current.table!.headers[column]}: {cell}</Text>)}</View>)}</View>}
        {current.telegram&&current.telegram.map(line=><Text key={line} style={{color:theme.text,lineHeight:24}}>• {line}</Text>)}
        <Text style={{color:theme.success,fontSize:16,fontWeight:'600',lineHeight:25}}>Kiểm tra: {current.check}</Text>
      </Card>
      <Button label="Bước tiếp theo" disabled={step>=selected.steps.length-1} onPress={()=>setStep(value=>value+1)}/><Button secondary label="Bước trước" disabled={step<=0} onPress={()=>setStep(value=>value-1)}/>
    </ScrollView>}
  </View>;
}
