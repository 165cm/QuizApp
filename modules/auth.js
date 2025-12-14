import { appState } from './state.js';
import { supabase } from './supabase.js';
import { syncWithSupabase } from './storage.js';

// Get current user
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

// Sign in with Google
export async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            // Use full URL including path for GitHub Pages subpath deployment
            redirectTo: window.location.origin + window.location.pathname
        }

    });

    if (error) {
        console.error('Login error:', error);
        alert('ログインに失敗しました: ' + error.message);
        return null;
    }

    return data;
}

// Sign out
export async function signOut() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        // Already logged out or session invalid
        console.warn('No active session found during logout.');
        appState.currentUser = null;
        updateAuthUI(null);
        return true;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Logout error:', error);
        // Force cleanup even on error
        appState.currentUser = null;
        updateAuthUI(null);
        return false;
    }

    appState.currentUser = null;
    updateAuthUI(null);
    return true;
}

// Listen for auth state changes
export function initAuth() {
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state changed:', event);

        if (session?.user) {
            appState.currentUser = session.user;
            updateAuthUI(session.user);

            // Trigger sync only on INITIAL_SESSION (page load with existing session)
            // SIGNED_IN fires during OAuth redirect before session is fully ready
            if (event === 'INITIAL_SESSION') {
                console.log('🔐 User authenticated, starting sync...');
                await syncWithSupabase();
            }
        } else {
            appState.currentUser = null;
            updateAuthUI(null);
        }
    });

    // Check initial session
    checkSession();
}

async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
        appState.currentUser = session.user;
        updateAuthUI(session.user);
    }
}

// Update UI based on auth state
function updateAuthUI(user) {
    const loginBtn = document.getElementById('login-btn');
    const userInfo = document.getElementById('user-info');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const logoutBtn = document.getElementById('logout-btn');

    if (user) {
        // User is logged in
        if (loginBtn) loginBtn.style.display = 'none';
        if (userInfo) userInfo.style.display = 'flex';
        if (userAvatar) {
            userAvatar.src = user.user_metadata?.avatar_url || '';
            userAvatar.style.display = user.user_metadata?.avatar_url ? 'block' : 'none';
        }
        if (userName) userName.textContent = user.user_metadata?.full_name || user.email;
    } else {
        // User is logged out
        if (loginBtn) loginBtn.style.display = 'flex';
        if (userInfo) userInfo.style.display = 'none';
    }
}

export { supabase };
