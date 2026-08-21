export interface Game { appid:number; name:string; playtimeForever:number; playtime2Weeks?:number }
export interface Tier { id:string; label:string; gameIds:number[]; custom?:boolean }
export interface TierState { steamId:string; tiers:Tier[]; unranked:number[]; notRanking:number[]; version:1; updatedAt:string }
export const DEFAULT_TIERS = ['S','A','B','C','D','F'];
