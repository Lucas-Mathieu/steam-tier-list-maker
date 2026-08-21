export type ProfileKind = 'steamId64' | 'vanity';
export function parseSteamProfileInput(value:string): {value:string; kind:ProfileKind} | null {
  const input=value.trim().replace(/\/+$/, ''); if (!input) return null;
  if (/^\d{17}$/.test(input)) return {value:input,kind:'steamId64'};
  let match=input.match(/^https?:\/\/(?:www\.)?steamcommunity\.com\/(profiles|id)\/([^/?#]+)$/i);
  if (match) return match[1].toLowerCase()==='profiles' && /^\d{17}$/.test(match[2]) ? {value:match[2],kind:'steamId64'} : match[1].toLowerCase()==='id' && /^[\w-]{1,64}$/.test(match[2]) ? {value:match[2],kind:'vanity'} : null;
  return /^[\w-]{1,64}$/.test(input) ? {value:input,kind:'vanity'} : null;
}
export const steamArtworkUrl=(appid:number)=>`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`;
export const formatPlaytime=(minutes:number)=>minutes ? `${Math.floor(minutes/60)}h ${minutes%60}m` : 'Never played';
