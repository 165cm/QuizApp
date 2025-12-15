import { appState } from './modules/state.js';
import { loadData, saveApiKey, resetAllData, cleanupOldImages, getFreeGenCount, incrementFreeGenCount } from './modules/storage.js';
import { showScreen, updateStatsUI, updateMaterialSelectUI, updateReportUI } from './modules/ui.js';
import { generateQuizFromText, generateQuizFromUrl, extractTextFromPDF, generateMaterialMetadata, generateQuestionsWithAI, generateImagesForQuestions, updateGeneratingStatus, regenerateImages, closePreviewAndGoHome } from './modules/api.js';
import { startQuiz } from './modules/game.js';
import { initLibrary, showMaterialsLibrary, showPublicLibrary } from './modules/library.js';
import { showReviewList } from './modules/review.js';
import { checkForSharedCertificate, checkForSharedMaterial, copyShareURL, generateQRCode } from './modules/share.js';
import { initAuth, signInWithGoogle, signOut } from './modules/auth.js';
import { initSettings, updateSettingsUI } from './modules/settings.js';

// Initialize
let pendingGenContext = null; // Stores data for generation pending customization
document.addEventListener('DOMContentLoaded', async () => {
    try {
        loadData().then(() => cleanupOldImages()); // Load data then cleanup old images
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
    } catch (e) {
        console.error('Initialization error:', e);
    } finally {
        // Hide global loader with fade out
        const loader = document.getElementById('global-loader');
        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }
    }
});

export function initHomeScreen() {
    updateStatsUI();
    updateMaterialSelectUI();
    showScreen('home-screen');
    updateNavActiveState('home', 'start');
}

// Helper to update global nav active state
function updateNavActiveState(screen, tab = null) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.screen === screen) {
            if (tab && item.dataset.tab === tab) {
                item.classList.add('active');
            } else if (!tab && !item.dataset.tab) {
                item.classList.add('active');
            }
        }
    });
}

function setupEventListeners() {
    // Global Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            const screen = e.target.closest('[data-screen]')?.dataset.screen;
            const tab = e.target.closest('[data-tab]')?.dataset.tab;

            // Action handling removed as settings is now a screen
            // Update active state
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            if (screen === 'home') {
                updateStatsUI();
                updateMaterialSelectUI();
                showScreen('home-screen');
                if (tab) {
                    // Switch to specific tab
                    document.querySelectorAll('.home-tab-content').forEach(c => c.classList.remove('active'));
                    document.getElementById(`tab-${tab}`)?.classList.add('active');

                    if (tab === 'report') {
                        updateReportUI();
                    }
                }
            } else if (screen === 'references') {
                showMaterialsLibrary();
                showScreen('references-screen');
                updateNavActiveState('references');
            } else if (screen === 'settings') {
                updateSettingsUI();
                showScreen('settings-screen');
                updateNavActiveState('settings');
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
    document.getElementById('review-count-card')?.addEventListener('click', showReviewList);
    document.getElementById('back-to-home-btn')?.addEventListener('click', initHomeScreen);
    document.getElementById('back-to-home-from-review-btn')?.addEventListener('click', initHomeScreen);
    // Public Gallery Navigation
    document.getElementById('go-to-public-btn')?.addEventListener('click', () => {
        showPublicLibrary();
    });

    // Back from Public Gallery
    document.getElementById('back-to-home-from-public-btn')?.addEventListener('click', () => {
        showScreen('home-screen');
    });

    document.getElementById('public-refresh-btn')?.addEventListener('click', () => {
        showPublicLibrary();
    });

    // Material Detail
    document.getElementById('back-to-library-btn')?.addEventListener('click', () => {
        showMaterialsLibrary();
    });

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

    // SNS Direct Share Buttons
    document.getElementById('share-x-btn')?.addEventListener('click', async () => {
        const materialId = appState.currentMaterialId;
        if (!materialId) return;
        const material = appState.materials.find(m => m.id === materialId);
        const title = material?.title || 'クイズ';

        // Generate URL first (without import since already imported at top)
        const { generateShareURL } = await import('./modules/share.js');
        const url = await generateShareURL(materialId);
        if (!url) {
            alert('シェアURLの生成に失敗しました');
            return;
        }

        const text = encodeURIComponent(`「${title}」のクイズに挑戦しよう！\n#QuizApp #クイズ`);
        const shareUrl = encodeURIComponent(url);
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${shareUrl}`, '_blank');
    });

    document.getElementById('share-line-btn')?.addEventListener('click', async () => {
        const materialId = appState.currentMaterialId;
        if (!materialId) return;
        const material = appState.materials.find(m => m.id === materialId);
        const title = material?.title || 'クイズ';

        const { generateShareURL } = await import('./modules/share.js');
        const url = await generateShareURL(materialId);
        if (!url) {
            alert('シェアURLの生成に失敗しました');
            return;
        }

        const text = encodeURIComponent(`「${title}」のクイズに挑戦しよう！\n${url}`);
        window.open(`https://social-plugins.line.me/lineit/share?text=${text}`, '_blank');
    });

    // Certificate Screen Buttons
    document.getElementById('share-certificate-btn')?.addEventListener('click', async () => {
        const { generateCertificateShareURL, copyToClipboard } = await import('./modules/share.js');
        const url = generateCertificateShareURL();

        if (navigator.share) {
            try {
                await navigator.share({
                    title: '認定証',
                    text: 'クイズ認定証を獲得しました！',
                    url: url
                });
            } catch (err) {
                console.log('Share API failed or cancelled, falling back to copy', err);
                copyToClipboard(url).then(() => alert('共有URLをコピーしました！'));
            }
        } else {
            // Fallback to Clipboard
            copyToClipboard(url).then(() => alert('共有URLをコピーしました！'));
        }
    });

    // Share Modal Copy Button (For Materials)
    document.getElementById('copy-url-btn')?.addEventListener('click', async () => {
        const { copyShareURL } = await import('./modules/share.js');
        if (appState.currentMaterialId) {
            await copyShareURL(appState.currentMaterialId);
        }
    });

    // Direct X Share from Certificate
    document.getElementById('share-x-cert-btn')?.addEventListener('click', async () => {
        const { generateCertificateShareURL } = await import('./modules/share.js');
        const url = generateCertificateShareURL();
        const text = encodeURIComponent(`クイズ認定証を獲得しました！\n#QuizApp #クイズ`);
        const shareUrl = encodeURIComponent(url);
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${shareUrl}`, '_blank');
    });

    document.getElementById('try-again-btn')?.addEventListener('click', () => {
        showScreen('home-screen'); // Request was "Home", not start quiz again
    });

    document.getElementById('create-own-quiz-btn')?.addEventListener('click', () => {
        showScreen('home-screen');
        // Click Create Tab
        document.querySelectorAll('.nav-item').forEach(btn => {
            if (btn.dataset.tab === 'generate') btn.click();
        });
    });

    // Auth Limit Modal
    document.getElementById('limit-login-btn')?.addEventListener('click', () => {
        document.getElementById('auth-limit-modal').classList.add('hidden');
        signInWithGoogle();
    });
    document.getElementById('close-auth-limit-modal')?.addEventListener('click', () => {
        document.getElementById('auth-limit-modal').classList.add('hidden');
    });

    // Share Modal Close
    document.getElementById('close-share-modal')?.addEventListener('click', () => {
        document.getElementById('share-modal').classList.add('hidden');
    });

    // Delete Modal Close
    document.getElementById('close-delete-modal')?.addEventListener('click', () => {
        document.getElementById('delete-modal').classList.add('hidden');
    });

    // Gen Settings Modal Close
    document.getElementById('close-gen-settings-modal')?.addEventListener('click', () => {
        document.getElementById('generation-settings-modal').classList.add('hidden');
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
    const copyrightCheckbox = document.getElementById('copyright-confirm-checkbox');
    const confirmGenBtn = document.getElementById('confirm-generate-btn');

    document.getElementById('close-gen-settings-modal')?.addEventListener('click', () => {
        genModal.classList.add('hidden');
        // Reset checkbox when closing
        if (copyrightCheckbox) copyrightCheckbox.checked = false;
        if (confirmGenBtn) confirmGenBtn.disabled = true;
    });

    // Copyright confirmation checkbox controls generate button
    copyrightCheckbox?.addEventListener('change', () => {
        if (confirmGenBtn) {
            confirmGenBtn.disabled = !copyrightCheckbox.checked;
        }
    });

    // Link to terms from confirmation section
    document.getElementById('confirm-terms-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('terms-modal')?.classList.remove('hidden');
    });

    confirmGenBtn?.addEventListener('click', async () => {
        if (!pendingGenContext) return;

        // Increment Free Count if guest
        if (!appState.currentUser) {
            incrementFreeGenCount();
        }

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

    // Helper: Generation Gatekeeper
    const executeGeneration = (callback) => {
        if (appState.currentUser) {
            callback();
            return;
        }
        const count = getFreeGenCount();
        if (count < 1) {
            callback();
            // We increment AFTER openGenSettings is called, but effectively here is fine too 
            // BUT wait, user might cancel. It's better to increment when confirm-generate-btn is clicked.
            // However, confirm-generate-btn listener is generic.
            // Let's increment loosely here or pass a flag.
            // Actually, incrementCount should happen on actual generation start (confirm-generate-btn).
            // But we can gatekeep here.
        } else {
            // Limit Reached
            const limitModal = document.getElementById('auth-limit-modal');
            if (limitModal) {
                limitModal.classList.remove('hidden');
            } else {
                // Fallback: モーダルがない場合はアラートで代替
                alert('無料生成回数の上限に達しました。ログインするとより多くのクイズを生成できます。');
            }
        }
    };

    document.getElementById('generate-btn')?.addEventListener('click', async () => {
        const file = document.getElementById('pdf-input').files[0];
        if (!file) return;

        executeGeneration(() => {

            openGenSettings({ type: 'pdf', file: file });
        });
    });

    document.getElementById('generate-from-text-btn')?.addEventListener('click', async () => {
        const inputEl = document.getElementById('text-input');
        const text = inputEl.value.trim();
        if (!text) {
            alert('テキストを入力してください');
            return;
        }

        executeGeneration(() => {

            openGenSettings({ type: 'text', text: text });
            inputEl.value = '';
        });
    });

    document.getElementById('generate-from-url-btn')?.addEventListener('click', async () => {
        const url = document.getElementById('url-input').value.trim();
        if (!url) {
            alert('URLを入力してください');
            return;
        }

        executeGeneration(() => {
            // if (!appState.apiKey) check removed for GAS usage
            openGenSettings({ type: 'url', url: url });
        });
    });
}
