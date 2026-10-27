'use client';

import { useState } from 'react';

type User = { id: string; name: string; initials: string; color: string };
type Match = { id: string; home: string; away: string; league: string; kickoff: number; result: null | { home: number; away: number; void: boolean } };
type Forecast = { id: string; user_id: string; match_id: string; tournament_id: string; outcome: { name: string; odds: string }; stake: number; text: string; status: string; result: string | null; paid: number; reason: string | null; created_at: number };
type Row = { id: string; balance: number; profit: number; roi: number | null; forecasts: number; settled: number; wins: number; losses: number; voids: number };
const amount = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(v / 100);
const date = (v: number) => new Date(v).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const roi = (v: number | null) => v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
const labels: Record<string, string> = { pending: 'На модерации', rejected: 'Отклонён', approved: 'Ожидает результата', win: 'Выигрыш', loss: 'Проигрыш', void: 'Возврат' };

export function ForecastCard({ forecast: f, matches, users, tournamentName }: { forecast: Forecast; matches: Match[]; users: User[]; tournamentName?: string }) {
  const [expanded, setExpanded] = useState(false);
  const m = matches.find(m => m.id === f.match_id);
  const u = users.find(u => u.id === f.user_id);
  if (!m || !u) return null;
  const state = f.result || f.status;
  const profit = f.result ? f.paid - f.stake : 0;
  return <article className={`forecast-card detailed-forecast result-${state}`}>
    <div className="forecast-top"><div className="person"><span className="avatar small" style={{ background: u.color }}>{u.initials}</span><div><strong>{u.name}</strong><small>{date(f.created_at)} МСК{tournamentName && ` · ${tournamentName}`}</small></div></div><span className={`badge ${state === 'win' ? 'active' : state === 'loss' || state === 'rejected' ? 'rejected' : ''}`}>{labels[state]}</span></div>
    <div className="forecast-match-info"><small>{m.league} · {date(m.kickoff)} МСК</small><h3>{m.home} <span>—</span> {m.away}</h3>{m.result && <span className="final-score">{m.result.void ? 'Матч отменён' : `Основное время: ${m.result.home}:${m.result.away}`}</span>}</div>
    <div className="prediction-ticket"><div><small>ПРОГНОЗ</small><strong>{f.outcome.name}</strong></div><div><small>КОЭФФИЦИЕНТ</small><strong>{f.outcome.odds}</strong></div><div><small>НОМИНАЛ</small><strong>{amount(f.stake)} <span>ЛК</span></strong></div></div>
    <p className={!expanded && f.text.length > 320 ? 'clamped-text' : ''}>{f.text}</p>
    {f.text.length > 320 && <button className="text-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Свернуть обоснование ↑' : 'Читать обоснование ↓'}</button>}
    <div className="forecast-resolution">{f.result ? <><span>Начислено <b>{amount(f.paid)} ЛК</b></span><span className={profit > 0 ? 'positive' : profit < 0 ? 'negative' : ''}>Прибыль <b>{profit > 0 ? '+' : ''}{amount(profit)} ЛК</b></span></> : <span>{f.status === 'pending' ? 'Номинал зарезервирован до решения модератора.' : f.status === 'rejected' ? 'Резерв возвращён на баланс турнира.' : 'Результат появится после завершения и расчёта матча.'}</span>}</div>
    {f.reason && <p className="reason">Причина: {f.reason}</p>}
  </article>;
}

export function ForecastFeed({ forecasts, matches, users, personal = false, tournamentName }: { forecasts: Forecast[]; matches: Match[]; users: User[]; personal?: boolean; tournamentName?: string }) {
  const [matchId, setMatchId] = useState('all');
  const [author, setAuthor] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('new');
  const [limit, setLimit] = useState(6);
  const states = personal ? ['all', 'pending', 'approved', 'win', 'loss', 'void', 'rejected'] : ['all', 'approved', 'win', 'loss', 'void'];
  const filtered = forecasts.filter(f => (matchId === 'all' || f.match_id === matchId) && (author === 'all' || f.user_id === author) && (status === 'all' || (f.result || f.status) === status)).sort((a, b) => sort === 'odds' ? Number(b.outcome.odds) - Number(a.outcome.odds) : sort === 'old' ? a.created_at - b.created_at : b.created_at - a.created_at);
  const clear = () => { setMatchId('all'); setAuthor('all'); setStatus('all'); setSort('new'); setLimit(6); };
  return <section aria-label={personal ? 'История моих прогнозов' : 'Лента прогнозов'}>
    <div className="feed-toolbar"><label>Матч<select value={matchId} onChange={e => { setMatchId(e.target.value); setLimit(6); }}><option value="all">Все матчи</option>{matches.map(m => <option key={m.id} value={m.id}>{m.home} — {m.away}</option>)}</select></label>
      {!personal && <label>Участник<select value={author} onChange={e => { setAuthor(e.target.value); setLimit(6); }}><option value="all">Все участники</option>{users.filter(u => forecasts.some(f => f.user_id === u.id)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
      <label>Сортировка<select value={sort} onChange={e => setSort(e.target.value)}><option value="new">Сначала новые</option><option value="old">Сначала старые</option><option value="odds">По коэффициенту</option></select></label>
    </div>
    <div className="result-filters" aria-label="Фильтр по статусу">{states.map(s => <button key={s} aria-pressed={status === s} className={s === status ? 'chosen' : ''} onClick={() => { setStatus(s); setLimit(6); }}>{s === 'all' ? 'Все' : labels[s]} <span>{forecasts.filter(f => s === 'all' || (f.result || f.status) === s).length}</span></button>)}</div>
    <p className="feed-count" role="status">Найдено прогнозов: {filtered.length}</p>
    {filtered.slice(0, limit).map(f => <ForecastCard key={f.id} forecast={f} matches={matches} users={users} tournamentName={tournamentName}/>)}
    {!filtered.length && <div className="empty panel"><span>◇</span><h3>{forecasts.length ? 'По этим условиям прогнозов нет' : personal ? 'Первый прогноз ещё впереди' : 'Пока нет опубликованных прогнозов'}</h3><p>{forecasts.length ? 'Попробуй другой матч, участника или статус.' : 'После отправки и проверки прогнозы появятся здесь.'}</p>{forecasts.length > 0 && <button className="outline" onClick={clear}>Сбросить фильтры</button>}</div>}
    {filtered.length > limit && <button className="outline load-more" onClick={() => setLimit(limit + 6)}>Показать ещё · осталось {filtered.length - limit}</button>}
  </section>;
}

export function ProfileStats({ row, forecasts, board }: { row?: Row; forecasts: Forecast[]; board: Row[] }) {
  const position = row ? board.findIndex(r => r.id === row.id) + 1 : 0;
  const decided = (row?.wins || 0) + (row?.losses || 0);
  const success = decided ? Math.round((row?.wins || 0) / decided * 100) : null;
  return <><div className="stat-grid">
    <div><small>МЕСТО В ТУРНИРЕ</small><strong>{position ? `#${position}` : '—'}</strong><span>{row ? `из ${board.length} участников` : 'Ты ещё не участвуешь'}</span></div>
    <div><small>ROI</small><strong className={(row?.roi || 0) > 0 ? 'positive' : ''}>{roi(row?.roi ?? null)}</strong><span>По рассчитанным прогнозам</span></div>
    <div><small>ПРИБЫЛЬ</small><strong className={(row?.profit || 0) > 0 ? 'positive' : (row?.profit || 0) < 0 ? 'negative' : ''}>{(row?.profit || 0) > 0 ? '+' : ''}{amount(row?.profit || 0)} <em>ЛК</em></strong><span>Без стартового банка</span></div>
    <div><small>ПРОХОДИМОСТЬ</small><strong>{success === null ? '—' : `${success}%`}</strong><span>Выигрыши / (выигрыши + проигрыши)</span></div>
  </div><div className="profile-breakdown"><span><i className="dot win"/>{row?.wins || 0} выиграно</span><span><i className="dot loss"/>{row?.losses || 0} проиграно</span><span><i className="dot neutral"/>{row?.voids || 0} возвратов</span><span>{forecasts.filter(f => f.status === 'pending').length} на модерации</span></div></>;
}

export function TournamentDetails({ tournament, matchCount, own, board }: { tournament: { name: string; dates: string; status: string; prize: string }; matchCount: number; own?: Row; board: Row[] }) {
  const [rules, setRules] = useState(false);
  const descriptions: Record<string, string> = { active: 'Приём прогнозов открыт', scheduled: 'Участие откроется со стартом', finished: 'Приём прогнозов закрыт' };
  return <section className="tournament-details" aria-label="Условия турнира"><div className="tournament-facts"><div><small>СРОКИ ТУРНИРА · МСК</small><b>{tournament.dates}</b><span>{descriptions[tournament.status]}</span></div><div><small>НА СТАРТЕ</small><b>1 000 Леонкоинов</b><span>Номинал прогноза: 50–200</span></div><div><small>СОБЫТИЯ</small><b>{matchCount} футбольных матчей</b><span>Только основное время</span></div></div>
    {own && <div className="your-position"><span>Твоя позиция <b>#{board.findIndex(r => r.id === own.id) + 1}</b></span><span>ROI <b>{roi(own.roi)}</b></span><span>Прибыль <b>{own.profit > 0 ? '+' : ''}{amount(own.profit)} ЛК</b></span></div>}
    <button className="rules-toggle" aria-expanded={rules} aria-controls="tournament-rules" onClick={() => setRules(!rules)}><span>Правила участия и призы</span><span>{rules ? '−' : '+'}</span></button>
    {rules && <div id="tournament-rules" className="rules-body"><h3>Как участвовать</h3><ol><li>Вступи в турнир. Стартовый банк — 1 000 Леонкоинов, отдельный для этого турнира.</li><li>Выбери матч и исход до его начала. Один прогноз на матч; номинал от 50 до 200 Леонкоинов.</li><li>Напиши обоснование от 50 до 3 000 символов. Номинал резервируется, коэффициент фиксируется при отправке.</li><li>После ручной модерации прогноз публикуется. При отказе резерв возвращается.</li></ol><h3>Как определяется место</h3><p>Рейтинг строится по ROI: чистая прибыль / оборот рассчитанных прогнозов × 100%. Возвраты не включаются в оборот. При равном ROI сравниваются оборот, число рассчитанных прогнозов, время вступления и внутренний идентификатор. Участники без расчётов показаны в конце таблицы.</p><h3>Расчёт и призы</h3><p>П1/Х/П2 и тоталы рассчитываются по основному времени. При отмене матча или равенстве целому тоталу номинал возвращается. Призовой фонд — {tournament.prize} Леонкоинов. Распределение по местам и порядок хранения наград ещё согласуются; в демонстрационной версии призы не начисляются.</p><p className="muted">Тестовые условия для проверки интерфейса. Леонкоины стартового банка и призовые награды показаны раздельно; правила их взаимосвязи ещё не утверждены.</p></div>}
  </section>;
}
