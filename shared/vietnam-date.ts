export function vietnamDate(now=new Date()){return new Date(now.getTime()+7*3600000).toISOString().slice(0,10);}
