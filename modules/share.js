import { appState } from './state.js';
import { saveMaterials, saveQuestions } from './storage.js';
import { showScreen } from './ui.js';

// Access globals
const LZString = window.LZString;
const QRCode = window.QRCode;

// --- Certificate ---
export function showCertificate() {
    const { correct, total } = appState.currentSession;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const quizTitle = appState.sharedQuizTitle || 'クイズ';

    document.getElementById('cert-quiz-title').textContent = quizTitle;
    document.getElementById('cert-score').textContent = `${accuracy}%`;
    document.getElementById('cert-detail').textContent = `(${total}問中${correct}問正解)`;

    const now = new Date();
    document.getElementById('cert-date').textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

    showScreen('certificate-screen');
}

export function generateCertificateShareURL() {
    const { correct, total } = appState.currentSession;
    const accuracy = Math.round((correct / total) * 100);
    const quizTitle = appState.sharedQuizTitle || 'クイズ';
    const certData = {
        version: 1, type: 'certificate',
        quizTitle, accuracy, correct, total,
        date: new Date().toISOString()
    };
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(certData));
    const baseURL = window.location.href.split('?')[0];
    return `${baseURL}?cert=${compressed}`;
}

export function checkForSharedCertificate() {
    const urlParams = new URLSearchParams(window.location.search);
    const cert = urlParams.get('cert');
    if (!cert) return false;

    try {
        const decompressed = LZString.decompressFromEncodedURIComponent(cert);
        if (!decompressed) throw new Error('URL invalid');
        const certData = JSON.parse(decompressed);
        if (certData.version !== 1 || certData.type !== 'certificate') throw new Error('Invalid version');

        showSharedCertificate(certData);
        return true;
    } catch (err) {
        console.error(err);
        alert('認定証の読み込みに失敗しました');
        window.history.replaceState({}, document.title, window.location.pathname);
        return false;
    }
}

function showSharedCertificate(certData) {
    const { quizTitle, accuracy, correct, total, date } = certData;
    document.getElementById('cert-quiz-title').textContent = quizTitle;
    document.getElementById('cert-score').textContent = `${accuracy}%`;
    document.getElementById('cert-detail').textContent = `(${total}問中${correct}問正解)`;
    const certDate = new Date(date);
    document.getElementById('cert-date').textContent = `${certDate.getFullYear()}年${certDate.getMonth() + 1}月${certDate.getDate()}日`;

    appState.isSharedQuiz = true;
    appState.sharedQuizTitle = quizTitle;
    appState.currentSession = { correct, total };

    const tryAgainBtn = document.getElementById('try-again-btn');
    if (tryAgainBtn) tryAgainBtn.style.display = 'none';

    const shareCertBtn = document.getElementById('share-certificate-btn');
    if (shareCertBtn) {
        shareCertBtn.textContent = '📤 私も結果をシェア';
        shareCertBtn.style.display = 'none';
    }
    showScreen('certificate-screen');
}

// --- Material Share ---

// Get Supabase client (shared across app)
function getSupabase() {
    return window.supabaseClient;
}

// Generate short share URL using Supabase storage
export async function generateShareURL(materialId) {
    console.log('🔵 generateShareURL called for:', materialId);
    console.log('🔵 Current materials:', appState.materials.map(m => m.id));

    const material = appState.materials.find(m => m.id === materialId);
    if (!material) {
        console.error('❌ Material not found in appState');
        return null;
    }
    const questions = appState.questions.filter(q => q.materialId === materialId);

    const shareData = {
        material: {
            title: material.title,
            summary: material.summary,
            tags: material.tags,
            fileName: material.fileName
        },
        questions: questions.map(q => ({
            question: q.question,
            choices: q.choices,
            correctIndex: q.correctIndex,
            explanation: q.explanation || '',
            difficulty: q.difficulty,
            sourceSection: q.sourceSection,
            tags: q.tags,
            imageUrl: q.imageUrl,
            imageGridIndex: q.imageGridIndex
        }))
    };

    const supabase = getSupabase();
    if (supabase) {
        try {
            console.log('🔵 Attempting to save to Supabase...');
            // Save to Supabase and get short ID
            const { data, error } = await supabase
                .from('shared_quizzes')
                .insert({
                    material_data: shareData.material,
                    questions_data: shareData.questions
                })
                .select('id')
                .single();

            if (error) {
                console.error('❌ Supabase insert error detailed:', error);
                throw error;
            }

            console.log('🟢 Supabase save success, ID:', data.id);
            // Fix: Use origin + pathname to avoid including hash (#) which breaks query param parsing
            const baseURL = window.location.origin + window.location.pathname;
            return `${baseURL}?s=${data.id}`;
        } catch (e) {
            console.error('Supabase share error:', e);
            // Fall back to LZ compression
        }
    }

    // Fallback: LZ compression (for offline or Supabase unavailable)
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify({ version: 1, ...shareData }));
    const baseURL = window.location.href.split('?')[0];
    return `${baseURL}?share=${compressed}`;
}

export async function checkForSharedMaterial(startQuizCallback) {
    console.log('🔵 checkForSharedMaterial called');
    console.log('🔵 Current URL:', window.location.href);

    const urlParams = new URLSearchParams(window.location.search);
    let shortId = urlParams.get('s');
    let share = urlParams.get('share');

    // Robust check: if params are missing in search, check hash (for #?s=... case)
    if (!shortId && !share && window.location.hash.includes('?')) {
        console.log('🔵 Checking hash for params:', window.location.hash);
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
        shortId = hashParams.get('s');
        share = hashParams.get('share');
    }

    console.log('🔵 Detected params - shortId:', shortId, 'share:', !!share);

    // Check for Supabase short ID first (?s=)
    if (shortId) {
        try {
            const supabase = getSupabase();
            if (!supabase) throw new Error('Supabase not available');

            console.log('🔵 Fetching from Supabase for ID:', shortId);
            const { data, error } = await supabase
                .from('shared_quizzes')
                .select('material_data, questions_data')
                .eq('id', shortId)
                .single();

            if (error) throw error;

            console.log('🟢 Data fetched from Supabase');
            const shareData = {
                material: data.material_data,
                questions: data.questions_data
            };

            const newMaterialId = importSharedMaterial(shareData);
            showSharedQuizLanding(newMaterialId, shareData, startQuizCallback);
            return true;
        } catch (err) {
            console.error('Supabase fetch error:', err);
            alert('共有クイズの読み込みに失敗しました。URLが無効か期限切れの可能性があります。');
            window.history.replaceState({}, document.title, window.location.pathname);
            return false;
        }
    }

    // Fallback: Check for legacy LZ compressed share (?share=)
    if (!share) return false;

    try {
        const decompressed = LZString.decompressFromEncodedURIComponent(share);
        if (!decompressed) throw new Error('URL invalid');
        const shareData = JSON.parse(decompressed);
        if (shareData.version !== 1) throw new Error('Invalid version');

        const newMaterialId = importSharedMaterial(shareData);
        showSharedQuizLanding(newMaterialId, shareData, startQuizCallback);
        return true;
    } catch (err) {
        console.error(err);
        alert('共有データの読み込みに失敗しました');
        window.history.replaceState({}, document.title, window.location.pathname);
        return false;
    }
}

function importSharedMaterial(shareData) {
    // Use UUID format for cloud sync compatibility
    const newMaterialId = crypto.randomUUID();
    const newReferenceId = crypto.randomUUID();
    const titleSuffix = shareData.material.title.endsWith(' (共有)') ? '' : ' (共有)';

    const newMaterial = {
        id: newMaterialId,
        title: shareData.material.title + titleSuffix,
        summary: shareData.material.summary,
        content: `# ${shareData.material.title}\n\n${shareData.material.summary}\n\n*この教材は共有URLからインポートされたため、元の本文は含まれていません。*`,
        tags: shareData.material.tags,
        fileName: shareData.material.fileName,
        uploadDate: new Date().toISOString(),
        questionIds: [],
        isShared: true
    };

    const newQuestions = shareData.questions.map((q, index) => ({
        id: crypto.randomUUID(),
        ...q,
        materialId: newMaterialId,
        lastReviewed: null,
        reviewCount: 0,
        easeFactor: 2.5,
        interval: 0,
        nextReview: null,
        reference: {
            id: newReferenceId,
            fileName: shareData.material.fileName,
            uploadDate: new Date().toISOString(),
            section: q.sourceSection || ''
        }
    }));

    newMaterial.questionIds = newQuestions.map(q => q.id);

    appState.materials.push(newMaterial);
    appState.questions.push(...newQuestions);
    saveMaterials();
    saveQuestions();

    return newMaterialId;
}

function showSharedQuizLanding(materialId, shareData, startQuizCallback) {
    const title = shareData.material.title;
    const questionCount = shareData.questions.length;

    document.getElementById('shared-quiz-title').textContent = title;
    document.getElementById('shared-quiz-count').textContent = questionCount;
    document.getElementById('shared-quiz-time').textContent = Math.ceil(questionCount / 2);

    showScreen('shared-quiz-landing');

    const startBtn = document.getElementById('start-shared-quiz-btn');
    // Remove old listeners by cloning
    const newBtn = startBtn.cloneNode(true);
    startBtn.parentNode.replaceChild(newBtn, startBtn);

    newBtn.addEventListener('click', () => {
        appState.currentMaterialId = materialId;
        appState.selectedMaterial = materialId;
        appState.isSharedQuiz = true;
        appState.sharedQuizTitle = title;
        if (startQuizCallback) startQuizCallback();
    });
}

export async function copyShareURL(materialId) {
    try {
        const url = await generateShareURL(materialId);
        if (!url) {
            alert('シェアURLの生成に失敗しました（データが見つからないかエラーが発生しました）');
            return;
        }

        await navigator.clipboard.writeText(url);
        const material = appState.materials.find(m => m.id === materialId);
        if (material) {
            material.hasBeenShared = true;
            saveMaterials();
        }

        // Show success message in UI
        document.getElementById('share-result')?.classList.remove('hidden');
        document.getElementById('share-success')?.classList.remove('hidden');
        document.getElementById('qr-code-container')?.classList.add('hidden');
    } catch (err) {
        console.error('Copy Share URL Error:', err);
        alert('エラーが発生しました: ' + (err.message || '詳細不明'));
    }
}

export async function generateQRCode(materialId) {
    const qrContainer = document.getElementById('qr-code');
    qrContainer.innerHTML = '<p style="color: #888;">生成中...</p>';

    const url = await generateShareURL(materialId);
    if (!url) {
        qrContainer.innerHTML = '<p style="color: #ef4444;">URL生成エラー</p>';
        return;
    }

    qrContainer.innerHTML = ''; // Clear loading message

    try {
        new QRCode(qrContainer, {
            text: url,
            width: 180,
            height: 180,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    } catch (e) {
        console.error('QR Generate Error', e);
        qrContainer.textContent = 'QRコード生成エラー';
    }

    const material = appState.materials.find(m => m.id === materialId);
    if (material) {
        material.hasBeenShared = true;
        saveMaterials();
    }
}

// --- Viral / Challenge Share ---

export async function shareChallenge(score, total, rankLabel, rankImageIndex = null, imageUrl = null) {
    // 1. Get Material ID (from current or from quiz questions)
    let materialId = appState.currentMaterialId;
    if (!materialId && appState.currentQuiz && appState.currentQuiz.length > 0) {
        materialId = appState.currentQuiz[0].materialId;
    }

    // 2. Prepare Text
    const title = materialId ?
        appState.materials.find(m => m.id === materialId)?.title : 'クイズ';
    const accuracy = Math.round((score / total) * 100);

    // Impactful Text
    let text = `🔥 【挑戦状】\n「${title || 'クイズ'}」で正解率 ${accuracy}% (${score}/${total}) を叩き出しました！\n\nランク: ${rankLabel} 🏆\n\nあなたはこのスコアを超えられますか？\n#QuizApp #Challenge\n`;

    // 3. Prepare URL (may fail if no material)
    let url = '';
    if (materialId) {
        try {
            url = await generateShareURL(materialId);
        } catch (e) {
            console.warn('URL generation failed', e);
        }
    }


    // 3. Prepare Image (if available)
    let filesArray = [];
    if (imageUrl && rankImageIndex !== null && navigator.share) {
        try {
            const blob = await cropGridImage(imageUrl, rankImageIndex);
            if (blob) {
                const file = new File([blob], "rank_result.png", { type: "image/png" });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    filesArray = [file];
                }
            }
        } catch (e) {
            console.error('Image processing failed for share:', e);
        }
    }

    // 4. Execute Share
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'クイズの挑戦状',
                text: text,
                url: url, // Some apps ignore URL if files are present, so append to text?
                files: filesArray.length > 0 ? filesArray : undefined
            });
        } catch (e) {
            // User cancelled or error
            console.log('Share API error or cancelled', e);
            // Fallback: Copy to clipboard if share failed/cancelled
            if (e.name !== 'AbortError') {
                copyToClipboard(`${text}\n${url}`);
                alert('リンクとメッセージをコピーしました！SNSに貼り付けて共有してください。');
            }
        }
    } else {
        // Fallback for Desktop
        const shareText = `${text}\n${url}`;
        copyToClipboard(shareText);
        alert('リンクとメッセージをクリップボードにコピーしました！\n(画像は保存して別途投稿してください)');
    }
}

function copyToClipboard(text) {
    // Use old-style method as fallback when document isn't focused
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    } catch (e) {
        console.error('Clipboard fallback failed', e);
        // Last resort: prompt user to copy manually
        prompt('以下をコピーしてください:', text);
    }
}


// Helper to crop 4x3 grid panel
async function cropGridImage(base64Url, index) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const totalCols = 4;
            const totalRows = 3;

            // Calculate panel size
            const panelW = img.width / totalCols;
            const panelH = img.height / totalRows;

            canvas.width = panelW;
            canvas.height = panelH;

            const ctx = canvas.getContext('2d');
            const col = index % totalCols;
            const row = Math.floor(index / totalCols);

            ctx.drawImage(
                img,
                col * panelW, row * panelH, panelW, panelH, // Source
                0, 0, panelW, panelH // Dest
            );

            canvas.toBlob(blob => resolve(blob), 'image/png');
        };
        img.onerror = () => resolve(null);
        img.src = base64Url;
    });
}
