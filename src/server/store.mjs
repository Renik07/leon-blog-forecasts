import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { users, tournaments, makeMatches } from './fixtures.mjs';
import { DomainError, evaluate, payout } from './domain.mjs';

export function createStore(path = resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH || '.data/tournaments.sqlite')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS documents (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id));
    CREATE TABLE IF NOT EXISTS participants (tournament_id TEXT NOT NULL,user_id TEXT NOT NULL,joined_at INTEGER NOT NULL,PRIMARY KEY(tournament_id,user_id));
    CREATE TABLE IF NOT EXISTS forecasts (id TEXT PRIMARY KEY,tournament_id TEXT NOT NULL,user_id TEXT NOT NULL,match_id TEXT NOT NULL,outcome TEXT NOT NULL,stake INTEGER NOT NULL,text TEXT NOT NULL,status TEXT NOT NULL,reason TEXT,result TEXT,paid INTEGER,created_at INTEGER NOT NULL,request_key TEXT NOT NULL,UNIQUE(tournament_id,user_id,match_id),UNIQUE(user_id,request_key));
    CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY,tournament_id TEXT NOT NULL,user_id TEXT NOT NULL,amount INTEGER NOT NULL,kind TEXT NOT NULL,reference TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY,action TEXT NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL);`);
  const get = (kind,id) => { const row=db.prepare('SELECT body FROM documents WHERE kind=? AND id=?').get(kind,id); return row ? JSON.parse(row.body) : null; };
  const list = kind => db.prepare('SELECT body FROM documents WHERE kind=? ORDER BY rowid').all(kind).map(r=>JSON.parse(r.body));
  const put = (kind,item) => db.prepare('INSERT INTO documents VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body').run(kind,item.id,JSON.stringify(item));
  const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const value=fn(); db.exec('COMMIT'); return value; } catch(e) { db.exec('ROLLBACK'); throw e; } };
  const audit = (action,body) => db.prepare('INSERT INTO audit VALUES(?,?,?,?)').run(randomUUID(),action,JSON.stringify(body),Date.now());
  const entry = (tid,uid,amount,kind,reference) => db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)').run(randomUUID(),tid,uid,amount,kind,reference,Date.now());
  const balance = (tid,uid) => Number(db.prepare('SELECT COALESCE(SUM(amount),0) AS balance FROM ledger WHERE tournament_id=? AND user_id=?').get(tid,uid).balance);
  const participant = (tid,uid) => db.prepare('SELECT * FROM participants WHERE tournament_id=? AND user_id=?').get(tid,uid);
  const requireDoc = (kind,id) => { const value=get(kind,id); if(!value) throw new DomainError('Запись не найдена.',404); return value; };
  tx(()=> { if(!get('meta','seed')) { users.forEach(u=>put('user',u)); tournaments.forEach(t=>put('tournament',t)); makeMatches().forEach(m=>put('match',m)); put('meta',{id:'seed',version:1}); } });
  function join(tid,uid) { return tx(()=> { requireDoc('user',uid); const t=requireDoc('tournament',tid); if(participant(tid,uid)) return {joined:true}; if(t.status!=='active') throw new DomainError('Сейчас нельзя вступить в этот турнир.'); db.prepare('INSERT INTO participants VALUES(?,?,?)').run(tid,uid,Date.now()); entry(tid,uid,t.startBank,'initial',`join:${tid}:${uid}`); audit('join',{tid,uid}); return {joined:true}; }); }
  function submit(tid,uid,input) { return tx(()=> {
    const existing=db.prepare('SELECT * FROM forecasts WHERE user_id=? AND request_key=?').get(uid,input.requestKey || ''); if(existing) { if(existing.tournament_id!==tid||existing.match_id!==input.matchId||JSON.parse(existing.outcome).id!==input.outcomeId||existing.stake!==Math.round(Number(input.stake)*100)||existing.text!==String(input.text||'').trim()) throw new DomainError('Этот ключ запроса уже использован для другого прогноза.'); return {id:existing.id}; }
    const t=requireDoc('tournament',tid); if(t.status!=='active') throw new DomainError('Приём прогнозов в турнире закрыт.');
    if(!participant(tid,uid)) throw new DomainError('Сначала вступите в турнир.');
    const m=requireDoc('match',input.matchId); if(m.tournamentId!==tid || m.status!=='prematch' || m.kickoff<=Date.now()) throw new DomainError('Приём прогнозов на этот матч закрыт.');
    const outcome=m.outcomes.find(o=>o.id===input.outcomeId); if(!outcome) throw new DomainError('Выберите доступный исход.');
    const stake=Math.round(Number(input.stake)*100); if(!Number.isFinite(Number(input.stake)) || Math.abs(Number(input.stake)*100-stake)>0.00001 || !Number.isSafeInteger(stake) || stake<t.minStake || stake>t.maxStake) throw new DomainError('Номинал прогноза — от 50 до 200 Леонкоинов, не более двух знаков после запятой.');
    const text=String(input.text||'').trim(); if(text.length<50 || text.length>3000) throw new DomainError('Обоснование должно содержать от 50 до 3 000 символов.');
    if(typeof input.requestKey!=='string'||input.requestKey.length<8||input.requestKey.length>100) throw new DomainError('Не удалось проверить запрос. Обновите форму.');
    if(db.prepare('SELECT id FROM forecasts WHERE tournament_id=? AND user_id=? AND match_id=?').get(tid,uid,m.id)) throw new DomainError('Вы уже отправили прогноз на этот матч.');
    if(balance(tid,uid)<stake) throw new DomainError('Недостаточно доступных Леонкоинов.');
    const id=randomUUID(); db.prepare('INSERT INTO forecasts(id,tournament_id,user_id,match_id,outcome,stake,text,status,created_at,request_key) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,tid,uid,m.id,JSON.stringify(outcome),stake,text,'pending',Date.now(),input.requestKey); entry(tid,uid,-stake,'reserve',`reserve:${id}`); audit('forecast.submitted',{id,uid}); return {id};
  }); }
  function moderate(id,approve,reason='') { return tx(()=> {
    const f=db.prepare('SELECT * FROM forecasts WHERE id=?').get(id); if(!f) throw new DomainError('Прогноз не найден.',404); if(f.status!=='pending') throw new DomainError('Решение уже принято.');
    const m=requireDoc('match',f.match_id); if(approve && (m.status!=='prematch'||m.kickoff<=Date.now())) throw new DomainError('Матч уже начался. Отклоните прогноз и верните резерв.');
    if(!approve && !String(reason).trim()) throw new DomainError('Укажите причину отказа.');
    db.prepare('UPDATE forecasts SET status=?,reason=? WHERE id=?').run(approve?'approved':'rejected',approve?null:String(reason).trim().slice(0,500),id); if(!approve) entry(f.tournament_id,f.user_id,f.stake,'release',`release:${id}`); audit('moderation',{id,approve,reason}); return {ok:true};
  }); }
  function settle(mid,result) { return tx(()=> {
    const m=requireDoc('match',mid); if(m.status!=='prematch') throw new DomainError('Матч уже рассчитан. Повторное начисление запрещено.');
    if(typeof result.void!=='boolean') throw new DomainError('Укажите тип результата.');
    if(!String(result.reason||'').trim()) throw new DomainError('Укажите основание ручного расчёта.');
    evaluate(m.outcomes[0],result);
    const forecasts=db.prepare('SELECT * FROM forecasts WHERE match_id=?').all(mid);
    for(const f of forecasts) {
      if(f.status==='pending') { db.prepare("UPDATE forecasts SET status='rejected',reason='Результат подтверждён до завершения модерации' WHERE id=?").run(f.id); entry(f.tournament_id,f.user_id,f.stake,'release',`release:${f.id}`); }
      if(f.status==='approved') { const verdict=evaluate(JSON.parse(f.outcome),result); const paid=payout(f.stake,JSON.parse(f.outcome).odds,verdict); db.prepare('UPDATE forecasts SET result=?,paid=? WHERE id=?').run(verdict,paid,f.id); entry(f.tournament_id,f.user_id,paid,'settlement',`settle:${f.id}`); }
    }
    put('match',{...m,status:result.void?'cancelled':'finished',result}); audit('match.settled',{mid,result}); return {ok:true};
  }); }
  function finish(tid) { return tx(()=> {const t=requireDoc('tournament',tid); if(t.status!=='active') throw new DomainError('Турнир уже закрыт.'); if(db.prepare("SELECT id FROM forecasts WHERE tournament_id=? AND (status='pending' OR (status='approved' AND result IS NULL))").get(tid)) throw new DomainError('Сначала рассчитайте все прогнозы и завершите модерацию.'); put('tournament',{...t,status:'finished'});audit('tournament.finished',{tid});return {ok:true};}); }
  function snapshot(uid,admin=false) {
    const allForecasts=db.prepare('SELECT * FROM forecasts ORDER BY created_at DESC').all();
    const visible=allForecasts.filter(f=>admin||f.status==='approved'||f.user_id===uid).map(f=>({...f,outcome:JSON.parse(f.outcome)}));
    const boards={};
    for(const t of list('tournament')) { boards[t.id]=db.prepare('SELECT * FROM participants WHERE tournament_id=?').all(t.id).map(p=> {const fs=allForecasts.filter(f=>f.tournament_id===t.id&&f.user_id===p.user_id&&f.status==='approved');const settled=fs.filter(f=>f.result);const turnover=settled.filter(f=>f.result!=='void').reduce((s,f)=>s+f.stake,0);const profit=settled.reduce((s,f)=>s+f.paid-f.stake,0);return {...requireDoc('user',p.user_id),balance:balance(t.id,p.user_id),forecasts:fs.length,settled:settled.length,wins:settled.filter(f=>f.result==='win').length,losses:settled.filter(f=>f.result==='loss').length,voids:settled.filter(f=>f.result==='void').length,turnover,profit,roi:turnover?profit/turnover*100:null,joinedAt:p.joined_at};}).sort((a,b)=>(b.roi??-Infinity)-(a.roi??-Infinity)||b.turnover-a.turnover||b.settled-a.settled||a.joinedAt-b.joinedAt||a.id.localeCompare(b.id)); }
    return {users:list('user'),tournaments:list('tournament'),matches:list('match'),forecasts:visible,boards,currentUserId:uid,demo:true,audit:admin?db.prepare('SELECT * FROM audit ORDER BY created_at DESC LIMIT 30').all():[]};
  }
  return {db,join,submit,moderate,settle,finish,snapshot,balance};
}
const singleton=Symbol.for('leon.store');
export function getStore() { if(!globalThis[singleton]) globalThis[singleton]=createStore(); return globalThis[singleton]; }
