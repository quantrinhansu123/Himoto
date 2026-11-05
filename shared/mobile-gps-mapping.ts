import type {MobileWriteReceipt} from './mobile-contract';
import {gpsId} from './mobile-gps';
export interface MobileGpsMappingVehicle {id:number;revision:string;license:string;name:string;storeName:string}
export interface MobileGpsMappingDevice {id:number;provider:'protrack'|'iopgps';externalId:string;name:string;vehicleId:number|null;mappingStatus:string}
export interface MobileGpsMappingPreparation {device:MobileGpsMappingDevice;vehicle:MobileGpsMappingVehicle|null;snapshot:string;observedAt:string}
export interface MobileGpsMappingCandidates {deviceId:number;search:string;page:number;hasMore:boolean;rows:MobileGpsMappingVehicle[]}
export interface MobileGpsMappingInput {snapshot:string;vehicleId:number|null;vehicleRevision:string|null}
export interface MobileGpsMappingReceipt extends MobileWriteReceipt {requestId:string;device:MobileGpsMappingDevice;before:MobileGpsMappingVehicle|null;after:MobileGpsMappingVehicle|null;beforeSnapshot:string;mappingSnapshot:string;actorId:number;actorName:string;recordedAt:string;current:boolean}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=4000;
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const revision=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,19}$/.test(v);
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export function isGpsMappingVehicle(v:unknown):v is MobileGpsMappingVehicle {return object(v)&&gpsId(v.id)&&revision(v.revision)&&text(v.license)&&text(v.name)&&text(v.storeName);}
function isDevice(v:unknown):v is MobileGpsMappingDevice {return object(v)&&gpsId(v.id)&&['protrack','iopgps'].includes(String(v.provider))&&text(v.externalId)&&text(v.name)&&(v.vehicleId===null||gpsId(v.vehicleId))&&text(v.mappingStatus);}
export function isGpsMappingPreparation(v:unknown):v is MobileGpsMappingPreparation {
  return object(v)&&isDevice(v.device)&&(v.vehicle===null?v.device.vehicleId===null:isGpsMappingVehicle(v.vehicle)&&v.vehicle.id===v.device.vehicleId)&&hash(v.snapshot)&&date(v.observedAt);
}
export function isGpsMappingCandidates(v:unknown):v is MobileGpsMappingCandidates {
  return object(v)&&gpsId(v.deviceId)&&text(v.search)&&v.search.length<=120&&gpsId(v.page)&&v.page<=100000&&typeof v.hasMore==='boolean'&&
    Array.isArray(v.rows)&&v.rows.length<=25&&(!v.hasMore||v.rows.length===25)&&v.rows.every(isGpsMappingVehicle)&&new Set(v.rows.map(r=>r.id)).size===v.rows.length;
}
export function isGpsMappingInput(v:unknown):v is MobileGpsMappingInput {
  return object(v)&&Object.keys(v).length===3&&hash(v.snapshot)&&(v.vehicleId===null?v.vehicleRevision===null:gpsId(v.vehicleId)&&revision(v.vehicleRevision));
}
export function isGpsMappingReceipt(v:unknown):v is MobileGpsMappingReceipt {
  return object(v)&&gpsId(v.id)&&revision(v.revision)&&typeof v.replayed==='boolean'&&typeof v.requestId==='string'&&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v.requestId)&&isDevice(v.device)&&v.id===v.device.id&&
    (v.before===null?v.device.vehicleId===null:isGpsMappingVehicle(v.before)&&v.before.id===v.device.vehicleId)&&
    (v.after===null||isGpsMappingVehicle(v.after))&&hash(v.beforeSnapshot)&&hash(v.mappingSnapshot)&&gpsId(v.actorId)&&text(v.actorName)&&date(v.recordedAt)&&typeof v.current==='boolean';
}
export const gpsMappingOperation=(id:number)=>`gps.mapping:${id}`;
