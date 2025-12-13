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
export function generateShareURL(materialId) {
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) return null;
    const questions = appState.questions.filter(q => q.materialId === materialId);
    const shareData = {
        version: 1,
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
            explanation: q.explanation.substring(0, 100) + (q.explanation.length > 100 ? '...' : ''),
            difficulty: q.difficulty,
            sourceSection: q.sourceSection,
            tags: q.tags
        }))
    };
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(shareData));
    const baseURL = window.location.href.split('?')[0];
    return `${baseURL}?share=${compressed}`;
}

export function checkForSharedMaterial(startQuizCallback) {
    const urlParams = new URLSearchParams(window.location.search);
    const share = urlParams.get('share');
    if (!share) return;

    try {
        const decompressed = LZString.decompressFromEncodedURIComponent(share);
        if (!decompressed) throw new Error('URL invalid');
        const shareData = JSON.parse(decompressed);
        if (shareData.version !== 1) throw new Error('Invalid version');

        const newMaterialId = importSharedMaterial(shareData);
        showSharedQuizLanding(newMaterialId, shareData, startQuizCallback);
    } catch (err) {
        console.error(err);
        alert('共有データの読み込みに失敗しました');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function importSharedMaterial(shareData) {
    const newMaterialId = 'mat_' + Date.now();
    const newReferenceId = 'ref_' + Date.now();
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
        id: Date.now() + index + Math.random(),
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

export function copyShareURL(materialId) {
    const url = generateShareURL(materialId);
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
        const material = appState.materials.find(m => m.id === materialId);
        if (material) {
            material.hasBeenShared = true;
            saveMaterials();
        }
        alert('URLをコピーしました！');
    }).catch(err => console.error(err));
}

export function generateQRCode(materialId) {
    const url = generateShareURL(materialId);
    const qrContainer = document.getElementById('qr-code');
    qrContainer.innerHTML = ''; // Clear previous

    // Ensure container is visible before generation causing layout issues? 
    // Usually library handles it but better safe.
    // QRCode library expects element.
    try {
        new QRCode(qrContainer, {
            text: url,
            width: 180, // slightly smaller to fit padding
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
