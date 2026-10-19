/**
 * Манифест нового модуля construction-v2 (параллельно legacy construction).
 * Entry → index.js → бандл js/dist/construction-v2.js (Vite/TS).
 */

export const ConstructionV2Manifest = {
    id: 'construction-v2',
    role: 'module',
    title: 'Стройконтроль (новый)',
    icon: 'hard-hat',
    version: '0.1.0',
    status: 'active',
    entry: './index.js',
    menu: { section: 'construction', label: 'СК (новый)', order: 11 },
    company: { enabledByDefault: true },
    routes: ['/construction-v2', '/construction-v2/:subTab'],
    defaultRoute: '/construction-v2'
};
