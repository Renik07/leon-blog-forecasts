import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '../../../src/server/store.mjs';
import { DomainError } from '../../../src/server/domain.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function guard(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true') throw new DomainError('Демонстрационный режим отключён. Для локального запуска задайте DEMO_MODE=true.',403);
  if (!['localhost','127.0.0.1','[::1]'].includes(req.nextUrl.hostname)) throw new DomainError('Демо доступно только локально.',403);
}
function identity(req: NextRequest) { const uid=req.cookies.get('leon-demo-user')?.value || 'alex'; if(!['alex','katya','max'].includes(uid)) throw new DomainError('Выберите тестового пользователя.',401); return uid; }
function failed(e: unknown) { return NextResponse.json({error:e instanceof DomainError?e.message:'Не удалось выполнить операцию.'},{status:e instanceof DomainError?e.status:500}); }
export async function GET(req:NextRequest) { try {guard(req);return NextResponse.json(getStore().snapshot(identity(req),req.cookies.get('leon-demo-admin')?.value==='yes'));}catch(e){return failed(e);} }
export async function POST(req:NextRequest) {
  try {
    guard(req); const origin=req.headers.get('origin'); if(!origin || new URL(origin).host!==req.headers.get('host') || !['http:','https:'].includes(new URL(origin).protocol)) throw new DomainError('Недопустимый источник запроса.',403);
    const input=await req.json();const uid=identity(req);const store=getStore();
    if(input.action==='identity') { if(!['alex','katya','max'].includes(input.userId)) throw new DomainError('Пользователь не найден.'); const response=NextResponse.json({ok:true});response.cookies.set('leon-demo-user',input.userId,{httpOnly:true,sameSite:'strict',path:'/'});return response; }
    if(input.action==='adminMode') {const response=NextResponse.json({ok:true});response.cookies.set('leon-demo-admin',input.enabled?'yes':'no',{httpOnly:true,sameSite:'strict',path:'/'});return response;}
    if(['moderate','settle','finish'].includes(input.action)&&req.cookies.get('leon-demo-admin')?.value!=='yes') throw new DomainError('Включите тестовый режим администратора.',403);
    let result;
    switch(input.action) {
      case 'join': result=store.join(input.tournamentId,uid);break;
      case 'submit': result=store.submit(input.tournamentId,uid,input);break;
      case 'moderate': if(typeof input.approve!=='boolean')throw new DomainError('Некорректное решение.');result=store.moderate(input.id,input.approve,input.reason);break;
      case 'settle': result=store.settle(input.matchId,input.result);break;
      case 'finish': result=store.finish(input.tournamentId);break;
      default: throw new DomainError('Неизвестное действие.');
    }
    return NextResponse.json(result);
  }catch(e){return failed(e);}
}
