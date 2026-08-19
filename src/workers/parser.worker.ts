/// <reference lib="webworker" />
import { parseAndAnalyze } from '@/lib/parsers';

self.onmessage=(event:MessageEvent<{buffer:ArrayBuffer}>)=>{
  try{
    const content=new TextDecoder().decode(event.data.buffer);
    self.postMessage({ok:true,result:parseAndAnalyze(content)});
  }catch(error){
    self.postMessage({ok:false,error:error instanceof Error?error.message:'Não foi possível analisar o arquivo.'});
  }
};
export {};
