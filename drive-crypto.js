/* Compatibility with the desktop extension's v4 encrypted Drive snapshots.
 * No credentials, access tokens or unencrypted client snapshots are sent to any
 * third party. This file intentionally has no network code.
 */
(()=>{'use strict';
const encoder=new TextEncoder();
const toB64=bytes=>{let out='';bytes=new Uint8Array(bytes);for(let i=0;i<bytes.length;i+=4096)out+=String.fromCharCode(...bytes.subarray(i,i+4096));return btoa(out);};
const fromB64=str=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));
async function keyFromPin(pin,salt){
 if(!/^\d{4}$/.test(pin))throw Error('숫자 4자리 PIN을 입력하세요.');
 const raw=await crypto.subtle.importKey('raw',encoder.encode(pin),'PBKDF2',false,['deriveBits']);
 const bytes=await crypto.subtle.deriveBits({name:'PBKDF2',salt:fromB64(salt),iterations:450000,hash:'SHA-256'},raw,256);
 return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function compress(text){if(!('CompressionStream' in window))throw Error('이 브라우저에서 gzip을 지원하지 않습니다. 최신 Safari/Chrome으로 업데이트해 주세요.');const s=new Blob([encoder.encode(text)]).stream().pipeThrough(new CompressionStream('gzip'));return new Uint8Array(await new Response(s).arrayBuffer());}
async function decompress(bytes){if(!('DecompressionStream' in window))throw Error('이 브라우저에서 gzip 해제를 지원하지 않습니다.');const s=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));return new Response(s).text();}
async function unseal(envelope,key){
 if(!envelope||envelope.app!=='wwtt-client-desk'||envelope.version!==4||!envelope.keySalt||!envelope.iv||!envelope.ciphertext||!envelope.revision)throw Error('PC 프로그램의 암호화 파일 형식이 아닙니다.');
 let decrypted;
 try{decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(envelope.iv)},key,fromB64(envelope.ciphertext));}
 catch{throw Error('PIN이 다르거나 파일에 문제가 있습니다. 원본 파일은 변경하지 않았습니다.');}
 const snapshot=JSON.parse(await decompress(new Uint8Array(decrypted)));
 if(!snapshot||!Array.isArray(snapshot.columns)||!snapshot.columns.length||!Array.isArray(snapshot.rows)||snapshot.rows.length>100000)throw Error('거래처 데이터 형식이 올바르지 않습니다.');
 return snapshot;
}
async function seal(snapshot,key,salt){const iv=crypto.getRandomValues(new Uint8Array(12));const binary=await compress(JSON.stringify(snapshot));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,binary);return {app:'wwtt-client-desk',version:4,revision:crypto.randomUUID(),updatedAt:Date.now(),keySalt:salt,iv:toB64(iv),ciphertext:toB64(ciphertext)};}
window.WWTT_CRYPTO={toB64,fromB64,keyFromPin,unseal,seal};
})();
