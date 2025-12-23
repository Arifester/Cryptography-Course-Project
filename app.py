from flask import Flask, render_template, request, jsonify
import json
import os
import numpy as np
from PIL import Image
import io
import base64

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # Max 16MB upload

def load_data():
    filename = 'sbox_data_full.json'
    try:
        with open(filename, 'r') as f:
            data = json.load(f)
        return data
    except FileNotFoundError:
        return None

def get_sbox(sbox_id):
    """Get S-Box by ID"""
    dataset = load_data()
    if dataset:
        for candidate in dataset['candidates']:
            if candidate['id'] == sbox_id:
                return candidate['sbox']
    return None

def generate_inverse_sbox(sbox):
    """Generate inverse S-Box"""
    inv = [0] * 256
    for i in range(256):
        inv[sbox[i]] = i
    return inv

def encrypt_image(img_array, sbox):
    """Encrypt image using S-Box substitution"""
    encrypted = np.zeros_like(img_array)
    shape = img_array.shape
    
    if len(shape) == 3:  # Color image
        for channel in range(shape[2]):
            for i in range(shape[0]):
                for j in range(shape[1]):
                    encrypted[i, j, channel] = sbox[img_array[i, j, channel]]
    else:  # Grayscale
        for i in range(shape[0]):
            for j in range(shape[1]):
                encrypted[i, j] = sbox[img_array[i, j]]
    
    return encrypted

def decrypt_image(img_array, sbox):
    """Decrypt image using inverse S-Box"""
    inv_sbox = generate_inverse_sbox(sbox)
    return encrypt_image(img_array, inv_sbox)

def calculate_entropy(img_array):
    """Calculate Shannon entropy"""
    histogram, _ = np.histogram(img_array.flatten(), bins=256, range=(0, 256))
    histogram = histogram / histogram.sum()
    histogram = histogram[histogram > 0]
    entropy = -np.sum(histogram * np.log2(histogram))
    return entropy

def calculate_npcr(img1, img2):
    """Calculate Number of Pixels Change Rate"""
    if img1.shape != img2.shape:
        return 0.0
    diff = np.sum(img1 != img2)
    total = img1.size
    return (diff / total) * 100

def calculate_uaci(img1, img2):
    """Calculate Unified Average Changing Intensity"""
    if img1.shape != img2.shape:
        return 0.0
    diff = np.abs(img1.astype(float) - img2.astype(float))
    return (np.sum(diff) / (img1.size * 255)) * 100

def calculate_correlation(img_array, direction='horizontal'):
    """Calculate correlation coefficient"""
    if len(img_array.shape) == 3:
        img_array = np.mean(img_array, axis=2).astype(np.uint8)
    
    pairs = []
    if direction == 'horizontal':
        pairs = [(img_array[i, j], img_array[i, j+1]) 
                 for i in range(img_array.shape[0]) 
                 for j in range(img_array.shape[1]-1)]
    elif direction == 'vertical':
        pairs = [(img_array[i, j], img_array[i+1, j]) 
                 for i in range(img_array.shape[0]-1) 
                 for j in range(img_array.shape[1])]
    elif direction == 'diagonal':
        pairs = [(img_array[i, j], img_array[i+1, j+1]) 
                 for i in range(img_array.shape[0]-1) 
                 for j in range(img_array.shape[1]-1)]
    
    if len(pairs) == 0:
        return 0.0
    
    x, y = zip(*pairs)
    x, y = np.array(x), np.array(y)
    
    if np.std(x) == 0 or np.std(y) == 0:
        return 0.0
    
    correlation = np.corrcoef(x, y)[0, 1]
    return correlation

def calculate_mae(img1, img2):
    """Calculate Mean Absolute Error"""
    if img1.shape != img2.shape:
        return 0.0
    return np.mean(np.abs(img1.astype(float) - img2.astype(float)))

def image_to_base64(img_array):
    """Convert numpy array to base64 string"""
    img = Image.fromarray(img_array.astype(np.uint8))
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    img_str = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{img_str}"

@app.route('/')
def index():
    # Load data dari file JSON
    dataset = load_data()
    
    if dataset is None:
        return "<h1>Error: File sbox_data_full.json tidak ditemukan!</h1><p>Pastikan kamu sudah download dari Colab dan taruh di folder yang sama dengan app.py</p>"
    
    return render_template('index.html', candidates=dataset['candidates'], metadata=dataset['metadata'])

@app.route('/encrypt-image', methods=['POST'])
def encrypt_image_route():
    """Encrypt uploaded image"""
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image uploaded'}), 400
        
        file = request.files['image']
        sbox_id = request.form.get('sbox_id', 'AES_STD')
        
        # Load image
        img = Image.open(file.stream)
        img_array = np.array(img)
        
        # Get S-Box
        sbox = get_sbox(sbox_id)
        if not sbox:
            return jsonify({'error': 'S-Box not found'}), 400
        
        # Encrypt
        encrypted = encrypt_image(img_array, sbox)
        
        # Calculate metrics
        original_entropy = calculate_entropy(img_array)
        encrypted_entropy = calculate_entropy(encrypted)
        npcr = calculate_npcr(img_array, encrypted)
        uaci = calculate_uaci(img_array, encrypted)
        mae = calculate_mae(img_array, encrypted)
        
        # Correlation
        orig_corr_h = calculate_correlation(img_array, 'horizontal')
        orig_corr_v = calculate_correlation(img_array, 'vertical')
        orig_corr_d = calculate_correlation(img_array, 'diagonal')
        
        enc_corr_h = calculate_correlation(encrypted, 'horizontal')
        enc_corr_v = calculate_correlation(encrypted, 'vertical')
        enc_corr_d = calculate_correlation(encrypted, 'diagonal')
        
        # Convert to base64
        encrypted_b64 = image_to_base64(encrypted)
        original_b64 = image_to_base64(img_array)
        
        return jsonify({
            'success': True,
            'encrypted_image': encrypted_b64,
            'original_image': original_b64,
            'metrics': {
                'original_entropy': round(original_entropy, 6),
                'encrypted_entropy': round(encrypted_entropy, 6),
                'npcr': round(npcr, 4),
                'uaci': round(uaci, 4),
                'mae': round(mae, 4),
                'original_correlation': {
                    'horizontal': round(orig_corr_h, 6),
                    'vertical': round(orig_corr_v, 6),
                    'diagonal': round(orig_corr_d, 6)
                },
                'encrypted_correlation': {
                    'horizontal': round(enc_corr_h, 6),
                    'vertical': round(enc_corr_v, 6),
                    'diagonal': round(enc_corr_d, 6)
                }
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/decrypt-image', methods=['POST'])
def decrypt_image_route():
    """Decrypt uploaded encrypted image"""
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image uploaded'}), 400
        
        file = request.files['image']
        sbox_id = request.form.get('sbox_id', 'AES_STD')
        
        # Load image
        img = Image.open(file.stream)
        img_array = np.array(img)
        
        # Get S-Box
        sbox = get_sbox(sbox_id)
        if not sbox:
            return jsonify({'error': 'S-Box not found'}), 400
        
        # Decrypt
        decrypted = decrypt_image(img_array, sbox)
        
        # Convert to base64
        decrypted_b64 = image_to_base64(decrypted)
        
        return jsonify({
            'success': True,
            'decrypted_image': decrypted_b64
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/team-photo/<filename>')
def team_photo(filename):
    """Serve resized team member photos"""
    try:
        from PIL import ImageOps
        
        # Target size for team cards (w:112px x h:144px at 2x for retina = 224x288)
        target_width = 224
        target_height = 288
        
        # Map filename to actual image file
        image_map = {
            'huda': 'huda.JPG',
            'firda': 'firda satria.png',
            'arif': 'arif.jpg',
            'tatak': 'tatak.jpeg'
        }
        
        actual_filename = image_map.get(filename)
        if not actual_filename:
            return "Image not found", 404
        
        image_path = os.path.join(app.static_folder, 'images', actual_filename)
        
        if not os.path.exists(image_path):
            return "Image not found", 404
        
        # Open and resize image
        img = Image.open(image_path)
        
        # Fix EXIF orientation (handles rotated photos from phones)
        img = ImageOps.exif_transpose(img)
        
        # Convert to RGB if necessary (for PNG with transparency)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        
        # Calculate crop to maintain aspect ratio and focus on top (face)
        img_ratio = img.width / img.height
        target_ratio = target_width / target_height
        
        if img_ratio > target_ratio:
            # Image is wider - crop sides
            new_width = int(img.height * target_ratio)
            left = (img.width - new_width) // 2
            img = img.crop((left, 0, left + new_width, img.height))
        else:
            # Image is taller - crop bottom (keep top/face)
            new_height = int(img.width / target_ratio)
            img = img.crop((0, 0, img.width, new_height))
        
        # Resize to target
        img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)
        
        # Save to buffer
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=70)
        buffer.seek(0)
        
        from flask import send_file
        return send_file(buffer, mimetype='image/jpeg')
    except Exception as e:
        return str(e), 500

if __name__ == '__main__':
    app.run(debug=True)
    