export type Card = { rank: number; suit: '♠' | '♥' | '♦' | '♣' };
export type HandRank = { category: number; kickers: number[]; name: string };
const names = ['High card','One pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];

export function evaluateFive(cards: Card[]): HandRank {
  if (cards.length !== 5) throw new Error('Exactly five cards are required');
  const rs = cards.map(c => c.rank).sort((a,b)=>b-a);
  const counts = new Map<number, number>(); rs.forEach(r=>counts.set(r,(counts.get(r)||0)+1));
  const groups = [...counts].sort((a,b)=>b[1]-a[1] || b[0]-a[0]);
  const flush = cards.every(c=>c.suit===cards[0].suit);
  const unique = [...new Set(rs)];
  const straightHigh = unique.length===5 && unique[0]-unique[4]===4 ? unique[0] : unique.join(',')==='14,5,4,3,2' ? 5 : 0;
  if (flush && straightHigh) return {category:8,kickers:[straightHigh],name:straightHigh===14?'Royal flush':names[8]};
  if (groups[0][1]===4) return {category:7,kickers:[groups[0][0],groups[1][0]],name:names[7]};
  if (groups[0][1]===3 && groups[1][1]===2) return {category:6,kickers:[groups[0][0],groups[1][0]],name:names[6]};
  if (flush) return {category:5,kickers:rs,name:names[5]};
  if (straightHigh) return {category:4,kickers:[straightHigh],name:names[4]};
  if (groups[0][1]===3) return {category:3,kickers:[groups[0][0],...groups.slice(1).map(g=>g[0]).sort((a,b)=>b-a)],name:names[3]};
  if (groups[0][1]===2 && groups[1][1]===2) return {category:2,kickers:[groups[0][0],groups[1][0],groups[2][0]],name:names[2]};
  if (groups[0][1]===2) return {category:1,kickers:[groups[0][0],...groups.slice(1).map(g=>g[0]).sort((a,b)=>b-a)],name:names[1]};
  return {category:0,kickers:rs,name:names[0]};
}
export function compareHands(a: HandRank,b: HandRank): number {
  if(a.category!==b.category) return a.category-b.category;
  for(let i=0;i<Math.max(a.kickers.length,b.kickers.length);i++){const d=(a.kickers[i]||0)-(b.kickers[i]||0);if(d)return d;}
  return 0;
}
export function bestHand(cards: Card[]): HandRank {
  if(cards.length<5) throw new Error('At least five cards are required');
  let best: HandRank|undefined;
  for(let a=0;a<cards.length-4;a++) for(let b=a+1;b<cards.length-3;b++) for(let c=b+1;c<cards.length-2;c++) for(let d=c+1;d<cards.length-1;d++) for(let e=d+1;e<cards.length;e++){
    const candidate=evaluateFive([cards[a],cards[b],cards[c],cards[d],cards[e]]); if(!best||compareHands(candidate,best)>0)best=candidate;
  }
  return best!;
}
export type Contribution={playerId:string; amount:number};
export function buildSidePots(contributions:Contribution[], folded:string[]=[]){
  const levels=[...new Set(contributions.map(c=>c.amount).filter(n=>n>0))].sort((a,b)=>a-b); let previous=0;
  return levels.map(level=>{const contributors=contributions.filter(c=>c.amount>=level);const amount=(level-previous)*contributors.length;previous=level;return {amount,eligible:contributors.filter(c=>!folded.includes(c.playerId)).map(c=>c.playerId)};}).filter(p=>p.amount>0);
}
