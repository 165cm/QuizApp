import { appState } from './state.js';
import { saveApiKey, saveSettings, resetAllData, resetUserStats, resetMaterials } from './storage.js';

let apiKeyInput, googleKeyInput, toggleVisibilityBtn, toggleGoogleVisibilityBtn;
let levelInput, instructionsInput;
let tabs, tabContents;

export function initSettings() {
    // Select Elements
    apiKeyInput = document.getElementById('settings-api-key-input');
    toggleVisibilityBtn = document.getElementById('toggle-api-key-visibility');
    googleKeyInput = document.getElementById('settings-google-api-key-input');
    toggleGoogleVisibilityBtn = document.getElementById('toggle-google-api-key-visibility');

    levelInput = document.getElementById('setting-target-level');
    instructionsInput = document.getElementById('setting-custom-instructions');

    tabs = document.querySelectorAll('.settings-tab-btn');
    tabContents = document.querySelectorAll('.settings-tab-content');

    // Button Listeners
    document.getElementById('save-general-settings-btn')?.addEventListener('click', saveGeneralSettings);
    document.getElementById('save-prompts-btn')?.addEventListener('click', savePromptsSettings);
    document.getElementById('reset-prompts-btn')?.addEventListener('click', resetPromptsSettings);

    // Data Management Listeners
    document.getElementById('btn-reset-stats')?.addEventListener('click', handleResetStats);
    document.getElementById('btn-reset-materials')?.addEventListener('click', handleResetMaterials);
    document.getElementById('btn-reset-all')?.addEventListener('click', handleResetAll);

    // Legal Links
    document.getElementById('open-terms-btn')?.addEventListener('click', () => {
        document.getElementById('terms-modal')?.classList.remove('hidden');
    });
    document.getElementById('open-privacy-btn')?.addEventListener('click', () => {
        document.getElementById('privacy-policy-modal')?.classList.remove('hidden');
    });
    document.getElementById('close-terms-modal')?.addEventListener('click', () => {
        document.getElementById('terms-modal')?.classList.add('hidden');
    });
    document.getElementById('close-privacy-modal')?.addEventListener('click', () => {
        document.getElementById('privacy-policy-modal')?.classList.add('hidden');
    });

    // Visibility Toggles
    setupVisibilityToggle(apiKeyInput, toggleVisibilityBtn);
    setupVisibilityToggle(googleKeyInput, toggleGoogleVisibilityBtn);

    // Tab Switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab));
    });

    // Initial Load
    updateSettingsUI();
}

export function updateSettingsUI() {
    // General
    if (apiKeyInput) apiKeyInput.value = appState.apiKey || '';
    if (googleKeyInput) googleKeyInput.value = appState.googleApiKey || '';

    // Prompts
    const settings = appState.quizSettings || { targetLevel: '一般', customInstructions: '' };
    if (levelInput) levelInput.value = settings.targetLevel || '一般';
    if (instructionsInput) instructionsInput.value = settings.customInstructions || '';
}

function switchTab(tab) {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    const targetId = `settings-tab-${tab.dataset.tab}`;
    const targetContent = document.getElementById(targetId);
    if (targetContent) targetContent.classList.add('active');
}

function setupVisibilityToggle(input, btn) {
    if (!input || !btn) return;
    btn.addEventListener('click', () => {
        if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = '🔒';
        } else {
            input.type = 'password';
            btn.textContent = '👁️';
        }
    });
}

// Action Functions
function saveGeneralSettings() {
    const openAiKey = apiKeyInput.value.trim();
    const googleKey = googleKeyInput ? googleKeyInput.value.trim() : '';

    appState.apiKey = openAiKey;
    appState.googleApiKey = googleKey;

    localStorage.setItem('openai_api_key', openAiKey);
    localStorage.setItem('google_api_key', googleKey);
    saveApiKey(openAiKey);

    alert('一般設定を保存しました。');
}

async function savePromptsSettings() {
    appState.quizSettings = {
        targetLevel: levelInput.value.trim() || '一般',
        customInstructions: instructionsInput.value.trim()
    };

    await saveSettings(); // Save to local and cloud
    alert('プロンプト設定を保存・同期しました！');
}

function resetPromptsSettings() {
    if (confirm('設定をデフォルトに戻しますか？')) {
        levelInput.value = '一般';
        instructionsInput.value = '';
    }
}

async function handleResetStats() {
    if (confirm('学習記録（正解率や連続日数）をリセットしますか？\n教材データはそのまま残ります。')) {
        await resetUserStats();
        alert('学習記録をリセットしました。');
        // UI stats update might be needed if visible, but reload is safer or updateUI
        updateSettingsUI(); // Doesn't show stats though
        // Maybe refresh home if needed?
        window.location.reload();
    }
}

async function handleResetMaterials() {
    if (confirm('すべての教材と問題を削除しますか？\nこの操作は元に戻せません。')) {
        await resetMaterials();
        alert('ライブラリを空にしました。');
        window.location.reload();
    }
}

async function handleResetAll() {
    if (confirm('本当にすべてのデータを削除して初期化しますか？\nこの操作は元に戻せません。')) {
        await resetAllData();
        alert('アプリを初期化しました。');
        window.location.reload();
    }
}
