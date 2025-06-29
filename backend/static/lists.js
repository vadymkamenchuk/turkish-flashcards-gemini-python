document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '';
    const listTitle = document.getElementById('list-title');
    const wordListContainer = document.getElementById('word-list-container');

    const statusTitles = {
        'new': 'Нові слова',
        'learning': 'Слова, що вивчаються',
        'learned': 'Вивчені слова'
    };

    function highlightWord(text, word) {
        if (!text || !word) return text;
        const regex = new RegExp(`\\b(${word})\\b`, 'gi');
        return text.replace(regex, '<strong>$1</strong>');
    }

    function createTranslationsHTML(translations, wordToHighlight) {
        return translations.map(t => `
            <div class="translation-block">
                <p class="ukrainian-translation">${t.ukrainian}</p>
                <div class="example">
                    <p>🇹🇷 ${highlightWord(t.example_turkish, wordToHighlight)}</p>
                    <p>🇺🇦 ${t.example_ukrainian}</p>
                </div>
            </div>`).join('');
    }

    async function loadWords() {
        const urlParams = new URLSearchParams(window.location.search);
        const status = urlParams.get('status');

        if (!status || !statusTitles[status]) {
            listTitle.textContent = 'Помилка';
            wordListContainer.innerHTML = '<p class="empty-list-message">Неправильний статус слів.</p>';
            return;
        }

        listTitle.textContent = statusTitles[status];

        try {
            const response = await fetch(`${API_URL}/api/cards/list/${status}`);
            const words = await response.json();

            if (words.length === 0) {
                wordListContainer.innerHTML = '<p class="empty-list-message">У цьому списку поки що немає слів.</p>';
                return;
            }

            const listHTML = words.map(word => `
                <div class="word-item">
                    <h3 class="word-item-header">${word.turkish_word}</h3>
                    ${createTranslationsHTML(word.translations, word.turkish_word)}
                </div>
            `).join('');

            wordListContainer.innerHTML = listHTML;

        } catch (error) {
            console.error('Error fetching word list:', error);
            wordListContainer.innerHTML = '<p class="empty-list-message">Не вдалося завантажити список слів.</p>';
        }
    }

    loadWords();
});
