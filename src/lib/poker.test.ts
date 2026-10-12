import {describe,expect,it} from 'vitest';
import {buildSidePots,compareHands,evaluateFive,type Card} from './poker';
const cards=(rows:[number,Card['suit']][]):Card[]=>rows.map(([rank,suit])=>({rank,suit}));
describe('Texas Hold’em hand evaluator',()=>{
 it('recognizes each standard category including a named royal flush',()=>{
  const examples:[Card[],string][]=[
   [cards([[14,'♠'],[11,'♦'],[8,'♣'],[5,'♥'],[2,'♠']]),'High card'],
   [cards([[9,'♠'],[9,'♦'],[8,'♣'],[5,'♥'],[2,'♠']]),'One pair'],
   [cards([[9,'♠'],[9,'♦'],[8,'♣'],[8,'♥'],[2,'♠']]),'Two pair'],
   [cards([[9,'♠'],[9,'♦'],[9,'♣'],[5,'♥'],[2,'♠']]),'Three of a kind'],
   [cards([[9,'♠'],[8,'♦'],[7,'♣'],[6,'♥'],[5,'♠']]),'Straight'],
   [cards([[14,'♠'],[11,'♠'],[8,'♠'],[5,'♠'],[2,'♠']]),'Flush'],
   [cards([[9,'♠'],[9,'♦'],[9,'♣'],[5,'♥'],[5,'♠']]),'Full house'],
   [cards([[9,'♠'],[9,'♦'],[9,'♣'],[9,'♥'],[2,'♠']]),'Four of a kind'],
   [cards([[14,'♠'],[13,'♠'],[12,'♠'],[11,'♠'],[10,'♠']]),'Royal flush']
  ];
  examples.forEach(([hand,name])=>expect(evaluateFive(hand).name).toBe(name));
 });
 it('handles the ace-low wheel and kicker tie breakers',()=>{
  expect(evaluateFive(cards([[14,'♠'],[2,'♦'],[3,'♣'],[4,'♥'],[5,'♠']])).kickers).toEqual([5]);
  expect(compareHands(evaluateFive(cards([[14,'♠'],[14,'♦'],[13,'♣'],[8,'♥'],[2,'♠']])),evaluateFive(cards([[13,'♠'],[13,'♦'],[14,'♣'],[8,'♥'],[2,'♠']])))).toBeGreaterThan(0);
 });
 it('builds side pots and excludes folded players from eligibility',()=>{
  expect(buildSidePots([{playerId:'a',amount:100},{playerId:'b',amount:50},{playerId:'c',amount:20}],['c'])).toEqual([
   {amount:60,eligible:['a','b']},{amount:60,eligible:['a','b']},{amount:50,eligible:['a']}
  ]);
 });
});
