import {useEffect,useMemo,useRef,useState} from 'react';
import {FlatList,Modal,Platform,Pressable,RefreshControl,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQuery} from '@tanstack/react-query';
import {uuid} from 'expo';
import {Image} from 'expo-image';
import {openURL} from 'expo-linking';
import {useSession} from '@/providers/session';
import {useDebouncedValue} from '@/hooks/use-debounced-value';
import {Button,Card,InlineError,PaginationBar,SegmentedBar,SkeletonList,StateView,StatusBadge} from '@/components/ui';
import {ChoiceField,FormField} from '@/components/form-fields';
import {EditorSheet,ConfirmEdit} from '@/components/editor-sheet';
import {selectRecordMediaPhotos,type RecordMediaPhoto} from '@/lib/record-media-photo';
import {supportFormData} from '@/lib/support-form-data';
import {GUIDE_WORKFLOWS} from '../../../shared/user-guide';
import {FAQ_CATEGORIES,type GuideFaq} from '../../../shared/guide-faq';
import {dateTime,useTheme} from '@/theme';

function FaqEditor({row,name,onClose,onSaved}:{row:GuideFaq|null;name:string;onClose:()=>void;onSaved:()=>void}) {
  const {api,session}=useSession(),theme=useTheme();
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
        {keep.map(id=>{const src=api!.supportPhoto('guide-faq',String(id));return <View key={id} style={{gap:8}}><Image cachePolicy="memory" source={{...src,cacheKey:JSON.stringify([session!.user.id,session!.sessionId||session!.expiresAt,src.uri])}} style={{width:'100%',aspectRatio:4/3,borderRadius:12}} contentFit="contain" accessibilityLabel={`Ảnh câu trả lời #${id}`}/><Button secondary label={`Bỏ ảnh đã lưu #${id}`} disabled={disabled} onPress={()=>setKeep(items=>items.filter(value=>value!==id))}/></View>;})}
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

function FaqList({onZoom}:{onZoom:(uri:string,headers?:Record<string,string>)=>void}) {
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
        {query.isPending&&<SkeletonList count={3} lines={3}/>}
        {query.isError&&<StateView title="Chưa tải được hỏi đáp" message={query.error.message} retry={()=>{void query.refetch();}}/>}
      </View>}
      renderItem={({item:row})=><Card style={{gap:9,padding:13}}>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
          <Text style={{color:theme.primary,fontSize:12.5,fontWeight:'700',flex:1}}>{row.category}</Text>
          <StatusBadge status={row.answer||row.images.length?'answered':'pending'} label={row.answer||row.images.length?'Đã trả lời':'Chờ trả lời'} />
        </View>
        <Text selectable style={{color:theme.text,fontSize:16,fontWeight:'700',lineHeight:23}}>{row.question}</Text>
        <Text style={{color:theme.muted,fontSize:12.5}}>{row.asker_name} · {dateTime(row.created_at)}</Text>
        {!!row.answer&&<Text selectable style={{color:theme.text,fontSize:14.5,lineHeight:22}}>{row.answer}</Text>}
        {!!row.answerer_name&&<Text style={{color:theme.muted,fontSize:12.5}}>Trả lời: {row.answerer_name}</Text>}
        {row.images.map(id=>{const src=api!.supportPhoto('guide-faq',String(id));return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`Phóng to ảnh minh họa câu trả lời #${id}`} onPress={()=>onZoom(src.uri,src.headers)}><Image cachePolicy="memory" source={{...src,cacheKey:JSON.stringify([session!.user.id,session!.sessionId||session!.expiresAt,src.uri])}} style={{width:'100%',aspectRatio:4/3,borderRadius:10}} contentFit="contain" accessibilityLabel={`Ảnh minh họa câu trả lời #${id}`}/></Pressable>;})}
        {query.data?.can_answer&&<Button size="sm" secondary label={row.answer||row.images.length?'Sửa trả lời':'Trả lời câu hỏi'} onPress={()=>setEditor({row})}/>}
      </Card>}
      ListEmptyComponent={!query.isPending&&!query.isError?<StateView title="Chưa có câu hỏi phù hợp" />:undefined}
      ListFooterComponent={query.data?<PaginationBar page={query.data.page} total={query.data.total} unit="câu hỏi" hasNext={query.data.hasMore} disabled={query.isFetching} onChange={setPage} />:undefined}/>
    {editor&&<FaqEditor row={editor.row} name={query.data?.user_name||session!.user.name} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);void query.refetch();}}/>}
  </>;
}

const foldVi=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();

export default function Guide() {
  const theme=useTheme(),{api}=useSession();
  const [downloadError,setDownloadError]=useState('');
  const [tab,setTab]=useState<'guide'|'manual'|'faq'>('guide'),[workflow,setWorkflow]=useState(GUIDE_WORKFLOWS[0].id),[step,setStep]=useState(0);
  const [guideSearch,setGuideSearch]=useState(''),[chapterId,setChapterId]=useState('1');
  const [zoomImage,setZoomImage]=useState<{uri:string;headers?:Record<string,string>}|null>(null);
  const manualQuery=useQuery({queryKey:['guide-manual',api?.origin],queryFn:({signal})=>api!.guideManual(signal),enabled:!!api&&tab==='manual',staleTime:300_000});
  const matchingWorkflows=useMemo(()=>{
    const needle=foldVi(guideSearch.trim());
    if(!needle)return GUIDE_WORKFLOWS;
    return GUIDE_WORKFLOWS.filter(w=>foldVi(`${w.name} ${w.description} ${w.steps.map(s=>`${s.title} ${s.short} ${s.place} ${s.actions.join(' ')}`).join(' ')}`).includes(needle));
  },[guideSearch]);
  const selected=matchingWorkflows.find(item=>item.id===workflow)||matchingWorkflows[0]||GUIDE_WORKFLOWS[0];
  const current=selected.steps[Math.min(step,selected.steps.length-1)];
  const chapters=manualQuery.data?.chapters||[];
  const activeChapter=chapters.find(c=>c.id===chapterId)||chapters[0];
  const cleanInline=(raw:string)=>raw.replace(/\*\*([^*]+)\*\*/g,'$1').replace(/`([^`]+)`/g,'$1');
  return <SafeAreaView edges={['bottom','left','right']} style={{flex:1,backgroundColor:theme.background}}>
    <View style={{paddingHorizontal:16,paddingTop:14,paddingBottom:6,gap:10,maxWidth:760,width:'100%',alignSelf:'center'}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:22,fontWeight:'800'}}>Hướng dẫn & Hỏi đáp</Text>
      <SegmentedBar value={tab} onChange={setTab} options={[{value:'guide',label:'Quy trình'},{value:'manual',label:'Sổ tay (17)'},{value:'faq',label:'Hỏi đáp'}]} />
    </View>
    {tab==='faq'?<FaqList onZoom={(uri,headers)=>setZoomImage({uri,headers})}/>:tab==='manual'?<ScrollView contentContainerStyle={{padding:16,gap:14,maxWidth:760,width:'100%',alignSelf:'center'}}>
      {manualQuery.isPending?<SkeletonList count={3} lines={4}/>:manualQuery.isError?<StateView title="Chưa tải được sổ tay" message={manualQuery.error.message} retry={()=>void manualQuery.refetch()}/>:<>
        <ChoiceField label="Chương sổ tay hướng dẫn" value={activeChapter?.id||''} choices={chapters.map(c=>({value:c.id,label:c.title}))} searchable onChange={setChapterId}/>
        {activeChapter&&<Card style={{gap:12}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'800'}}>{activeChapter.title}</Text>
          {activeChapter.body.split(/\r?\n\r?\n/).map((block,idx)=>{
            const trimmed=block.trim();
            if(!trimmed||/^---+$/.test(trimmed))return null;
            const img=/^!\[([^\]]*)\]\(([^)]+)\)$/.exec(trimmed);
            if(img){
              const uri=img[2].startsWith('images/')?`${api!.origin}/help/${img[2]}`:img[2];
              return <Pressable key={idx} accessibilityRole="button" accessibilityLabel={`Phóng to ảnh ${img[1]}`} onPress={()=>setZoomImage({uri})}><View style={{gap:4}}><Image cachePolicy="memory-disk" source={{uri}} style={{width:'100%',aspectRatio:16/10,borderRadius:12,backgroundColor:theme.background}} contentFit="contain"/><Text style={{color:theme.muted,fontSize:12,textAlign:'center'}}>{img[1]} (Chạm để phóng to)</Text></View></Pressable>;
            }
            const heading=/^(#{1,4})\s+(.+)$/.exec(trimmed);
            if(heading){
              const level=heading[1].length;
              return <Text key={idx} accessibilityRole="header" style={{color:theme.text,fontSize:level===1?19:level===2?17:15.5,fontWeight:'800',marginTop:4}}>{cleanInline(heading[2])}</Text>;
            }
            if(trimmed.startsWith('```')&&trimmed.endsWith('```')){
              const code=trimmed.replace(/^```[^\n]*\n?/,'').replace(/\n?```$/,'');
              return <View key={idx} style={{padding:12,borderRadius:10,backgroundColor:theme.background,borderWidth:1,borderColor:theme.border}}><Text selectable style={{color:theme.text,fontSize:13,lineHeight:19,fontFamily:Platform.OS==='ios'?'Menlo':'monospace'}}>{code}</Text></View>;
            }
            const lines=trimmed.split(/\r?\n/);
            if(lines.length>=2&&lines.every(l=>l.trim().startsWith('|'))){
              const tableRows=lines.filter(l=>!/^\|[\s\-:|]+\|$/.test(l.trim())).map(l=>l.trim().replace(/^\||\|$/g,'').split('|').map(c=>cleanInline(c.trim())));
              const headers=tableRows[0]||[];
              return <View key={idx} style={{borderWidth:1,borderColor:theme.border,borderRadius:10,overflow:'hidden'}}>
                {tableRows.slice(1).map((r,rIdx)=><View key={rIdx} style={{padding:10,borderTopWidth:rIdx>0?1:0,borderTopColor:theme.border,backgroundColor:rIdx%2===0?theme.surface:theme.background,gap:3}}>
                  {r.map((cell,cIdx)=><Text key={cIdx} selectable style={{color:theme.text,fontSize:13.5,lineHeight:20}}><Text style={{color:theme.muted,fontWeight:'700'}}>{headers[cIdx]?`${headers[cIdx]}: `:''}</Text>{cell}</Text>)}
                </View>)}
              </View>;
            }
            if(lines.every(l=>/^(\s*[-*•]|\s*\d+\.)\s+/.test(l))){
              return <View key={idx} style={{gap:5}}>
                {lines.map((l,lIdx)=><Text key={lIdx} selectable style={{color:theme.text,fontSize:14.5,lineHeight:22}}>• {cleanInline(l.replace(/^(\s*[-*•]|\s*\d+\.)\s+/,''))}</Text>)}
              </View>;
            }
            if(lines.every(l=>l.trim().startsWith('>'))){
              return <View key={idx} style={{paddingLeft:12,borderLeftWidth:3,borderLeftColor:theme.primary,gap:4}}>
                {lines.map((l,lIdx)=><Text key={lIdx} selectable style={{color:theme.muted,fontSize:14,lineHeight:21}}>{cleanInline(l.replace(/^\s*>\s?/,''))}</Text>)}
              </View>;
            }
            return <Text key={idx} selectable style={{color:theme.text,fontSize:14.5,lineHeight:22}}>{cleanInline(trimmed)}</Text>;
          })}
        </Card>}
      </>}
    </ScrollView>:<ScrollView contentContainerStyle={{padding:16,gap:14,maxWidth:760,width:'100%',alignSelf:'center'}}>
      <FormField label="Tìm nhanh quy trình / bước thao tác" value={guideSearch} onChangeText={v=>{setGuideSearch(v);setStep(0);}} placeholder="Nhập từ khóa: thuê xe, gia hạn, trả xe, chấm công…" maxLength={120}/>
      <ChoiceField label="Nghiệp vụ cần hướng dẫn" value={selected.id} choices={matchingWorkflows.map(item=>({value:item.id,label:item.name}))} onChange={value=>{setWorkflow(value);setStep(0);}}/>
      <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>{selected.description}</Text>
      <Button secondary label="Tải hướng dẫn và ảnh" onPress={()=>{void openURL(api!.origin+'/help/HIMOTO-huong-dan-su-dung.zip').catch(()=>setDownloadError('Chưa mở được tệp hướng dẫn. Kiểm tra mạng rồi thử lại.'));}}/>
      {!!downloadError&&<InlineError message={downloadError}/>}
      <ChoiceField label="Bước thao tác" value={String(Math.min(step,selected.steps.length-1))} choices={selected.steps.map((item,index)=>({value:String(index),label:`${index+1}. ${item.short}`}))} onChange={value=>setStep(Number(value))}/>
      <Card style={{gap:16}}><Text style={{color:theme.primary,fontSize:13,fontWeight:'700'}}>BƯỚC {Math.min(step,selected.steps.length-1)+1} / {selected.steps.length}</Text><Text accessibilityRole="header" style={{color:theme.text,fontSize:22,fontWeight:'800',lineHeight:30}}>{current.title}</Text>
        <Text style={{color:theme.muted,lineHeight:23}}>{current.place}</Text>
        {current.image&&<Pressable accessibilityRole="button" accessibilityLabel={`Phóng to ảnh minh họa ${current.title}`} onPress={()=>setZoomImage({uri:`${api!.origin}/help/images/${current.image}`})}><Image cachePolicy="memory-disk" source={{uri:`${api!.origin}/help/images/${current.image}`}} style={{width:'100%',aspectRatio:16/10,borderRadius:12,backgroundColor:theme.background}} contentFit="contain" accessibilityLabel={`Ảnh minh họa ${current.title}`}/></Pressable>}
        {current.actions.map((action,index)=><View key={action} style={{flexDirection:'row',gap:10}}><Text style={{color:theme.primary,fontWeight:'700'}}>{index+1}.</Text><Text style={{color:theme.text,fontSize:16,lineHeight:25,flex:1}}>{action}</Text></View>)}
        {current.note&&<Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>{current.note}</Text>}
        {current.table&&<View style={{gap:12}}>{current.table.rows.map((row,index)=><View key={index} style={{paddingVertical:8,borderBottomWidth:1,borderColor:theme.border,gap:5}}>{row.map((cell,column)=><Text key={column} style={{color:theme.text,lineHeight:22}}>{current.table!.headers[column]}: {cell}</Text>)}</View>)}</View>}
        {current.telegram&&current.telegram.map(line=><Text key={line} style={{color:theme.text,lineHeight:24}}>• {line}</Text>)}
        <Text style={{color:theme.success,fontSize:16,fontWeight:'600',lineHeight:25}}>Kiểm tra: {current.check}</Text>
      </Card>
      <View style={{flexDirection:'row',gap:8}}>
        <Button size="sm" equalWidth secondary label="Bước trước" disabled={step<=0} onPress={()=>setStep(value=>value-1)}/>
        <Button size="sm" equalWidth label="Bước tiếp theo" disabled={step>=selected.steps.length-1} onPress={()=>setStep(value=>value+1)}/>
      </View>
    </ScrollView>}
    {zoomImage&&<Modal visible transparent animationType="fade" onRequestClose={()=>setZoomImage(null)}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,0.88)',justifyContent:'center',padding:16,gap:14}}>
        <Image cachePolicy="memory-disk" source={zoomImage} style={{width:'100%',height:'78%'}} contentFit="contain"/>
        <Button secondary label="Đóng ảnh phóng to" onPress={()=>setZoomImage(null)}/>
      </View>
    </Modal>}
  </SafeAreaView>;
}
