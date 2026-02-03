/**
 * BankrollService (Poker Economy)
 * ================================
 * Single wallet model backed by Supabase.
 *
 * - ONE balance: walletBalance
 * - Weekly +3000 grant (additive, not a reset)
 * - Buy-in = $1000 from walletBalance
 * - Leave room → return stack to walletBalance
 * - Persists to Supabase (user_wallets table) via anonymous auth
 * - localStorage used as write-through cache / offline fallback
 *
 * Auth: Uses shared Supabase client from shared.js. If user is logged in,
 * uses their session. Otherwise falls back to signInAnonymously() for guests.
 * This makes RLS policies (auth.uid() = user_id) work naturally.
 */

const BankrollService = (() => {
    const STORAGE_KEY = 'poker_bankroll';
    const WEEKLY_GRANT = 3000;
    const BUY_IN_AMOUNT = 1000;

    let _supabase = null;
    let _userId = null;   // UUID from Supabase auth.users
    let _walletBalance = 0;
    let _lastGrantWeek = null;
    let _loaded = false;

    // ---- Week key helpers ----

    function getISOWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
        return weekNo;
    }

    function getWeekKey(date) {
        date = date || new Date();
        const year = date.getFullYear();
        const week = getISOWeekNumber(date);
        return `${year}-W${String(week).padStart(2, '0')}`;
    }

    function getNextResetDate(date) {
        date = date || new Date();
        const d = new Date(date);
        const day = d.getDay(); // 0=Sun, 1=Mon
        const daysUntilMonday = day === 0 ? 1 : (8 - day);
        d.setDate(d.getDate() + daysUntilMonday);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function formatDate(date) {
        return date.toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    }

    // ---- localStorage cache ----

    function _loadLocal() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function _saveLocal(balance, lastGrantWeek) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            walletBalance: balance,
            lastGrantWeek: lastGrantWeek,
            lastUpdated: Date.now(),
        }));
    }

    // Synchronous save for beforeunload
    function _saveLocalSync() {
        _saveLocal(_walletBalance, _lastGrantWeek);
    }

    // ---- Supabase auth ----

    async function _authenticate() {
        if (!_supabase) return false;
        try {
            // Check for existing session first
            const { data: { session } } = await _supabase.auth.getSession();
            if (session && session.user) {
                _userId = session.user.id;
                return true;
            }

            // No session — sign in anonymously to get a real auth.users UUID
            const { data, error } = await _supabase.auth.signInAnonymously();
            if (error) {
                console.warn('Anonymous sign-in failed:', error.message);
                return false;
            }
            _userId = data.user.id;
            return true;
        } catch (e) {
            console.warn('Supabase auth failed:', e);
            return false;
        }
    }

    // ---- Supabase persistence ----

    async function _loadFromSupabase() {
        if (!_supabase || !_userId) return null;
        try {
            const { data, error } = await _supabase
                .from('user_wallets')
                .select('wallet_balance, last_grant_week')
                .eq('user_id', _userId)
                .maybeSingle();

            if (error) {
                console.warn('Supabase load error:', error.message);
                return null;
            }
            return data; // null if row doesn't exist
        } catch (e) {
            console.warn('Supabase load failed:', e);
            return null;
        }
    }

    async function _saveToSupabase(balance, lastGrantWeek) {
        if (!_supabase || !_userId) return;
        try {
            await _supabase
                .from('user_wallets')
                .upsert({
                    user_id: _userId,
                    wallet_balance: balance,
                    last_grant_week: lastGrantWeek,
                }, { onConflict: 'user_id' });
        } catch (e) {
            console.warn('Supabase save failed:', e);
        }
    }

    // ---- Core API ----

    /**
     * Initialize the service. Call once on page load.
     * Uses the shared Supabase client (window._supabase) from shared.js.
     * If a user is logged in, uses their session. Otherwise falls back
     * to anonymous auth so wallet operations work with RLS (auth.uid() = user_id).
     */
    async function init() {
        // Use shared Supabase client from shared.js (initSupabase)
        initSupabase();
        _supabase = window._supabase || null;

        // Authenticate to get a UUID for RLS
        const authed = await _authenticate();

        // Load wallet: try Supabase first, fall back to localStorage
        if (authed) {
            const remoteData = await _loadFromSupabase();
            if (remoteData) {
                _walletBalance = remoteData.wallet_balance;
                _lastGrantWeek = remoteData.last_grant_week;
            } else {
                // No row yet — check localStorage for migration from pre-auth era
                const local = _loadLocal();
                if (local) {
                    _walletBalance = local.walletBalance || 0;
                    _lastGrantWeek = local.lastGrantWeek || null;
                }
                // Create the row in Supabase
                await _saveToSupabase(_walletBalance, _lastGrantWeek);
            }
        } else {
            // Supabase unavailable — use localStorage only
            const local = _loadLocal();
            if (local) {
                _walletBalance = local.walletBalance || 0;
                _lastGrantWeek = local.lastGrantWeek || null;
            }
        }

        _saveLocal(_walletBalance, _lastGrantWeek);
        _loaded = true;

        // Apply weekly grant if needed
        await applyWeeklyGrant();
    }

    /**
     * Check if weekly grant is due and apply it (+3000 additive).
     */
    async function applyWeeklyGrant() {
        const currentWeek = getWeekKey();
        if (_lastGrantWeek === currentWeek) return false;

        _walletBalance += WEEKLY_GRANT;
        _lastGrantWeek = currentWeek;

        _saveLocal(_walletBalance, _lastGrantWeek);
        await _saveToSupabase(_walletBalance, _lastGrantWeek);
        return true;
    }

    /**
     * Get current wallet state.
     */
    function getState() {
        return {
            walletBalance: _walletBalance,
            lastGrantWeek: _lastGrantWeek,
            weeklyGrant: WEEKLY_GRANT,
            buyInAmount: BUY_IN_AMOUNT,
            nextResetDate: getNextResetDate(),
            canBuyIn: _walletBalance >= BUY_IN_AMOUNT,
        };
    }

    /**
     * Get wallet balance.
     */
    function getWallet() {
        return _walletBalance;
    }

    /**
     * Try to buy in ($1000). Returns {success, amount, message}.
     */
    async function tryBuyIn() {
        if (_walletBalance < BUY_IN_AMOUNT) {
            return {
                success: false,
                message: 'Not enough chips. Next grant: ' + formatDate(getNextResetDate()),
            };
        }

        _walletBalance -= BUY_IN_AMOUNT;
        _saveLocal(_walletBalance, _lastGrantWeek);
        await _saveToSupabase(_walletBalance, _lastGrantWeek);

        return { success: true, amount: BUY_IN_AMOUNT };
    }

    /**
     * Return in-table stack to wallet (on leave or page unload).
     * @param {number} stackAmount - Player's current in-table stack
     */
    async function returnStack(stackAmount) {
        if (!stackAmount || stackAmount <= 0) return;
        _walletBalance += stackAmount;
        _saveLocal(_walletBalance, _lastGrantWeek);
        await _saveToSupabase(_walletBalance, _lastGrantWeek);
    }

    /**
     * Synchronous stack return for beforeunload (localStorage only).
     * Supabase sync will happen on next page load.
     */
    function returnStackSync(stackAmount) {
        if (!stackAmount || stackAmount <= 0) return;
        _walletBalance += stackAmount;
        _saveLocal(_walletBalance, _lastGrantWeek);
    }

    /**
     * Set wallet to an exact value (use sparingly).
     */
    async function setWallet(balance) {
        _walletBalance = Math.max(0, balance);
        _saveLocal(_walletBalance, _lastGrantWeek);
        await _saveToSupabase(_walletBalance, _lastGrantWeek);
    }

    // Exposed for testing
    function _getWeekKey(date) { return getWeekKey(date); }
    function _getNextResetDate(date) { return getNextResetDate(date); }

    return {
        init,
        applyWeeklyGrant,
        getState,
        getWallet,
        tryBuyIn,
        returnStack,
        returnStackSync,
        setWallet,
        formatDate,
        BUY_IN_AMOUNT,
        WEEKLY_GRANT,
        _getWeekKey,
        _getNextResetDate,
        _saveLocalSync,
    };
})();
