document.addEventListener('DOMContentLoaded', () => {
    // --- Глобальні налаштування та DOM елементи ---
    const API_URL = '';

    // Перевірка наявності основних елементів, щоб уникнути фатальних помилок
    if (!document.getElementById('stats') || !document.getElementById('search-word-form') || !document.getElementById('start-review-btn')) {
        console.error('Critical DOM elements are missing. Script will not run.');
        return;
    }

    // --- DOM елементи ---
    const statsDiv = document.getElementById('stats');
    const learnedThresholdInput = document.getElementById('learned-threshold');
    const blockSizeInput = document.getElementById('block-size');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const settingsStatus = document.getElementById('settings-status');
    const searchWordForm = document.getElementById('search-word-form');
    const newWordInput = document.getElementById('new-word-input');
    const searchWordBtn = document.getElementById('search-word-btn');
    const loadingDiv = document.getElementById('loading');
    const searchResultArea = document.getElementById('search-result-area');
    const startReviewBtn = document.getElementById('start-review-btn');
    const reviewArea = document.getElementById('review-area');
    const noCardsMessage = document.getElementById('no-cards-message');
    const reviewCounter = document.getElementById('review-counter');
    const sessionSummary = document.getElementById('session-summary');
    const summaryStats = document.getElementById('summary-stats');
    const startNewBlockBtn = document.getElementById('start-new-block-btn');
    const turkishWordP = document.getElementById('turkish-word');
    const translationsDiv = document.getElementById('translations');
    const cardBack = document.querySelector('.card-back');
    const reviewControls = document.getElementById('review-controls');
    const revealBtn = document.getElementById('reveal-btn');
    const feedbackButtonsDiv = document.getElementById('feedback-buttons');
    const knowBtn = document.getElementById('know-btn');
    const unsureBtn = document.getElementById('unsure-btn');
    const dontKnowBtn = document.getElementById('dont-know-btn');
    const nextCardBtn = document.getElementById('next-card-btn');

    // --- Змінні стану ---
    let reviewQueue = [];
    let currentCard = null;
    let cardsInBlock = 0;
    let sessionStatsData = {};

    // --- Допоміжні функції ---
    function highlightWord(text, word) {
        if (!text || !word) return text;
        try {
            const regex = new RegExp(`\\b(${word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})\\b`, 'gi');
            return text.replace(regex, '<strong>$1</strong>');
        } catch (e) {
            console.error("Regex error in highlightWord:", e);
            return text;
        }
    }

    function createTranslationsHTML(translations, wordToHighlight) {
        if (!Array.isArray(translations)) return '';
        return translations.map(t => `
            <div class="translation-block">
                <div class="ukrainian-translation">${t.ukrainian || ''}</div>
                <div class="example">
                    <p class="example-tr">🇹🇷 ${highlightWord(t.example_turkish, wordToHighlight)}</p>
                    <p class="example-uk">🇺🇦 ${t.example_ukrainian || ''}</p>
                </div>
            </div>`).join('');
    }

    // --- API та логіка ---

    async function fetchStats() {
        try {
            const response = await fetch(`${API_URL}/api/stats`);
            if (!response.ok) throw new Error('Network response was not ok');
            const stats = await response.json();
            statsDiv.innerHTML = `
                <a href="lists.html?status=learned">✅ Вивчено: ${stats.learned}</a>
                <span>|</span>
                <a href="lists.html?status=learning">📚 Вчу: ${stats.learning}</a>
                <span>|</span>
                <a href="lists.html?status=new">🆕 Нових: ${stats.new}</a>
            `;
        } catch (error) {
            console.error("Could not fetch stats:", error);
            statsDiv.innerHTML = "<span>Не вдалося завантажити статистику</span>";
        }
    }

    async function fetchSettings() {
        try {
            const response = await fetch(`${API_URL}/api/settings`);
            if (!response.ok) throw new Error('Network response was not ok');
            const settings = await response.json();
            learnedThresholdInput.value = settings.learned_threshold;
            blockSizeInput.value = settings.block_size;
        } catch (error) {
            console.error("Could not fetch settings:", error);
        }
    }

    async function updateSettings() {
        saveSettingsBtn.disabled = true;
        settingsStatus.className = '';
        settingsStatus.textContent = 'Зберігаю...';

        try {
            await fetch(`${API_URL}/api/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    learned_threshold: learnedThresholdInput.value,
                    block_size: blockSizeInput.value
                }),
            });
            settingsStatus.textContent = 'Збережено!';
        } catch (error) {
            settingsStatus.textContent = 'Помилка збереження!';
            console.error("Could not update settings:", error);
        }

        setTimeout(() => {
            settingsStatus.classList.add('hidden');
            saveSettingsBtn.disabled = false;
        }, 2000);
    }
    
    async function handleSearchWord(event) {
        event.preventDefault();
        const word = newWordInput.value.trim();
        if (!word) return;

        searchWordBtn.disabled = true;
        loadingDiv.classList.remove('hidden');
        searchResultArea.classList.add('hidden');
        searchResultArea.innerHTML = '';

        try {
            const response = await fetch(`${API_URL}/api/words/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Unknown error');

            searchResultArea.innerHTML = `
                <h3 class="card-title">Результат пошуку для "${result.turkish_word}"</h3>
                ${createTranslationsHTML(result.translations, result.turkish_word)}
                <button class="add-card-btn-from-search">Додати цю картку</button>
            `;
            searchResultArea.classList.remove('hidden');

            const addBtn = searchResultArea.querySelector('.add-card-btn-from-search');
            addBtn.addEventListener('click', () => handleAddCard(result, addBtn));

        } catch (error) {
            searchResultArea.innerHTML = `<p class="error" style="color:red;">Помилка: ${error.message}</p>`;
            searchResultArea.classList.remove('hidden');
        } finally {
            searchWordBtn.disabled = false;
            loadingDiv.classList.add('hidden');
        }
    }

    async function handleAddCard(cardData, button) {
        button.disabled = true;
        button.textContent = 'Додавання...';

        try {
            const response = await fetch(`${API_URL}/api/cards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cardData),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            
            button.textContent = '✅ Додано!';
            button.style.backgroundColor = 'var(--success-color)';
            fetchStats();
            newWordInput.value = '';
        } catch(error) {
            button.textContent = `Помилка: ${error.message}`;
            button.style.backgroundColor = 'var(--secondary-color)';
            button.disabled = false;
        }
    }

    // --- Логіка повторення ---
    function resetSessionStats() {
        sessionStatsData = {
            correct: 0,
            unsure: 0,
            incorrect: 0,
            becameLearned: 0,
        };
    }

    async function startReviewBlock() {
        startReviewBtn.classList.add('hidden');
        noCardsMessage.classList.add('hidden');
        sessionSummary.classList.add('hidden');
        resetSessionStats();
        
        try {
            const response = await fetch(`${API_URL}/api/cards/review?limit=${blockSizeInput.value}`);
            if (!response.ok) throw new Error('Failed to fetch cards');
            reviewQueue = await response.json();
            cardsInBlock = reviewQueue.length;

            if (cardsInBlock > 0) {
                reviewArea.classList.remove('hidden');
                showNextCard();
            } else {
                noCardsMessage.classList.remove('hidden');
                startReviewBtn.classList.remove('hidden');
            }
        } catch (error) {
            console.error("Could not start review block:", error);
            noCardsMessage.textContent = "Не вдалося завантажити картки. Спробуйте ще раз.";
            noCardsMessage.classList.remove('hidden');
            startReviewBtn.classList.remove('hidden');
        }
    }

    function showNextCard() {
        if (reviewQueue.length === 0 && cardsInBlock > 0) {
            showSessionSummary();
            return;
        }

        currentCard = reviewQueue.shift();
        
        cardBack.classList.add('hidden');
        reviewControls.classList.remove('hidden');
        revealBtn.classList.remove('hidden');
        feedbackButtonsDiv.classList.add('hidden');
        nextCardBtn.classList.add('hidden');
        
        const remaining = cardsInBlock - reviewQueue.length;
        reviewCounter.textContent = `Картка: ${remaining}/${cardsInBlock}`;
        
        turkishWordP.textContent = currentCard.turkish_word;
        translationsDiv.innerHTML = createTranslationsHTML(currentCard.translations, currentCard.turkish_word);
    }

    function revealCard() {
        cardBack.classList.remove('hidden');
        revealBtn.classList.add('hidden');
        feedbackButtonsDiv.classList.remove('hidden');
    }

    async function handleFeedback(feedbackType) {
        try {
            const response = await fetch(`${API_URL}/api/cards/${currentCard.id}/review`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedback: feedbackType }),
            });
            const data = await response.json();

            sessionStatsData[feedbackType]++;
            if(data.became_learned) {
                sessionStatsData.becameLearned++;
            }
            
            cardBack.classList.remove('hidden');
            feedbackButtonsDiv.classList.add('hidden');
            revealBtn.classList.add('hidden');
            nextCardBtn.classList.remove('hidden');
        } catch (error) {
            console.error("Could not submit feedback:", error);
        }
    }
    
    function showSessionSummary() {
        reviewArea.classList.add('hidden');
        summaryStats.innerHTML = `
            <p>✅ Знаю: ${sessionStatsData.correct}</p>
            <p>🤔 Невпевнений: ${sessionStatsData.unsure}</p>
            <p>❌ Не знаю: ${sessionStatsData.incorrect}</p>
            <hr>
            <p>⭐ Стали вивченими: ${sessionStatsData.becameLearned}</p>
        `;
        sessionSummary.classList.remove('hidden');
        fetchStats();
    }

    // --- Прив'язка обробників подій ---
    function attachEventListeners() {
        searchWordForm.addEventListener('submit', handleSearchWord);
        startReviewBtn.addEventListener('click', startReviewBlock);
        startNewBlockBtn.addEventListener('click', startReviewBlock);
        revealBtn.addEventListener('click', revealCard);
        
        knowBtn.addEventListener('click', () => handleFeedback('correct'));
        unsureBtn.addEventListener('click', () => handleFeedback('unsure'));
        dontKnowBtn.addEventListener('click', () => handleFeedback('incorrect'));
        
        nextCardBtn.addEventListener('click', showNextCard);
        saveSettingsBtn.addEventListener('click', updateSettings);
    }

    // --- Ініціалізація ---
    function init() {
        attachEventListeners();
        fetchStats();
        fetchSettings();
    }

    init();
});
