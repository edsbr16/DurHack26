import {getBackendUrl} from './config';
export const validRoomCode=(value:string)=>/^[A-HJ-NP-Z2-9]{6}$/.test(value.trim().toUpperCase());
async function request(path:string,method='GET') {
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
  try {
    const response=await fetch(`${getBackendUrl()}${path}`,{method,signal:controller.signal,cache:'no-store'});
    if(response.status===404)throw new Error(method==='POST'?'Room creation is unavailable. Update the backend.':'Room not found or expired. Check your code.');
    if(!response.ok)throw new Error(`Room request failed (${response.status}). Please try again.`);
    const data=await response.json();
    if(!validRoomCode(data.code||''))throw new Error('The backend returned an invalid room code.');
    return data.code as string;
  } catch(e){if(controller.signal.aborted)throw new Error('The room server took too long to respond. Please try again.');throw e;}
  finally{clearTimeout(timeout);}
}
export const createArtRoom=()=>request('/api/rooms','POST');
export function checkArtRoom(value:string){
  if(!validRoomCode(value))return Promise.reject(new Error('Enter a valid six-character room code.'));
  return request(`/api/rooms/${encodeURIComponent(value.trim().toUpperCase())}`);
}
