from flask import Flask, render_template
import json
import os

app = Flask(__name__)

def load_data():
    filename = 'sbox_data_full.json'
    try:
        with open(filename, 'r') as f:
            data = json.load(f)
        return data
    except FileNotFoundError:
        return None

@app.route('/')
def index():
    # Load data dari file JSON
    dataset = load_data()
    
    if dataset is None:
        return "<h1>Error: File sbox_data_full.json tidak ditemukan!</h1><p>Pastikan kamu sudah download dari Colab dan taruh di folder yang sama dengan app.py</p>"
    
    return render_template('index.html', candidates=dataset['candidates'], metadata=dataset['metadata'])

if __name__ == '__main__':
    app.run(debug=True)
    