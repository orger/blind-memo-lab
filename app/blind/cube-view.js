import {FACE_COLORS,stickerInfo,pieceInfo} from './cube.js';

const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const length=Math.hypot(...a);return a.map(v=>v/length);};
function projector(camera,scale,cx,cy) {
  const depth=unit(camera),right=unit(cross([0,1,0],depth)),up=cross(depth,right);
  return {point:p=>[cx+dot(p,right)*scale,cy-dot(p,up)*scale],depth:p=>dot(p,depth)};
}
const points=(quad,project)=>quad.map(p=>project.point(p).map(v=>v.toFixed(2)).join(',')).join(' ');
function faceQuad(normal,center=[0,0,0],half=.92,plane=1) {
  const axis=normal.findIndex(v=>v!==0),a=(axis+1)%3,b=(axis+2)%3;
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>{
    const p=center.slice(); p[axis]=normal[axis]*plane;p[a]+=u*half;p[b]+=v*half;return p;
  });
}
const center=quad=>[0,1,2].map(i=>quad.reduce((s,p)=>s+p[i],0)/4);
const normalFor=(axis,sign)=>[0,1,2].map(i=>i===axis?sign:0);
const FACE_NAMES={U:'white',D:'yellow',F:'green',B:'blue',L:'orange',R:'red'};

/** Each piece is viewed from its outside diagonal so all of its stickers show.
 * Position in the color frame stays explicit through tiny face labels. */
export function renderPiece(letter,{kind='corners',hideLetter=true}={}) {
  const info=stickerInfo(letter,kind),group=info.group;
  const camera=group.position.map(v=>v||1),project=projector(camera,28,64,61);
  const faces=[];
  for(let axis=0;axis<3;axis++) {
    const sign=camera[axis],normal=normalFor(axis,sign),quad=faceQuad(normal);
    const sticker=[...group.letters].map(l=>stickerInfo(l,kind)).find(s=>s.normal.every((v,i)=>v===normal[i]));
    faces.push({quad,sticker});
  }
  faces.sort((a,b)=>project.depth(center(a.quad))-project.depth(center(b.quad)));
  const label=hideLetter?`${group.letters.length===3?'Corner':'Edge'} piece with a highlighted ${FACE_NAMES[info.face]} sticker`:`${letter}: ${group.name}, ${info.face} sticker`;
  return `<svg class="memo-piece" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${label}"><g stroke-linejoin="round">${faces.map(({quad,sticker})=>{
    const selected=sticker?.letter===letter,p=project.point(center(quad));
    return `<polygon points="${points(quad,project)}" fill="${sticker?FACE_COLORS[sticker.face]:'#e8e9e5'}" stroke="${selected?'#142c32':'#6c7976'}" stroke-width="${selected?4:1.4}"/>${selected?`<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="5.4" fill="#142c32" stroke="#fff" stroke-width="1.7"/>`:''}${!hideLetter&&sticker?`<text x="${p[0].toFixed(2)}" y="${(p[1]+4).toFixed(2)}" text-anchor="middle" fill="#142c32" stroke="#fff" stroke-width="2.5" paint-order="stroke" font-family="system-ui,sans-serif" font-size="14" font-weight="700">${sticker.letter}</text>`:''}`;
  }).join('')}</g></svg>`;
}

/** An orientation case is a truly misplaced cubie, with all colors rotated.
 * The frame is fixed: white U, green F; far stickers remain visible through it.
 * Direction and source memo are deliberately absent from accessibility text. */
export function renderSpecial(item) {
  const kind=item.kind==='flip'?'edges':'corners',group=pieceInfo(item.piece,kind);
  if(!group) throw new Error(`Unknown orientation piece: ${item.piece}`);
  const project=projector([5,4.2,6],43,140,137),lines=[];
  for(let axis=0;axis<3;axis++) for(const sign of [-1,1]) {
    const normal=normalFor(axis,sign),others=[0,1,2].filter(i=>i!==axis);
    for(const grid of [-1.5,-.5,.5,1.5]) for(const along of [0,1]) {
      const a=[0,0,0],b=[0,0,0];a[axis]=b[axis]=sign*1.5;
      a[others[along]]=b[others[along]]=grid;
      a[others[1-along]]=-1.5;b[others[1-along]]=1.5;
      const pa=project.point(a),pb=project.point(b),far=dot(normal,[5,4.2,6])<0;
      lines.push(`<line x1="${pa[0]}" y1="${pa[1]}" x2="${pb[0]}" y2="${pb[1]}" stroke="#71847d" stroke-width="${Math.abs(grid)===1.5?1.25:.65}" opacity="${far?.22:.44}"${far?' stroke-dasharray="3 3"':''}/>`);
    }
  }
  const shift=kind==='edges'?1:item.direction==='CW'?1:2;
  const facets=[...group.letters].map((letter,i)=>{
    const slot=stickerInfo(letter,kind),color=stickerInfo(group.letters[(i+shift)%group.letters.length],kind).face;
    return {slot,color,quad:faceQuad(slot.normal,group.position,.44,1.51)};
  }).sort((a,b)=>project.depth(center(a.quad))-project.depth(center(b.quad)));
  const centers=[['U',[0,1,0]],['F',[0,0,1]]].map(([face,normal])=>{
    const quad=faceQuad(normal,[0,0,0],.32,1.5),p=project.point(center(quad));
    return `<polygon points="${points(quad,project)}" fill="${FACE_COLORS[face]}" fill-opacity=".7" stroke="#81908a" stroke-width=".7"/><text x="${p[0]}" y="${p[1]+3.5}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="10" font-weight="600" fill="#344e43">${face}</text>`;
  }).join('');
  return `<svg class="memo-orientation" width="280" height="280" viewBox="0 0 280 280" role="img" aria-label="${kind==='edges'?'Flipped edge':'Twisted corner'} on a transparent cube, white up and green front"><g stroke-linejoin="round">${lines.join('')}${centers}${facets.map(({quad,color})=>`<polygon points="${points(quad,project)}" fill="${FACE_COLORS[color]}" stroke="#183c34" stroke-width="2.5"/>`).join('')}</g><text x="140" y="265" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#64786b">White up · Green front</text></svg>`;
}
