import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/server/store.mjs';
import { evaluate, payout } from '../src/server/domain.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const explanation='Арсенал увереннее проводит домашние встречи, а состав соперника ослаблен. Ожидаю преимущество хозяев в центре поля.';
test('join and request retries cannot duplicate bank or forecast',()=>{
 const s=createStore(':memory:');try{s.join('weekend','alex');s.join('weekend','alex');assert.equal(s.balance('weekend','alex'),100000);
 const input={matchId:'match-1',outcomeId:'home',stake:100,text:explanation,requestKey:'request-1234'};
 const first=s.submit('weekend','alex',input);assert.deepEqual(s.submit('weekend','alex',input),first);assert.equal(s.balance('weekend','alex'),90000);
 assert.throws(()=>s.submit('weekend','alex',{...input,matchId:'match-2'}),/другого прогноза/);
 assert.throws(()=>s.submit('weekend','alex',{...input,requestKey:'request-5678'}),/уже отправили/);
 assert.throws(()=>s.submit('weekend','alex',{...input,matchId:'match-2',stake:201,requestKey:'request-9101'}),/Номинал/);
 }finally{s.db.close();}
});
test('wallet and pending forecast survive reopening the database',()=>{
 const dir=mkdtempSync(join(tmpdir(),'leon-store-'));const path=join(dir,'test.sqlite');let s=createStore(path);
 try{s.join('weekend','alex');s.submit('weekend','alex',{matchId:'match-1',outcomeId:'home',stake:100,text:explanation,requestKey:'request-persist'});s.db.close();s=createStore(path);assert.equal(s.balance('weekend','alex'),90000);assert.equal(s.snapshot('alex').forecasts.length,1);s.join('weekend','alex');assert.equal(s.balance('weekend','alex'),90000);}finally{s.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('moderation releases rejected reserves and public feed hides pending',()=>{
 const s=createStore(':memory:');try{s.join('weekend','alex');const {id}=s.submit('weekend','alex',{matchId:'match-1',outcomeId:'draw',stake:200,text:explanation,requestKey:'request-reject'});
 assert.equal(s.snapshot('katya').forecasts.length,0);assert.equal(s.snapshot('alex').forecasts.length,1);
 s.moderate(id,false,'Недостаточно аргументов');assert.equal(s.balance('weekend','alex'),100000);assert.throws(()=>s.moderate(id,true),/уже принято/);
 }finally{s.db.close();}
});
test('settlement credits win once, calculates ROI, refunds pending and prevents premature finish',()=>{
 const s=createStore(':memory:');try{s.join('weekend','alex');s.join('weekend','katya');
 const a=s.submit('weekend','alex',{matchId:'match-1',outcomeId:'home',stake:100,text:explanation,requestKey:'request-alex'});s.moderate(a.id,true);
 s.submit('weekend','katya',{matchId:'match-1',outcomeId:'away',stake:200,text:explanation,requestKey:'request-katya'});
 assert.throws(()=>s.finish('weekend'),/Сначала рассчитайте/);
 s.settle('match-1',{home:2,away:1,void:false,reason:'Тестовый результат'});
 assert.equal(s.balance('weekend','alex'),109200);assert.equal(s.balance('weekend','katya'),100000);
 const r=s.snapshot('alex').boards.weekend.find(r=>r.id==='alex');assert.equal(r.profit,9200);assert.equal(r.roi,92);
 assert.throws(()=>s.settle('match-1',{home:2,away:1,void:false,reason:'Повтор'}),/уже рассчитан/);s.finish('weekend');
 assert.throws(()=>s.submit('weekend','alex',{matchId:'match-2',outcomeId:'home',stake:100,text:explanation,requestKey:'request-late'}),/закрыт/);
 }finally{s.db.close();}
});
test('whole totals push, draws, losses and cancellation have deterministic payouts',()=>{
 assert.equal(evaluate({kind:'over',line:2},{home:1,away:1}),'void');assert.equal(evaluate({kind:'under',line:2.5},{home:1,away:1}),'win');assert.equal(evaluate({kind:'home'},{home:1,away:1}),'loss');assert.equal(evaluate({kind:'draw'},{home:1,away:1}),'win');assert.equal(evaluate({kind:'home'},{void:true}),'void');
 assert.equal(payout(10000,'1.92','win'),19200);assert.equal(payout(10000,'1.92','loss'),0);assert.equal(payout(10000,'1.92','void'),10000);assert.throws(()=>evaluate({kind:'home'},{home:-1,away:1}));
});
test('invalid manual result rolls transaction back without changing balance',()=>{
 const s=createStore(':memory:');try{s.join('weekend','alex');const {id}=s.submit('weekend','alex',{matchId:'match-1',outcomeId:'home',stake:100,text:explanation,requestKey:'request-rollback'});s.moderate(id,true);
 assert.throws(()=>s.settle('match-1',{home:-1,away:0,void:false,reason:'Ошибка'}));assert.equal(s.balance('weekend','alex'),90000);assert.equal(s.snapshot('alex').matches[0].status,'prematch');
 }finally{s.db.close();}
});
test('prize metadata upgrade preserves existing wallets, forecasts and tournament state',()=>{
 const dir=mkdtempSync(join(tmpdir(),'leon-prizes-'));const path=join(dir,'test.sqlite');let s=createStore(path);
 try {
  s.join('weekend','alex');s.submit('weekend','alex',{matchId:'match-1',outcomeId:'home',stake:100,text:explanation,requestKey:'request-upgrade'});
  const t=s.snapshot('alex').tournaments.find(t=>t.id==='weekend');
  s.db.prepare('UPDATE documents SET body=? WHERE kind=? AND id=?').run(JSON.stringify({...t,status:'finished',prize:'50 000 ₽',prizeNote:'фрибетами'}),'tournament','weekend');
  s.db.prepare('DELETE FROM documents WHERE kind=? AND id=?').run('meta','leoncoin-prizes');
  s.db.close();s=createStore(path);
  const updated=s.snapshot('alex');const tournament=updated.tournaments.find(t=>t.id==='weekend');
  assert.equal(tournament.prize,'50 000');assert.equal(tournament.prizeNote,'Леонкоинов');assert.equal(tournament.status,'finished');assert.equal(s.balance('weekend','alex'),90000);assert.equal(updated.forecasts.length,1);
 }finally{s.db.close();rmSync(dir,{recursive:true,force:true});}
});
