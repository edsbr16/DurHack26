import {getBackendUrl} from './config';
export const validRoomCode=(value:string)=>/^[A-HJ-NP-Z2-9]{6}$/.test(value.trim().toUpperCase());
type RoomResponse={code:string;host_key?:string};
async function request(path:string,method='GET'):Promise<RoomResponse> {
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
  try {
    const response=await fetch(`${getBackendUrl()}${path}`,{method,signal:controller.signal,cache:'no-store'});
    if(response.status===404)throw new Error(method==='POST'?'Room creation is unavailable. Update the backend.':'Room not found or expired. Check your code.');
    if(!response.ok)throw new Error(`Room request failed (${response.status}). Please try again.`);
    const data=await response.json();
    if(!validRoomCode(data.code||''))throw new Error('The backend returned an invalid room code.');
    return data;
  } catch(e){if(controller.signal.aborted)throw new Error('The room server took too long to respond. Please try again.');throw e;}
  finally{clearTimeout(timeout);}
}
export async function createArtRoom(){
  const room=await request('/api/rooms','POST');
  // Only this tab keeps the host key, so only the room's creator can randomize
  // the pattern. It never enters the URL, so invites cannot leak it.
  try{if(room.host_key)sessionStorage.setItem(`room-host-${room.code}`,room.host_key);}catch{/* Storage blocked: the room opens without host controls. */}
  return room.code;
}
export function checkArtRoom(value:string){
  if(!validRoomCode(value))return Promise.reject(new Error('Enter a valid six-character room code.'));
  return request(`/api/rooms/${encodeURIComponent(value.trim().toUpperCase())}`).then(room=>room.code);
}
