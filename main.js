
import { appState } from './modules/state.js';
import { loadData, saveApiKey, resetAllData } from './modules/storage.js';
import { showScreen, updateStatsUI, updateMaterialSelectUI, updateReportUI } from './modules/ui.js';
import { generateQuizFromText, generateQuizFromUrl, extractTextFromPDF, generateMaterialMetadata, generateQuestionsWithAI, generateImagesForQuestions, updateGeneratingStatus, regenerateImages, closePreviewAndGoHome } from './modules/api.js';
import { startQuiz } from './modules/game.js';
import { initLibrary, showMaterialsLibrary } from './modules/library.js';
import { showReviewList } from './modules/review.js';
import { checkForSharedCertificate, checkForSharedMaterial, copyShareURL, generateQRCode } from './modules/share.js';
import { initAuth, signInWithGoogle, signOut } from './modules/auth.js';
import { initSettings } from './modules/settings.js';

// Initialize
let pendingGenContext = null; // Stores data for generation pending customization
document.addEventListener('DOMContentLoaded', async () => {
    loadData();
    initAuth(); // Initialize Supabase auth

    // Check for shared content (async for Supabase fetch)
    const isSharedCert = checkForSharedCertificate();
    const isSharedMaterial = await checkForSharedMaterial(startQuiz);
    const isShared = isSharedCert || isSharedMaterial;

    if (!isShared) {
        initHomeScreen();
    }

    initLibrary(); // Setup library listeners
    initSettings(); // Setup settings listeners
    setupEventListeners();

    // Auth event listeners
    document.getElementById('login-btn')?.addEventListener('click', signInWithGoogle);
    document.getElementById('logout-btn')?.addEventListener('click', signOut);
});

export function initHomeScreen() {
    updateStatsUI();
    updateMaterialSelectUI();
    showScreen('home-screen');
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.home-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.home-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.home-tab-content').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            const tabId = e.target.dataset.tab;
            document.getElementById(`tab-${tabId}`).classList.add('active');

            if (tabId === 'report') {
                updateReportUI();
            }
        });
    });

    document.querySelectorAll('.mode-tab-compact').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-tab-compact').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.input-mode').forEach(m => m.classList.remove('active'));
            e.target.classList.add('active');
            const mode = e.target.dataset.mode;
            document.getElementById(`${mode}-mode`).classList.add('active');
        });
    });

    // Start Quiz
    document.getElementById('start-quiz-btn')?.addEventListener('click', startQuiz);

    // Library & Review
    document.getElementById('manage-references-btn')?.addEventListener('click', showMaterialsLibrary);
    document.getElementById('review-count-card')?.addEventListener('click', showReviewList);
    document.getElementById('back-to-home-btn')?.addEventListener('click', initHomeScreen);
    document.getElementById('back-to-home-from-review-btn')?.addEventListener('click', initHomeScreen);
    document.getElementById('back-to-library-btn')?.addEventListener('click', showMaterialsLibrary);

    // API Key listeners handled in settings.js

    // Share Modal
    document.getElementById('close-share-modal')?.addEventListener('click', () => {
        document.getElementById('share-modal').classList.add('hidden');
    });

    // Quiz Preview Modal
    document.getElementById('close-preview-modal')?.addEventListener('click', closePreviewAndGoHome);
    document.getElementById('close-preview-btn')?.addEventListener('click', closePreviewAndGoHome);
    document.getElementById('regenerate-images-btn')?.addEventListener('click', regenerateImages);

    document.getElementById('copy-url-btn')?.addEventListener('click', async () => {
        // Use currentMaterialId first as it matches the detailed view or quiz session
        let materialId = appState.currentMaterialId;

        // Validation: matches a real material ID?
        const isRealMaterial = appState.materials.some(m => m.id === materialId);
        if (!isRealMaterial) {
            // Fallback to selectedMaterial if it's a real ID (not 'review-priority')
            const selectedIsReal = appState.materials.some(m => m.id === appState.selectedMaterial);
            if (selectedIsReal) materialId = appState.selectedMaterial;
        }

        if (materialId) copyShareURL(materialId);
    });

    document.getElementById('show-qr-btn')?.addEventListener('click', () => {
        // Use currentMaterialId first
        let materialId = appState.currentMaterialId;

        const isRealMaterial = appState.materials.some(m => m.id === materialId);
        if (!isRealMaterial) {
            const selectedIsReal = appState.materials.some(m => m.id === appState.selectedMaterial);
            if (selectedIsReal) materialId = appState.selectedMaterial;
        }

        if (materialId) {
            generateQRCode(materialId);
            // Show both the parent container and QR container
            document.getElementById('share-result')?.classList.remove('hidden');
            document.getElementById('share-success')?.classList.add('hidden'); // Hide copy success
            document.getElementById('qr-code-container')?.classList.remove('hidden');
        }
    });

    // Reset Data
    // Reset Data listener moved to settings.js

    document.querySelectorAll('.count-btn-compact').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.count-btn-compact').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            appState.questionCount = parseInt(e.target.dataset.count);
        });
    });

    // Result Screen
    document.getElementById('continue-btn')?.addEventListener('click', startQuiz);
    document.getElementById('home-btn')?.addEventListener('click', initHomeScreen);
    document.getElementById('quit-btn')?.addEventListener('click', initHomeScreen);

    // PDF Generation
    document.getElementById('pdf-input')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        document.getElementById('file-name').textContent = file.name;
        document.getElementById('generate-btn').disabled = false;
    });

    // Generation Settings Modal Listeners
    const genModal = document.getElementById('generation-settings-modal');
    document.getElementById('close-gen-settings-modal')?.addEventListener('click', () => {
        genModal.classList.add('hidden');
    });

    document.getElementById('confirm-generate-btn')?.addEventListener('click', async () => {
        if (!pendingGenContext) return;
        genModal.classList.add('hidden');

        // Read selected level from active button
        const activeBtn = document.querySelector('#level-buttons .level-btn.active');
        const level = activeBtn?.dataset.value || '一般';
        const activeLangBtn = document.querySelector('#lang-buttons .level-btn.active');
        const outputLang = activeLangBtn?.dataset.value || '日本語';
        const instructions = document.getElementById('gen-setting-instructions').value;
        const customSettings = { targetLevel: level, customInstructions: instructions, outputLanguage: outputLang };

        try {
            if (pendingGenContext.type === 'pdf') {
                showScreen('generating-screen');
                updateGeneratingStatus('PDFを読み込んでいます...', 10);
                const text = await extractTextFromPDF(pendingGenContext.file);
                await generateQuizFromText(text, pendingGenContext.file.name, customSettings);
            } else if (pendingGenContext.type === 'text') {
                showScreen('generating-screen');
                updateGeneratingStatus('クイズを生成中...', 10);
                await generateQuizFromText(pendingGenContext.text, 'テキスト入力', customSettings);
            } else if (pendingGenContext.type === 'url') {
                showScreen('generating-screen');
                updateGeneratingStatus('URLを読み込んでいます...', 10);
                await generateQuizFromUrl(pendingGenContext.url, customSettings);
            }

        } catch (e) {
            console.error(e);
            alert('生成失敗: ' + e.message);
            initHomeScreen();
        } finally {
            pendingGenContext = null;
        }
    });

    // Helper to open generation settings
    const openGenSettings = (context) => {
        pendingGenContext = context;
        // Load Defaults
        const defaults = appState.quizSettings || { targetLevel: '一般', customInstructions: '' };
        // Set active button based on defaults
        document.querySelectorAll('#level-buttons .level-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.value === (defaults.targetLevel || '一般'));
        });
        // Populate instructions
        document.getElementById('gen-setting-instructions').value = defaults.customInstructions || '';

        genModal.classList.remove('hidden');
    };

    // Level button click handlers
    document.querySelectorAll('#level-buttons .level-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#level-buttons .level-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Language button click handlers
    document.querySelectorAll('#lang-buttons .level-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#lang-buttons .level-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    document.getElementById('generate-btn')?.addEventListener('click', async () => {
        const file = document.getElementById('pdf-input').files[0];
        if (!file) return;
        if (!appState.apiKey) {
            document.getElementById('settings-modal').classList.remove('hidden');
            return;
        }
        openGenSettings({ type: 'pdf', file: file });
    });

    document.getElementById('generate-from-text-btn')?.addEventListener('click', async () => {
        const inputEl = document.getElementById('text-input');
        const text = inputEl.value.trim();
        if (!text) {
            alert('テキストを入力してください');
            return;
        }
        if (!appState.apiKey) {
            document.getElementById('settings-modal').classList.remove('hidden');
            return;
        }
        openGenSettings({ type: 'text', text: text });
        inputEl.value = ''; // Clear input on success
    });

    document.getElementById('generate-from-url-btn')?.addEventListener('click', async () => {
        const url = document.getElementById('url-input').value.trim();
        if (!url) {
            alert('URLを入力してください');
            return;
        }
        if (!appState.apiKey) {
            document.getElementById('settings-modal').classList.remove('hidden');
            return;
        }
        openGenSettings({ type: 'url', url: url });
    });
}
