import os
import json
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///flashcards.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# --- Моделі даних ---
class Card(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    turkish_word = db.Column(db.String(100), unique=True, nullable=False)
    translations_json = db.Column(db.Text, nullable=False)
    correct_repetitions = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default='new')

    def to_dict(self):
        return {
            "id": self.id,
            "turkish_word": self.turkish_word,
            "translations": json.loads(self.translations_json),
            "status": self.status,
            "correct_repetitions": self.correct_repetitions
        }

class Setting(db.Model):
    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.String(100), nullable=False)

# --- Хелпери для налаштувань ---
def get_setting(key, default_value):
    setting = Setting.query.get(key)
    if setting:
        return type(default_value)(setting.value)
    new_setting = Setting(key=key, value=str(default_value))
    db.session.add(new_setting)
    db.session.commit()
    return default_value

def set_setting(key, value):
    setting = Setting.query.get(key)
    if setting:
        setting.value = str(value)
    else:
        setting = Setting(key=key, value=str(value))
        db.session.add(setting)
    db.session.commit()

# --- API Ендпоінти ---

@app.route('/api/words/search', methods=['POST'])
def search_word():
    """Шукає слово через OpenAI, але не зберігає його."""
    data = request.json
    turkish_word = data.get('word')

    if not turkish_word:
        return jsonify({"error": "Word is required"}), 400

    try:
        prompt = f"""
        Translate the Turkish word "{turkish_word}" into its main Ukrainian meanings.
        For each meaning, provide one clear and simple example sentence in Turkish and its translation into Ukrainian.
        The output must be a valid JSON object with the following structure:
        {{
          "translations": [
            {{
              "ukrainian": "...",
              "example_turkish": "...",
              "example_ukrainian": "..."
            }}
          ]
        }}
        """
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        ai_response_data = json.loads(response.choices[0].message.content)
        
        # Повертаємо знайдені дані разом з оригінальним словом
        return jsonify({
            "turkish_word": turkish_word,
            "translations": ai_response_data.get("translations", [])
        })

    except Exception as e:
        print(f"Error searching word: {e}")
        return jsonify({"error": "Failed to search for the word"}), 500

@app.route('/api/cards', methods=['POST'])
def create_card():
    """Створює картку з уже готовими даними."""
    data = request.json
    turkish_word = data.get('turkish_word')
    translations = data.get('translations')

    if not turkish_word or not translations:
        return jsonify({"error": "Turkish word and translations are required"}), 400

    existing_card = Card.query.filter_by(turkish_word=turkish_word).first()
    if existing_card:
        return jsonify({"error": "Card already exists"}), 409

    new_card = Card(
        turkish_word=turkish_word,
        translations_json=json.dumps(translations)
    )
    db.session.add(new_card)
    db.session.commit()
    return jsonify(new_card.to_dict()), 201


@app.route('/api/cards/review', methods=['GET'])
def get_cards_for_review():
    limit = request.args.get('limit', default=10, type=int)
    
    cards = Card.query.filter(Card.status != 'learned').order_by(db.func.random()).limit(limit).all()
    
    if not cards and Card.query.count() > 0:
        cards = Card.query.filter_by(status='learned').order_by(db.func.random()).limit(limit).all()
        
    return jsonify([card.to_dict() for card in cards])

@app.route('/api/cards/list/<status>', methods=['GET'])
def get_cards_by_status(status):
    """Повертає список карток за статусом."""
    valid_statuses = ['new', 'learning', 'learned']
    if status not in valid_statuses:
        return jsonify({"error": "Invalid status"}), 400
        
    cards = Card.query.filter_by(status=status).order_by(Card.turkish_word).all()
    return jsonify([card.to_dict() for card in cards])

@app.route('/api/cards/<int:card_id>/review', methods=['PUT'])
def review_card(card_id):
    card = Card.query.get_or_404(card_id)
    feedback = request.json.get('feedback')

    learned_threshold = get_setting('learned_threshold', 3)
    
    initial_status = card.status
    
    if feedback == 'correct':
        card.correct_repetitions += 1
        if card.correct_repetitions >= learned_threshold:
            card.status = 'learned'
        else:
            card.status = 'learning'
    elif feedback == 'unsure':
        card.correct_repetitions = max(0, card.correct_repetitions - 1)
        card.status = 'learning'
    elif feedback == 'incorrect':
        card.correct_repetitions = 0
        card.status = 'learning'

    db.session.commit()
    
    response_data = card.to_dict()
    response_data['became_learned'] = (initial_status != 'learned' and card.status == 'learned')
    
    return jsonify(response_data)

@app.route('/api/stats', methods=['GET'])
def get_stats():
    total = Card.query.count()
    learned = Card.query.filter_by(status='learned').count()
    learning = Card.query.filter_by(status='learning').count()
    new = Card.query.filter_by(status='new').count()
    return jsonify({
        "total": total,
        "learned": learned,
        "learning": learning,
        "new": new
    })

@app.route('/api/settings', methods=['GET'])
def get_settings():
    learned_threshold = get_setting('learned_threshold', 3)
    block_size = get_setting('block_size', 10)
    return jsonify({
        'learned_threshold': learned_threshold,
        'block_size': block_size
        })

@app.route('/api/settings', methods=['PUT'])
def update_settings():
    data = request.json
    new_threshold = data.get('learned_threshold')
    new_block_size = data.get('block_size')

    if new_threshold and int(new_threshold) > 0:
        set_setting('learned_threshold', int(new_threshold))
    if new_block_size and int(new_block_size) > 0:
        set_setting('block_size', int(new_block_size))
        
    return jsonify({'message': 'Settings updated successfully'})

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5001)
