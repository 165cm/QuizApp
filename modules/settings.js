import { appState } from './state.js';
import { saveApiKey, saveSettings, resetAllData } from './storage.js';

export function initSettings() {
    const modal = document.getElementById('settings-modal');
    const settingsBtn = document.getElementById('settings-btn');
    const closeBtn = document.getElementById('close-settings-modal');

    // Tab Elements
    const tabs = document.querySelectorAll('.settings-tab-btn');
    const tabContents = document.querySelectorAll('.settings-tab-content');

    // --- General Tab Elements ---
    const apiKeyInput = document.getElementById('settings-api-key-input');
    const toggleVisibilityBtn = document.getElementById('toggle-api-key-visibility');

    const googleKeyInput = document.getElementById('settings-google-api-key-input');
    const toggleGoogleVisibilityBtn = document.getElementById('toggle-google-api-key-visibility');
    const modelSelect = document.getElementById('setting-image-model');

    const saveGeneralBtn = document.getElementById('save-general-settings-btn');

    // --- Prompts Tab Elements ---
    const levelInput = document.getElementById('setting-target-level');
    const instructionsInput = document.getElementById('setting-custom-instructions');
    const savePromptsBtn = document.getElementById('save-prompts-btn');
    const resetPromptsBtn = document.getElementById('reset-prompts-btn');

    // --- Data Tab Elements ---
    const resetDataBtn = document.getElementById('settings-reset-data-btn');


    // Open Modal
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            loadSettingsToUI();
            modal.classList.remove('hidden');
            modal.style.display = 'block';
        });
    }

    // Close Modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        });
    }

    // Tab Switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const targetId = `settings-tab-${tab.dataset.tab}`;
            document.getElementById(targetId).classList.add('active');
        });
    });

    // API Key Visbility Toggle
    const toggleVisibility = (input, btn) => {
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
    };
    toggleVisibility(apiKeyInput, toggleVisibilityBtn);
    toggleVisibility(googleKeyInput, toggleGoogleVisibilityBtn);

    // Save General Settings
    if (saveGeneralBtn) {
        saveGeneralBtn.addEventListener('click', () => {
            const openAiKey = apiKeyInput.value.trim();
            const googleKey = googleKeyInput ? googleKeyInput.value.trim() : '';
            const selectedModel = modelSelect ? modelSelect.value : 'nano-banana';

            // Update State
            appState.apiKey = openAiKey;
            appState.googleApiKey = googleKey;
            appState.imageModel = selectedModel;

            // Save to LocalStorage
            localStorage.setItem('openai_api_key', openAiKey);
            localStorage.setItem('google_api_key', googleKey);
            localStorage.setItem('image_model', selectedModel);

            // Also call storage saveApiKey to ensure compatibility if it does extra stuff (it just saves to LS usually)
            saveApiKey(openAiKey);

            alert('一般設定を保存しました。');
        });
    }

    // Save Prompts
    if (savePromptsBtn) {
        savePromptsBtn.addEventListener('click', async () => {
            appState.quizSettings = {
                targetLevel: levelInput.value.trim() || '一般',
                customInstructions: instructionsInput.value.trim()
            };

            await saveSettings(); // Save to local and cloud
            alert('プロンプト設定を保存・同期しました！');
        });
    }

    // Reset Prompts
    if (resetPromptsBtn) {
        resetPromptsBtn.addEventListener('click', () => {
            if (confirm('設定をデフォルトに戻しますか？')) {
                levelInput.value = '一般';
                instructionsInput.value = '';
            }
        });
    }

    // Reset Data
    if (resetDataBtn) {
        resetDataBtn.addEventListener('click', async () => {
            if (confirm('本当にすべてのデータを削除しますか？\nこの操作は元に戻せません。')) {
                await resetAllData();
                alert('データをリセットしました。ページを再読み込みします。');
                window.location.reload();
            }
        });
    }

    // Load Settings Function
    function loadSettingsToUI() {
        // General
        if (apiKeyInput) apiKeyInput.value = appState.apiKey || '';
        if (googleKeyInput) googleKeyInput.value = appState.googleApiKey || '';
        if (modelSelect) modelSelect.value = appState.imageModel || 'nano-banana';

        // Prompts
        const settings = appState.quizSettings || { targetLevel: '一般', customInstructions: '' };
        if (levelInput) levelInput.value = settings.targetLevel || '一般';
        if (instructionsInput) instructionsInput.value = settings.customInstructions || '';
    }
}
