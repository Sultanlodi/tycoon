/**
 * Auth page logic (auth.html only).
 * Handles sign-up, log-in, tab switching, and error display.
 */

let _supabase = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Init Supabase client
    if (window.__SUPABASE_URL && window.__SUPABASE_KEY && window.supabase) {
        _supabase = window.supabase.createClient(
            window.__SUPABASE_URL,
            window.__SUPABASE_KEY
        );
    }

    // Already logged in? Redirect to hub.
    if (_supabase) {
        const { data: { session } } = await _supabase.auth.getSession();
        if (session) {
            window.location.href = '/';
            return;
        }
    }
});

// ============== Tab Switching ==============

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.auth-tab[data-tab="${tab}"]`).classList.add('active');

    document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('signup-form').style.display = tab === 'signup' ? 'block' : 'none';

    _hideError();
}

// ============== Sign Up ==============

async function handleSignUp(e) {
    e.preventDefault();
    if (!_supabase) return _showError('Service unavailable. Try again later.');

    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    if (!name) return _showError('Please enter a display name.');
    if (password.length < 6) return _showError('Password must be at least 6 characters.');

    _setLoading('signup-btn', true);

    const { data, error } = await _supabase.auth.signUp({
        email,
        password,
        options: {
            data: { display_name: name },
        },
    });

    if (error) {
        _setLoading('signup-btn', false);
        return _showError(_friendlyError(error.message));
    }

    // If email confirmation is required, the user object exists but session may be null
    if (!data.session) {
        _setLoading('signup-btn', false);
        return _showError('Account created but email confirmation is required. Ask the admin to disable email verification in Supabase.');
    }

    // Create initial DB rows
    const userId = data.user.id;
    await _supabase.from('user_wallets').upsert({
        user_id: userId,
        wallet_balance: 0,
        last_grant_week: null,
    }, { onConflict: 'user_id' });

    await _supabase.from('tycoon_stats').upsert({
        user_id: userId,
        first_place_wins: 0,
    }, { onConflict: 'user_id' });

    // Store display name in localStorage for immediate use
    localStorage.setItem('player_name', name);

    window.location.href = '/';
}

// ============== Log In ==============

async function handleLogin(e) {
    e.preventDefault();
    if (!_supabase) return _showError('Service unavailable. Try again later.');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    _setLoading('login-btn', true);

    const { data, error } = await _supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        _setLoading('login-btn', false);
        return _showError(_friendlyError(error.message));
    }

    // Store display name
    const displayName = data.user?.user_metadata?.display_name;
    if (displayName) {
        localStorage.setItem('player_name', displayName);
    }

    window.location.href = '/';
}

// ============== Helpers ==============

function _showError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.style.display = 'block';
}

function _hideError() {
    const el = document.getElementById('auth-error');
    el.style.display = 'none';
}

function _setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
        btn.dataset.originalText = btn.textContent;
        btn.textContent = 'Loading...';
    } else {
        btn.textContent = btn.dataset.originalText || btn.textContent;
    }
}

function _friendlyError(msg) {
    const lower = msg.toLowerCase();
    if (lower.includes('invalid login')) return 'Incorrect email or password.';
    if (lower.includes('already registered') || lower.includes('already been registered')) return 'This email is already in use. Try logging in.';
    if (lower.includes('password') && lower.includes('short')) return 'Password must be at least 6 characters.';
    if (lower.includes('rate limit')) return 'Too many attempts. Wait a moment and try again.';
    if (lower.includes('email')) return 'Please enter a valid email address.';
    return msg;
}
