import os
import json
from flask import Flask, request, jsonify, render_template, send_from_directory

app = Flask(__name__, template_folder='templates', static_folder='static')

DATA_FILE = os.path.join(app.root_path, 'data', 'goals.json')

def load_goals():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        app.logger.error(f"Error loading goals file: {e}")
        return []

def save_goals(data):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    temp_file = DATA_FILE + ".tmp"
    with open(temp_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(temp_file, DATA_FILE)

@app.after_request
def apply_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/goals', methods=['GET'])
def get_goals():
    goals = load_goals()
    return jsonify({"success": True, "data": goals})

@app.route('/api/goals', methods=['POST'])
def update_goals():
    if not request.is_json:
        return jsonify({"success": False, "error": "Invalid payload format. Expected JSON"}), 400
    
    data = request.get_json()
    if not isinstance(data, list):
        return jsonify({"success": False, "error": "Goals must be a list of programs"}), 400
    
    try:
        save_goals(data)
        return jsonify({"success": True, "data": data})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "version": "1.0.0"})

if __name__ == '__main__':
    import sys
    port = int(os.environ.get('PORT', 8080))
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    app.run(host='127.0.0.1', port=port, debug=True)

