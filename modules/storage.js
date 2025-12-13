import { appState } from './state.js';
import { supabase } from './supabase.js';
import { DEFAULT_PROMPTS } from './default_prompts.js';

// Load data from Storage or Supabase
export async function loadData() {
    // 1. Always load local data first for speed
    const localQuestions = JSON.parse(localStorage.getItem('questions') || '[]');
    const localMaterials = JSON.parse(localStorage.getItem('materials') || '[]');
    const localStats = JSON.parse(localStorage.getItem('user_stats') || JSON.stringify({
        totalAnswered: 0,
        correctAnswers: 0,
        lastStudyDate: null,
        streak: 0
    }));

    appState.questions = localQuestions;
    appState.materials = localMaterials;
    appState.userStats = localStats;
    appState.questions = localQuestions;
    appState.materials = localMaterials;
    appState.userStats = localStats;
    appState.apiKey = localStorage.getItem('openai_api_key') || '';

    // Load quiz settings (customizations)
    const localSettings = JSON.parse(localStorage.getItem('quiz_settings') || 'null');
    if (localSettings) {
        appState.quizSettings = localSettings;
    }

    // 2. If logged in, fetch latest from Supabase and merge
    if (appState.currentUser) {
        await syncWithSupabase();
    }
}

// Sync local data with Supabase
export async function syncWithSupabase() {
    if (!appState.currentUser) return;
    const userId = appState.currentUser.id;

    try {
        // --- PROFILES (Stats) ---
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError && profileError.code !== 'PGRST116') {
            console.error('Profile fetch error:', profileError);
        }

        if (profile) {
            // Merge stats: use higher value (progress never decreases)
            const mergedStats = {
                totalAnswered: Math.max(profile.total_answered || 0, appState.userStats.totalAnswered || 0),
                correctAnswers: Math.max(profile.correct_answers || 0, appState.userStats.correctAnswers || 0),
                lastStudyDate: profile.last_study_date || appState.userStats.lastStudyDate,
                streak: Math.max(profile.streak || 0, appState.userStats.streak || 0)
            };
            appState.userStats = mergedStats;
            localStorage.setItem('user_stats', JSON.stringify(appState.userStats));

            // Merge Settings (Quiz Customization)
            if (profile.settings && profile.settings.quizSettings) {
                appState.quizSettings = profile.settings.quizSettings;
                localStorage.setItem('quiz_settings', JSON.stringify(appState.quizSettings));
            }

            // Push merged stats and settings back to server
            await supabase.from('profiles').update({
                total_answered: mergedStats.totalAnswered,
                correct_answers: mergedStats.correctAnswers,
                streak: mergedStats.streak,
                settings: { quizSettings: appState.quizSettings },
                updated_at: new Date().toISOString()
            }).eq('id', userId);
        } else {
            // No profile exists, create from local
            await supabase.from('profiles').insert({
                id: userId,
                email: appState.currentUser.email,
                full_name: appState.currentUser.user_metadata?.full_name,
                avatar_url: appState.currentUser.user_metadata?.avatar_url,
                total_answered: appState.userStats.totalAnswered,
                correct_answers: appState.userStats.correctAnswers,
                last_study_date: appState.userStats.lastStudyDate,
                streak: appState.userStats.streak,
                settings: { quizSettings: appState.quizSettings }
            });
        }

        // --- MATERIALS ---
        const { data: remoteMaterials } = await supabase
            .from('materials')
            .select('*')
            .eq('user_id', userId);

        const serverMaterialIds = new Set((remoteMaterials || []).map(m => String(m.id)));
        const localMaterialIds = new Set(appState.materials.map(m => String(m.id)));

        // PULL: Add server items missing locally
        (remoteMaterials || []).forEach(rm => {
            if (!localMaterialIds.has(String(rm.id))) {
                appState.materials.push(rm);
            }
        });

        // PUSH: Upload local items missing on server
        const materialsToUpload = appState.materials.filter(m => !serverMaterialIds.has(String(m.id)));

        for (const m of materialsToUpload) {
            await saveMaterialToCloud(m);
        }

        saveMaterials();

        // --- QUESTIONS ---
        const { data: remoteQuestions } = await supabase
            .from('questions')
            .select('*')
            .eq('user_id', userId);

        const serverQuestionIds = new Set((remoteQuestions || []).map(q => String(q.id)));
        const localQuestionIds = new Set(appState.questions.map(q => String(q.id)));

        // PULL: Add server items missing locally
        (remoteQuestions || []).forEach(rq => {
            if (!localQuestionIds.has(String(rq.id))) {
                appState.questions.push(rq);
            } else {
                // Merge learning progress (higher review_count wins)
                const localQ = appState.questions.find(q => String(q.id) === String(rq.id));
                if (localQ && (rq.review_count || 0) > (localQ.reviewCount || 0)) {
                    localQ.reviewCount = rq.review_count;
                    localQ.lastReviewed = rq.last_reviewed;
                    localQ.easeFactor = rq.ease_factor;
                }
            }
        });

        // PUSH: Upload local items missing on server
        const questionsToUpload = appState.questions.filter(q => !serverQuestionIds.has(String(q.id)));

        for (const q of questionsToUpload) {
            await saveQuestionToCloud(q);
        }

        saveQuestions();


    } catch (e) {
        console.error('Sync Error:', e);
    }
}

export async function saveQuestions() {
    localStorage.setItem('questions', JSON.stringify(appState.questions));

    // Cloud Sync
    if (appState.currentUser) {
        // Find unsynced or updated questions? 
        // For simplicity, we just upsert the CURRENTLY active/changed question in game.js usually.
        // But here we might save all. 
        // CAUTION: Saving ALL questions every time is heavy.
        // Better strategy: Only save specific changed items.
        // BUT, since we changed the signature to just saveQuestions(), let's try to bulk upsert 
        // only if list is small, or just rely on manual trigger?

        // Let's rely on explicit save when adding/updating.
    }
}

// New explicit helper to save a single question to cloud
export async function saveQuestionToCloud(question) {
    if (!appState.currentUser) return;

    // Skip legacy IDs (non-UUID format) to prevent FK errors
    const isUUID = (id) => typeof id === 'string' && id.includes('-');
    if (!isUUID(String(question.id))) {
        return; // Silently skip legacy format
    }
    if (question.materialId && !isUUID(String(question.materialId))) {
        return; // Silently skip legacy format
    }

    // Map correctIndex (number) to correct_answer (string) if needed
    let correctAnswer = question.correctAnswer;
    if (correctAnswer === undefined || correctAnswer === null) {
        // Try correctIndex - convert number to the actual answer text
        if (question.correctIndex !== undefined && question.choices) {
            correctAnswer = question.choices[question.correctIndex];
        } else {
            correctAnswer = String(question.correctIndex || 0);
        }
    }

    const qData = {
        id: String(question.id), // Ensure ID is string
        user_id: appState.currentUser.id,
        material_id: question.materialId ? String(question.materialId) : null,
        question_text: question.question || question.text || 'No question text',
        choices: question.choices || [],
        correct_answer: correctAnswer || 'Unknown',
        explanation: question.explanation || '',
        review_count: question.reviewCount || 0,
        last_reviewed: question.lastReviewed || null,
        ease_factor: question.easeFactor || 2.5,
        image_url: question.imageUrl || null,
        image_grid_index: question.imageGridIndex !== undefined ? question.imageGridIndex : null
    };

    const { error } = await supabase.from('questions').upsert(qData);
    if (error) console.error('Cloud Save Q Error:', error.message, error.details, 'Question:', question.id);
}

export async function saveMaterials() {
    localStorage.setItem('materials', JSON.stringify(appState.materials));
}

// Helper to save new material to cloud
export async function saveMaterialToCloud(material) {
    if (!appState.currentUser) return;

    // Skip legacy IDs (non-UUID format)
    const isUUID = (id) => typeof id === 'string' && id.includes('-');
    if (!isUUID(String(material.id))) {
        return; // Silently skip legacy format
    }

    const mData = {
        id: material.id,
        user_id: appState.currentUser.id,
        title: material.title,
        content: material.content,
        source_name: material.fileName,
        // tags? schema didn't have tags... let's ignore for now or add to content?
    };

    const { error } = await supabase.from('materials').upsert(mData);
    if (error) {
        console.error('Cloud Save Material Error:', error);
        throw error; // Throw so API stops
    }
}

export async function saveUserStats() {
    localStorage.setItem('user_stats', JSON.stringify(appState.userStats));

    // Cloud Sync
    if (appState.currentUser) {
        const { error } = await supabase.from('profiles').update({
            total_answered: appState.userStats.totalAnswered,
            correct_answers: appState.userStats.correctAnswers,
            last_study_date: appState.userStats.lastStudyDate,
            streak: appState.userStats.streak,
            updated_at: new Date().toISOString()
        }).eq('id', appState.currentUser.id);

        if (error) console.error('Cloud Stats Error:', error.message, error.details);
    }
}

export function saveApiKey(key) {
    localStorage.setItem('openai_api_key', key);
    appState.apiKey = key;
}

export async function saveSettings() {
    localStorage.setItem('quiz_settings', JSON.stringify(appState.quizSettings));

    // Cloud Sync
    if (appState.currentUser) {
        const { error } = await supabase.from('profiles').update({
            settings: { quizSettings: appState.quizSettings },
            updated_at: new Date().toISOString()
        }).eq('id', appState.currentUser.id);

        if (error) console.error('Cloud Settings Save Error:', error);
    }
}

export async function resetAllData() {
    localStorage.removeItem('questions');
    localStorage.removeItem('materials');
    localStorage.removeItem('user_stats');

    if (appState.currentUser) {
        // Optional: clear cloud data too?
        // Probably safer NOT to delete cloud data on a simple reset button unless explicit.
    }

    appState.questions = [];
    appState.materials = [];
    appState.userStats = {
        totalAnswered: 0,
        correctAnswers: 0,
        lastStudyDate: null,
        streak: 0
    };
}

// Cloud Deletion
export async function deleteMaterialFromCloud(materialId) {
    if (!appState.currentUser) return;

    // Delete questions first (if no cascade)
    const { error: qError } = await supabase.from('questions').delete().eq('material_id', materialId);
    if (qError) console.error('Cloud Delete Questions Error:', qError);

    const { error } = await supabase.from('materials').delete().eq('id', materialId);
    if (error) console.error('Cloud Delete Material Error:', error);
}
