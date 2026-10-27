export const users = [
  { id: 'alex', name: 'Алексей Морозов', initials: 'АМ', color: '#6256df' },
  { id: 'katya', name: 'Екатерина Волкова', initials: 'ЕВ', color: '#de8467' },
  { id: 'max', name: 'Максим Соколов', initials: 'МС', color: '#468f88' },
];
export const tournaments = [
  { id: 'weekend', name: 'Футбольные выходные', subtitle: 'Большие матчи. Твои решения.', description: 'Собери свой лучший прогноз на главные матчи европейского футбола. Начни с 1 000 Леонкоинов и поднимись в таблице по ROI.', status: 'active', theme: 'green', prize: '50 000 ₽', prizeNote: 'фрибетами', label: 'ТУРНИР НЕДЕЛИ', dates: '27 окт — 02 ноя', startBank: 100000, minStake: 5000, maxStake: 20000 },
  { id: 'champions', name: 'Ночь чемпионов', subtitle: 'Всё решается на поле.', description: 'Европейские вечера и самые смелые футбольные прогнозы. Следующий турнир уже скоро.', status: 'scheduled', theme: 'purple', prize: '30 000 ₽', prizeNote: 'бонусами', label: 'СКОРО СТАРТ', dates: '03 ноя — 06 ноя', startBank: 100000, minStake: 5000, maxStake: 20000 },
  { id: 'derby', name: 'Время дерби', subtitle: 'Город один. Победитель тоже.', description: 'Первый демонстрационный турнир завершён. Смотри итоговую таблицу и историю прогнозов.', status: 'finished', theme: 'orange', prize: '20 000 ₽', prizeNote: 'фрибетами', label: 'АРХИВ ТУРНИРОВ', dates: '20 окт — 26 окт', startBank: 100000, minStake: 5000, maxStake: 20000 },
];
export function makeMatches(now = Date.now()) {
  const pairs = [
    ['Арсенал', 'Челси', 'Англия · Премьер-лига', 'ARS', 'CHE', ['1.92','3.60','4.10']],
    ['Барселона', 'Атлетико', 'Испания · Ла Лига', 'BAR', 'ATM', ['1.75','3.85','4.60']],
    ['Интер', 'Ювентус', 'Италия · Серия А', 'INT', 'JUV', ['2.10','3.20','3.70']],
    ['Бавария', 'Дортмунд', 'Германия · Бундеслига', 'BAY', 'BVB', ['1.55','4.50','5.80']],
    ['ПСЖ', 'Лион', 'Франция · Лига 1', 'PSG', 'LYO', ['1.45','4.70','6.20']],
  ];
  return pairs.map((p, i) => ({ id: `match-${i+1}`, tournamentId: 'weekend', home: p[0], away: p[1], league: p[2], homeCode: p[3], awayCode: p[4], kickoff: now + (i+1)*86400000, status: 'prematch', result: null, outcomes: [
    { id: 'home', name: 'П1', kind: 'home', odds: p[5][0] }, { id: 'draw', name: 'Х', kind: 'draw', odds: p[5][1] }, { id: 'away', name: 'П2', kind: 'away', odds: p[5][2] },
    { id: 'over25', name: 'ТБ 2.5', kind: 'over', line: 2.5, odds: '1.90' }, { id: 'under25', name: 'ТМ 2.5', kind: 'under', line: 2.5, odds: '1.90' },
    { id: 'over2', name: 'ТБ 2', kind: 'over', line: 2, odds: '1.65' },
  ] }));
}
