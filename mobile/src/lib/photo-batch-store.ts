import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import {File,Paths} from 'expo-file-system';
import {uuid} from 'expo';
import type {BatchPhoto,PhotoBatchStore} from './photo-batch';
let opening:Promise<SQLite.SQLiteDatabase>|undefined;
async function database(){
  if(!opening)opening=(async()=>{
    const name='himoto.mobile.photo-batch-key.v1';let key=await SecureStore.getItemAsync(name);
    if(!key){key=(uuid.v4()+uuid.v4()).replaceAll('-','');await SecureStore.setItemAsync(name,key,{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});}
    if(!/^[a-f0-9]{64}$/.test(key))throw Error('Không mở được kho ảnh an toàn.');
    const db=await SQLite.openDatabaseAsync('himoto-photo-batches-v1.db');
    if(!await db.getFirstAsync('PRAGMA cipher_version')){await db.closeAsync();throw Error('Cần cài APK mới để giữ bộ ảnh an toàn.');}
    await db.execAsync(`PRAGMA key='${key}';PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS photos(scope TEXT NOT NULL,id TEXT NOT NULL,metadata TEXT NOT NULL,bytes BLOB NOT NULL,sequence INTEGER NOT NULL,PRIMARY KEY(scope,id));`);
    return db;
  })().catch(error=>{opening=undefined;throw error;});return opening;
}
export async function openPhotoBatchStore(scope:string):Promise<PhotoBatchStore>{
  const db=await database();
  return {
    async list(){return(await db.getAllAsync<{metadata:string}>('SELECT metadata FROM photos WHERE scope=? ORDER BY sequence,id',scope)).map(row=>JSON.parse(row.metadata) as BatchPhoto);},
    async add(row,photo){const bytes=new Uint8Array(await photo.bytes());if(bytes.byteLength!==row.size||bytes.length>2097152)throw Error('Ảnh chuẩn bị không khớp.');await db.runAsync('INSERT INTO photos(scope,id,metadata,bytes,sequence) VALUES(?,?,?,?,?)',scope,row.id,JSON.stringify(row),bytes,Date.now());},
    async update(row){const result=await db.runAsync('UPDATE photos SET metadata=? WHERE scope=? AND id=?',JSON.stringify(row),scope,row.id);if(result.changes!==1)throw Error('Chưa lưu được tiến độ bộ ảnh.');},
    async photo(row){const stored=await db.getFirstAsync<{bytes:Uint8Array}>('SELECT bytes FROM photos WHERE scope=? AND id=?',scope,row.id);if(!stored||stored.bytes.byteLength!==row.size)throw Error('Chưa đọc được ảnh đã giữ trên thiết bị.');const file=new File(Paths.cache,`batch-${uuid.v4().toLowerCase()}.jpg`);file.create({overwrite:false});file.write(stored.bytes);return{uri:file.uri,width:row.width,height:row.height,size:row.size,mimeType:'image/jpeg',bytes:async()=>{const bytes=await file.arrayBuffer();if(bytes.byteLength!==row.size)throw Error('Ảnh không khớp.');return bytes;},dispose:()=>{if(file.exists)file.delete();}};},
    async remove(id){await db.runAsync('DELETE FROM photos WHERE scope=? AND id=?',scope,id);},
  };
}
