from flask import Flask, render_template, request, jsonify
import json
import os
import numpy as np
from PIL import Image
import io
import base64
import hashlib

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

# ============================================
# ENHANCED IMAGE ENCRYPTION WITH PROPER AES-LIKE OPERATIONS
# Includes: Confusion (S-Box) + Diffusion (Permutation + XOR)
# ============================================

def generate_chaotic_sequence(seed, length):
    """
    Generate chaotic sequence using Logistic Map
    x_{n+1} = r * x_n * (1 - x_n), where r = 3.99 (chaotic regime)
    """
    r = 3.9999  # Chaotic parameter
    x = seed
    sequence = []
    
    # Skip transient iterations
    for _ in range(1000):
        x = r * x * (1 - x)
    
    # Generate sequence
    for _ in range(length):
        x = r * x * (1 - x)
        sequence.append(x)
    
    return np.array(sequence)

def generate_permutation_indices(height, width, seed):
    """
    Generate permutation indices using chaotic sequence
    for pixel position scrambling (Arnold Cat Map inspired)
    """
    total_pixels = height * width
    
    # Generate chaotic sequence
    chaos = generate_chaotic_sequence(seed, total_pixels)
    
    # Convert to indices
    indices = np.argsort(chaos)
    
    return indices

def generate_key_stream(sbox, seed, length):
    """
    Generate pseudo-random key stream using S-Box and chaotic sequence
    for XOR diffusion
    """
    chaos = generate_chaotic_sequence(seed, length)
    
    # Convert chaotic values to bytes (0-255)
    key_stream = np.floor(chaos * 256).astype(np.uint8)
    key_stream = np.clip(key_stream, 0, 255)
    
    # Apply S-Box to key stream for additional confusion
    key_stream = np.array([sbox[k] for k in key_stream], dtype=np.uint8)
    
    return key_stream

def encrypt_image_enhanced(img_array, sbox, key="cryptography2024"):
    """
    Enhanced image encryption with confusion and diffusion
    
    Steps:
    1. Generate seed from key
    2. For each round:
       a. Pixel permutation (diffusion - position scrambling)
       b. S-Box substitution (confusion - value substitution)
       c. XOR with key stream (diffusion - value mixing)
    3. Apply CBC-like chaining for additional diffusion
    """
    # Generate seed from key
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    seed = int(key_hash[:8], 16) / (16**8)  # Normalize to (0, 1)
    seed = max(0.1, min(0.9, seed))  # Ensure valid range for logistic map
    
    shape = img_array.shape
    is_color = len(shape) == 3
    
    if is_color:
        height, width, channels = shape
    else:
        height, width = shape
        channels = 1
        img_array = img_array.reshape(height, width, 1)
    
    encrypted = img_array.copy().astype(np.uint8)
    total_pixels = height * width
    
    num_rounds = 3  # Multiple rounds for better diffusion
    
    for round_num in range(num_rounds):
        # Adjust seed for each round
        round_seed = (seed + round_num * 0.1) % 0.9 + 0.05
        
        for c in range(channels):
            channel_data = encrypted[:, :, c].flatten()
            
            # Step 1: Pixel Position Permutation (Diffusion)
            perm_indices = generate_permutation_indices(height, width, round_seed + c * 0.01)
            channel_data = channel_data[perm_indices]
            
            # Step 2: S-Box Substitution (Confusion)
            channel_data = np.array([sbox[pixel] for pixel in channel_data], dtype=np.uint8)
            
            # Step 3: XOR with Key Stream (Diffusion)
            key_stream = generate_key_stream(sbox, round_seed + c * 0.02, total_pixels)
            channel_data = np.bitwise_xor(channel_data, key_stream)
            
            # Step 4: CBC-like Chaining (Additional Diffusion)
            # Each pixel depends on the previous encrypted pixel
            for i in range(1, len(channel_data)):
                channel_data[i] = channel_data[i] ^ channel_data[i-1]
            
            # Apply S-Box again after chaining
            channel_data = np.array([sbox[pixel] for pixel in channel_data], dtype=np.uint8)
            
            encrypted[:, :, c] = channel_data.reshape(height, width)
    
    if not is_color:
        encrypted = encrypted.reshape(height, width)
    
    return encrypted

def decrypt_image_enhanced(img_array, sbox, key="cryptography2024"):
    """
    Decrypt image encrypted with enhanced method
    Reverse all operations in reverse order
    """
    inv_sbox = generate_inverse_sbox(sbox)
    
    # Generate seed from key
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    seed = int(key_hash[:8], 16) / (16**8)
    seed = max(0.1, min(0.9, seed))
    
    shape = img_array.shape
    is_color = len(shape) == 3
    
    if is_color:
        height, width, channels = shape
    else:
        height, width = shape
        channels = 1
        img_array = img_array.reshape(height, width, 1)
    
    decrypted = img_array.copy().astype(np.uint8)
    total_pixels = height * width
    
    num_rounds = 3
    
    # Reverse rounds
    for round_num in range(num_rounds - 1, -1, -1):
        round_seed = (seed + round_num * 0.1) % 0.9 + 0.05
        
        for c in range(channels):
            channel_data = decrypted[:, :, c].flatten()
            
            # Reverse Step 4: Inverse S-Box
            channel_data = np.array([inv_sbox[pixel] for pixel in channel_data], dtype=np.uint8)
            
            # Reverse Step 3: Reverse CBC chaining
            temp = channel_data.copy()
            for i in range(len(channel_data) - 1, 0, -1):
                channel_data[i] = temp[i] ^ temp[i-1]
            
            # Reverse Step 2: XOR with same key stream
            key_stream = generate_key_stream(sbox, round_seed + c * 0.02, total_pixels)
            channel_data = np.bitwise_xor(channel_data, key_stream)
            
            # Reverse Step 1: Inverse S-Box
            channel_data = np.array([inv_sbox[pixel] for pixel in channel_data], dtype=np.uint8)
            
            # Reverse Step 0: Inverse permutation
            perm_indices = generate_permutation_indices(height, width, round_seed + c * 0.01)
            inv_perm = np.argsort(perm_indices)
            channel_data = channel_data[inv_perm]
            
            decrypted[:, :, c] = channel_data.reshape(height, width)
    
    if not is_color:
        decrypted = decrypted.reshape(height, width)
    
    return decrypted

# Legacy functions for backward compatibility
def encrypt_image_simple(img_array, sbox):
    """Simple S-Box only encryption (legacy - weak)"""
    encrypted = np.zeros_like(img_array)
    shape = img_array.shape
    
    if len(shape) == 3:
        for channel in range(shape[2]):
            for i in range(shape[0]):
                for j in range(shape[1]):
                    encrypted[i, j, channel] = sbox[img_array[i, j, channel]]
    else:
        for i in range(shape[0]):
            for j in range(shape[1]):
                encrypted[i, j] = sbox[img_array[i, j]]
    
    return encrypted

def decrypt_image_simple(img_array, sbox):
    """Simple S-Box only decryption (legacy)"""
    inv_sbox = generate_inverse_sbox(sbox)
    return encrypt_image_simple(img_array, inv_sbox)

# Use enhanced version as default
def encrypt_image(img_array, sbox, key="cryptography2024"):
    """Encrypt image - uses enhanced method"""
    return encrypt_image_enhanced(img_array, sbox, key)

def decrypt_image(img_array, sbox, key="cryptography2024"):
    """Decrypt image - uses enhanced method"""
    return decrypt_image_enhanced(img_array, sbox, key)

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
    """Encrypt uploaded image with enhanced encryption"""
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image uploaded'}), 400
        
        file = request.files['image']
        sbox_id = request.form.get('sbox_id', 'AES_STD')
        encryption_key = request.form.get('key', 'cryptography2024')  # Get encryption key
        
        # Load image
        img = Image.open(file.stream)
        img_array = np.array(img)
        
        # Get S-Box
        sbox = get_sbox(sbox_id)
        if not sbox:
            return jsonify({'error': 'S-Box not found'}), 400
        
        # Encrypt with enhanced method
        encrypted = encrypt_image(img_array, sbox, encryption_key)
        
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
        encryption_key = request.form.get('key', 'cryptography2024')  # Get encryption key
        
        # Load image
        img = Image.open(file.stream)
        img_array = np.array(img)
        
        # Get S-Box
        sbox = get_sbox(sbox_id)
        if not sbox:
            return jsonify({'error': 'S-Box not found'}), 400
        
        # Decrypt with enhanced method
        decrypted = decrypt_image(img_array, sbox, encryption_key)
        
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
    