/* Файл: js/services/sync/sync-auth.js — перенесено из js/sync.js без изменения логики */
// === AUTH: нормализация строк для технической почты ===
window.rbiNormalizeAuthPart = function (value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 80) || 'user';
};

// === AUTH: стабильный технический email ===
window.rbiBuildTechnicalEmail = async function (projectCode, userName) {
    const p = window.rbiNormalizeAuthPart(projectCode);
    const n = window.rbiNormalizeAuthPart(userName);

    const raw = `${p}_${n}`;
    const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(raw)
    );

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const shortHash = hashArray
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 12);

    return `rbi_${p}_${shortHash}@rbi-quality.local`;
};

// === AUTH: пароль для Supabase Auth ===
// ВАЖНО: это не PIN в чистом виде, а производный пароль.
// Один и тот же пользователь с тем же проектом и PIN получит тот же пароль.
window.rbiBuildAuthPassword = async function (projectCode, userName, pin) {
    const cleanPin = String(pin || '').trim();

    if (!cleanPin || cleanPin.length < 4) {
        throw new Error('Для облачного входа нужен PIN минимум 4 цифры.');
    }

    const raw = `rbi-auth|${projectCode}|${userName}|${cleanPin}`;
    const hash = await window.hashPin(raw);

    // Supabase требует нормальный пароль. Делаем стабильный сложный пароль.
    return `Rbi_${hash.substring(0, 24)}!`;
};

// === AUTH: вход или регистрация через Supabase Auth ===
window.rbiEnsureAuthSession = async function (projectCode, userName, pin) {
    if (!window.supabaseClient) {
        throw new Error('Supabase не подключен.');
    }

    const email = await window.rbiBuildTechnicalEmail(projectCode, userName);
    const password = await window.rbiBuildAuthPassword(projectCode, userName, pin);

    // 1. Пробуем войти
    let signInResult = await window.supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    // 2. Если пользователя ещё нет — создаём
    if (signInResult.error) {
        const msg = String(signInResult.error.message || '').toLowerCase();

        const looksLikeMissingUser =
            msg.includes('invalid login') ||
            msg.includes('invalid credentials') ||
            msg.includes('email not confirmed') ||
            msg.includes('user not found');

        if (!looksLikeMissingUser) {
            throw signInResult.error;
        }

        const signUpResult = await window.supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    project_code: projectCode,
                    engineer_name: userName
                }
            }
        });

        if (signUpResult.error) {
            throw signUpResult.error;
        }

        // После signUp ещё раз пробуем войти.
        signInResult = await window.supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (signInResult.error) {
            throw signInResult.error;
        }
    }

    const { data: userData, error: userError } = await window.supabaseClient.auth.getUser();

    if (userError || !userData || !userData.user) {
        throw userError || new Error('Не удалось получить Auth-пользователя.');
    }

    return {
        user: userData.user,
        email
    };
};
window.hashPin = async function (pin) {
    if (!pin) return null;
    const msgBuffer = new TextEncoder().encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

window.initSync = async function () {
    window.renderSyncUI();

    try {
        if (window.supabase && window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) {
            window.supabaseClient = window.supabase.createClient(
                window.APP_CONFIG.SUPABASE_URL,
                window.APP_CONFIG.SUPABASE_KEY
            );
        }
    } catch (e) {
        console.error("Ошибка Supabase:", e);
    }

    if (!window.supabaseClient) {
        const block = document.getElementById('sync-settings-block');
        if (block && !block.innerHTML.includes('Облако отключено')) {
            block.insertAdjacentHTML(
                'afterbegin',
                '<div class="p-3 bg-red-50 text-red-600 text-[10px] font-bold text-center border-b border-red-200">⚠️ Облако отключено</div>'
            );
        }
        return;
    }

    // ВАЖНО:
    // Автосинхронизация запускается только если облако уже включено.
    // При локальной работе приложение вообще не трогаем.
    if (window.syncConfig.enabled && window.syncConfig.engineerName && window.syncConfig.projectCode) {
        setTimeout(() => {
            window.triggerSync('silent');
        }, 5000);

        setInterval(() => {
            const isTabActive = document.visibilityState === 'visible';

            if (!isTabActive) return;

            const needPush = localStorage.getItem('rbi_cloud_dirty') === '1';
            const needFullPull = localStorage.getItem('rbi_force_full_pull') === '1';
            const needRemotePoll =
                localStorage.getItem('rbi_force_remote_poll') === '1' ||
                (typeof window.rbiIsRemotePollDue === 'function' && window.rbiIsRemotePollDue());

            // RBI FIX:
            // Даже если на устройстве нет локальных изменений, оно должно периодически проверять облако.
            // Иначе телефон не увидит шаблоны/практики/отчёты, созданные на компьютере.
            if (
                (window.rbiBgCacheProcessing || window.rbiFullOfflineCacheProcessing) &&
                !needPush &&
                !needFullPull
            ) {
                console.log('[Sync] Пропуск автосинхронизации: идёт фоновый кэш файлов');
                return;
            }

            if (needPush || needFullPull || needRemotePoll) {
                window.triggerSync('silent');
            }
        }, 60000);

        // Resume: silent sync только если dirty / force pull / remote poll due (+ debounce)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible' || !window.syncConfig.enabled || !navigator.onLine) {
                return;
            }
            clearTimeout(window.__rbiResumeSyncTimer);
            window.__rbiResumeSyncTimer = setTimeout(() => {
                const needPush = localStorage.getItem('rbi_cloud_dirty') === '1';
                const needFullPull = localStorage.getItem('rbi_force_full_pull') === '1';
                const needRemotePoll =
                    localStorage.getItem('rbi_force_remote_poll') === '1' ||
                    (typeof window.rbiIsRemotePollDue === 'function' && window.rbiIsRemotePollDue());
                if (
                    (window.rbiBgCacheProcessing || window.rbiFullOfflineCacheProcessing) &&
                    !needPush &&
                    !needFullPull
                ) {
                    console.log('[Sync] Пропуск resume-sync: идёт фоновый кэш файлов');
                    return;
                }
                if (needPush || needFullPull || needRemotePoll) {
                    console.log('[Sync] Приложение активно. Проверяем обновления в облаке...');
                    window.triggerSync('silent');
                }
            }, 1500);
        });
    }
};

window.isSyncEnabled = function () { return window.syncConfig.enabled; };

