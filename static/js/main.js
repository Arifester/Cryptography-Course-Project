document.addEventListener('DOMContentLoaded', () => {
    // 1. Data Loading
    const candidatesData = window.APP_DATA || [];
    
    // Store data globally for comparison feature
    window.sboxDataStore = candidatesData;
    
    // ============================================
    // CUSTOM S-BOX LOCALSTORAGE MANAGEMENT
    // ============================================
    const CUSTOM_SBOX_KEY = 'customSboxData';
    
    function saveCustomSboxToLocalStorage(sboxData) {
        try {
            localStorage.setItem(CUSTOM_SBOX_KEY, JSON.stringify(sboxData));
            console.log('Custom S-Box saved to localStorage');
            return true;
        } catch (e) {
            console.error('Failed to save Custom S-Box to localStorage:', e);
            return false;
        }
    }
    
    function loadCustomSboxFromLocalStorage() {
        try {
            const data = localStorage.getItem(CUSTOM_SBOX_KEY);
            if (data) {
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('Failed to load Custom S-Box from localStorage:', e);
        }
        return null;
    }
    
    function clearCustomSboxFromLocalStorage() {
        localStorage.removeItem(CUSTOM_SBOX_KEY);
    }
    
    function generateInverseSBoxFromArray(sbox) {
        const inv = new Array(256).fill(0);
        for (let i = 0; i < 256; i++) {
            inv[sbox[i]] = i;
        }
        return inv;
    }
    
    // Load Custom S-Box from localStorage on page load
    let savedCustomSbox = loadCustomSboxFromLocalStorage();
    
    // Hide loading overlay with animation
    setTimeout(() => {
        const loader = document.getElementById('loadingOverlay');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }
    }, 800);

    if (candidatesData.length === 0) {
        console.error("No data loaded from Flask");
        return;
    }

    // ============================================
    // TAB SWITCHING FUNCTIONALITY
    // ============================================
    
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => {
                content.style.display = 'none';
                content.classList.remove('active');
            });
            
            // Add active class to clicked button and show content
            button.classList.add('active');
            const targetContent = document.getElementById(`tab-${targetTab}`);
            if (targetContent) {
                targetContent.style.display = 'block';
                targetContent.classList.add('active');
            }
            
            // If switching to comparison tab, render comparison
            if (targetTab === 'comparison') {
                renderMatrixComparison();
            }
        });
    });

    // 2. DOM Elements
    const els = {
        // Old selector (removed from navbar, keep for backward compatibility)
        selector: null,
        encryptSelector: document.getElementById('encryptMatrixSelector'),
        textEncryptSelector: document.getElementById('textEncryptMatrixSelector'),
        imageEncryptSelector: document.getElementById('imageEncryptMatrixSelector'),
        explorationSelector: document.getElementById('explorationMatrixSelector'),
        comparisonSelector1: document.getElementById('comparisonMatrix1Selector'),
        comparisonSelector2: document.getElementById('comparisonMatrix2Selector'),
        explorationContent: document.getElementById('explorationContent'),
        comparisonContent: document.getElementById('comparisonContent'),
        comparisonCard1: document.getElementById('comparisonCard1'),
        comparisonCard2: document.getElementById('comparisonCard2'),
        name: document.getElementById('matrixName'),
        type: document.getElementById('matrixType'),
        matrixGrid: document.getElementById('matrixGrid'),
        sboxGrid: document.getElementById('sboxGrid'),
        tooltip: document.getElementById('floatingTooltip'),
        inputPlain: document.getElementById('inputPlain'),
        outCipher: document.getElementById('outputResult'),
        outDec: document.getElementById('outputResult'),
        outputLabel: document.getElementById('outputLabel'),
        downloadCipherBtn: document.getElementById('downloadCipherBtn'),
        toggleHeatmap: document.getElementById('toggleHeatmap'),
        // Metrics Map
        metrics: {
            NL: document.getElementById('val_NL'),
            SAC: document.getElementById('val_SAC'),
            BIC_NL: document.getElementById('val_BIC_NL'),
            BIC_SAC: document.getElementById('val_BIC_SAC'),
            LAP: document.getElementById('val_LAP'),
            DAP: document.getElementById('val_DAP'),
            DU: document.getElementById('val_DU'),
            AD: document.getElementById('val_AD'),
            TO: document.getElementById('val_TO'),
            CI: document.getElementById('val_CI')
        }
    };

    let currentData = candidatesData[0];
    let selectedEncryptData = candidatesData[0]; // For encryption tab
    let selectedTextEncryptData = candidatesData[0]; // For text encryption tab
    let selectedImageEncryptData = candidatesData[0]; // For image encryption tab
    let selectedCompareData1 = candidatesData[0]; // For comparison tab - first matrix
    let selectedCompareData2 = candidatesData[1] || candidatesData[0]; // For comparison tab - second matrix
    let inverseSBox = [];
    let heatmapEnabled = true;
    let tooltipTimeout = null;

    // Metric Definitions for Tooltips
    const metricDefinitions = {
        NL: {
            name: 'Nonlinearity (NL)',
            definition: 'Mengukur jarak minimum antara fungsi Boolean S-box dengan semua fungsi affine. Semakin tinggi semakin tahan terhadap linear cryptanalysis.',
            ideal: '112 (maksimum untuk 8-bit S-box)',
            icon: 'fa-shield-alt'
        },
        SAC: {
            name: 'Strict Avalanche Criterion',
            definition: 'Jika satu bit input diubah, setiap bit output harus berubah dengan probabilitas 0.5. Mengukur difusi S-box.',
            ideal: '0.5 (tepat)',
            icon: 'fa-random'
        },
        BIC_NL: {
            name: 'BIC-Nonlinearity',
            definition: 'Bit Independence Criterion untuk Nonlinearity. Mengukur independensi statistik antar bit output dalam hal nonlinearity.',
            ideal: 'Maksimum (mendekati 112)',
            icon: 'fa-project-diagram'
        },
        BIC_SAC: {
            name: 'BIC-SAC',
            definition: 'Bit Independence Criterion untuk SAC. Setiap pasangan bit output harus independen secara statistik saat bit input berubah.',
            ideal: '0.5',
            icon: 'fa-wave-square'
        },
        LAP: {
            name: 'Linear Approximation Probability',
            definition: 'Probabilitas maksimum dari aproksimasi linear terbaik. Semakin rendah semakin tahan terhadap linear cryptanalysis.',
            ideal: 'Minimum (≤ 0.0625 untuk AES)',
            icon: 'fa-chart-bar'
        },
        DAP: {
            name: 'Differential Approximation Prob.',
            definition: 'Probabilitas maksimum dari diferensial terbaik. Semakin rendah semakin tahan terhadap differential cryptanalysis.',
            ideal: 'Minimum (≤ 0.015625 untuk AES)',
            icon: 'fa-bolt'
        },
        DU: {
            name: 'Differential Uniformity',
            definition: 'Nilai maksimum dalam Distribution Difference Table (DDT). Mengukur ketahanan terhadap serangan diferensial.',
            ideal: '4 (optimal untuk 8-bit bijective S-box)',
            icon: 'fa-equals'
        },
        AD: {
            name: 'Algebraic Degree',
            definition: 'Derajat tertinggi dari representasi ANF (Algebraic Normal Form). Semakin tinggi semakin tahan terhadap algebraic attack.',
            ideal: '7 (maksimum untuk 8-bit)',
            icon: 'fa-superscript'
        },
        TO: {
            name: 'Transparency Order',
            definition: 'Mengukur kerentanan terhadap DPA (Differential Power Analysis). Semakin rendah semakin aman terhadap side-channel attack.',
            ideal: 'Minimum (mendekati 0)',
            icon: 'fa-eye'
        },
        CI: {
            name: 'Correlation Immunity',
            definition: 'Mengukur korelasi antara output dengan subset input. Untuk S-box kriptografi yang baik, nilai 0 sudah cukup.',
            ideal: '0 (untuk balanced S-box)',
            icon: 'fa-lock'
        }
    };

    // 3. Helper Functions
    function generateInverseSBox(sbox) {
        const inv = new Array(256);
        for(let i=0; i<256; i++) inv[sbox[i]] = i;
        return inv;
    }

    function getHeatmapColor(value) {
        // Create gradient from cyan (low) to red (high)
        const hue = 180 - (value / 255) * 180; // 180 (cyan) to 0 (red)
        const saturation = 70 + (value / 255) * 30; // 70% to 100%
        const lightness = 45 + (value / 255) * 10; // 45% to 55%
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    function animateValue(element, value, duration = 300) {
        element.style.opacity = '0';
        element.style.transform = 'translateY(10px)';
        setTimeout(() => {
            element.textContent = value;
            element.style.transition = 'all 0.3s ease';
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        }, 50);
    }

    // 4. Render Functions
    function renderMetrics(metrics) {
        if(!metrics) return;
        const fmt = (val, fixed=4) => typeof val === 'number' ? val.toFixed(fixed) : val;
        
        // Animate each metric
        const metricConfigs = {
            NL: { value: metrics.NL, target: 112, max: 112 },
            SAC: { value: fmt(metrics.SAC, 5), target: 0.5, max: 1, isClose: Math.abs(metrics.SAC - 0.5) < 0.01 },
            BIC_NL: { value: metrics.BIC_NL, target: 112, max: 112 },
            BIC_SAC: { value: fmt(metrics.BIC_SAC, 5), target: 0.5, max: 1, isClose: Math.abs(metrics.BIC_SAC - 0.5) < 0.01 },
            LAP: { value: fmt(metrics.LAP), target: 0.0625, max: 0.5, inverse: true },
            DAP: { value: fmt(metrics.DAP), target: 0.015625, max: 0.5, inverse: true },
            DU: { value: metrics.DU, target: 4, max: 256, inverse: true },
            AD: { value: metrics.AD, target: 7, max: 7 },
            TO: { value: metrics.TO, target: 0, max: 10, inverse: true },
            CI: { value: metrics.CI, target: 0, max: 5, isZeroGood: true }
        };

        Object.entries(metricConfigs).forEach(([key, config]) => {
            const el = els.metrics[key];
            if (el) {
                animateValue(el, config.value);
                
                // Update progress bar
                const card = el.closest('.group');
                const progressBar = card?.querySelector('.progress-bar');
                if (progressBar) {
                    let progress;
                    if (config.inverse) {
                        progress = Math.max(0, (1 - parseFloat(config.value) / config.max)) * 100;
                    } else if (config.isZeroGood) {
                        progress = config.value === 0 ? 100 : Math.max(0, (1 - config.value / config.max)) * 100;
                    } else if (config.isClose !== undefined) {
                        progress = config.isClose ? 100 : 50;
                    } else {
                        progress = (parseFloat(config.value) / config.max) * 100;
                    }
                    setTimeout(() => {
                        progressBar.style.width = `${Math.min(100, progress)}%`;
                    }, 100);
                }
            }
        });
    }

    function renderMatrix(matrix) {
        els.matrixGrid.innerHTML = '';
        matrix.forEach((row, rowIdx) => {
            row.forEach((bit, colIdx) => {
                const div = document.createElement('div');
                const isActive = bit === 1;
                div.className = `matrix-cell w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center text-xs font-mono rounded-lg cursor-default ${
                    isActive 
                        ? 'matrix-cell-active text-white font-bold' 
                        : 'matrix-cell-inactive text-slate-500'
                }`;
                div.textContent = bit;
                div.style.animationDelay = `${(rowIdx * 8 + colIdx) * 20}ms`;
                els.matrixGrid.appendChild(div);
            });
        });
    }

    function renderSbox(sbox) {
        els.sboxGrid.innerHTML = '';
        
        // Header Corner
        const corner = document.createElement('div');
        corner.className = 'sbox-header rounded-tl-lg flex items-center justify-center';
        corner.innerHTML = '<i class="fas fa-hashtag text-[10px] text-slate-500"></i>';
        els.sboxGrid.appendChild(corner);
        
        // Header Columns (0-F)
        for(let i=0; i<16; i++) {
            const head = document.createElement('div');
            head.className = `sbox-header flex items-center justify-center py-2 ${i === 15 ? 'rounded-tr-lg' : ''}`;
            head.textContent = i.toString(16).toUpperCase();
            els.sboxGrid.appendChild(head);
        }

        // Data Rows
        for(let row=0; row<16; row++) {
            // Row Header
            const rowHead = document.createElement('div');
            rowHead.className = `sbox-header flex items-center justify-center ${row === 15 ? 'rounded-bl-lg' : ''}`;
            rowHead.textContent = row.toString(16).toUpperCase();
            els.sboxGrid.appendChild(rowHead);

            // Data Cells
            for(let col=0; col<16; col++) {
                const idx = (row * 16) + col;
                const val = sbox[idx];
                const hexVal = val.toString(16).toUpperCase().padStart(2, '0');
                
                const div = document.createElement('div');
                const isLastCell = row === 15 && col === 15;
                div.className = `sbox-cell h-8 sm:h-9 flex items-center justify-center font-mono cursor-crosshair ${isLastCell ? 'rounded-br-lg' : ''}`;
                
                // Apply heatmap color
                if (heatmapEnabled) {
                    div.style.backgroundColor = getHeatmapColor(val);
                    div.style.color = val > 128 ? '#fff' : '#1e293b';
                } else {
                    div.style.backgroundColor = 'rgba(30, 41, 59, 0.6)';
                    div.style.color = '#e2e8f0';
                }
                
                div.textContent = hexVal;
                
                // Tooltip Events - Fixed for stable display
                div.addEventListener('mouseenter', (e) => {
                    // Clear any pending hide timeout
                    if (tooltipTimeout) {
                        clearTimeout(tooltipTimeout);
                        tooltipTimeout = null;
                    }
                    
                    els.tooltip.innerHTML = `
                        <div class="flex items-center gap-3">
                            <div class="text-center">
                                <div class="text-[9px] text-slate-400 mb-0.5">Index</div>
                                <div class="text-amber-400 font-bold">0x${idx.toString(16).toUpperCase().padStart(2,'0')}</div>
                            </div>
                            <i class="fas fa-arrow-right text-slate-500 text-[10px]"></i>
                            <div class="text-center">
                                <div class="text-[9px] text-slate-400 mb-0.5">Value</div>
                                <div class="text-emerald-400 font-bold">0x${hexVal}</div>
                            </div>
                            <div class="border-l border-slate-600 pl-3 ml-1">
                                <div class="text-[9px] text-slate-400 mb-0.5">Decimal</div>
                                <div class="text-cyan-400 font-bold">${val}</div>
                            </div>
                        </div>
                    `;
                    els.tooltip.style.left = `${e.clientX}px`;
                    els.tooltip.style.top = `${e.clientY - 20}px`;
                    els.tooltip.classList.remove('hidden', 'opacity-0');
                });
                
                div.addEventListener('mouseleave', () => {
                    // Add small delay before hiding to prevent flicker
                    tooltipTimeout = setTimeout(() => {
                        els.tooltip.classList.add('opacity-0');
                        setTimeout(() => els.tooltip.classList.add('hidden'), 100);
                    }, 50);
                });
                
                div.addEventListener('mousemove', (e) => {
                    els.tooltip.style.left = `${e.clientX}px`;
                    els.tooltip.style.top = `${e.clientY - 20}px`; 
                });

                els.sboxGrid.appendChild(div);
            }
        }
    }

    // Helper function to escape HTML special characters
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function doCrypto() {
        // This function is now deprecated - using async API calls instead
        // Keep for backward compatibility but show placeholder text
        const txt = els.inputPlain?.value;
        if(!txt) { 
            if (els.outCipher) els.outCipher.innerHTML = '<span class="text-slate-500 italic">Hasil akan muncul di sini...</span>'; 
            return; 
        }
        // Show hint to use encrypt button
        if (els.outCipher) {
            els.outCipher.innerHTML = '<span class="text-slate-500 italic">Klik tombol Encrypt atau Decrypt...</span>';
        }
    }
    
    // Enhanced Text Encryption using API
    async function encryptTextEnhanced() {
        const txt = els.inputPlain?.value;
        if (!txt) {
            alert('Please enter text to encrypt!');
            return;
        }
        
        // Get encryption key
        const encryptionKey = document.getElementById('textEncryptionKey')?.value || 'cryptography2024';
        if (!encryptionKey.trim()) {
            alert('Please enter an encryption key!');
            return;
        }
        
        // Get S-Box
        let sboxId, customSboxData;
        if (useCustomSboxForText && savedCustomSbox) {
            sboxId = 'custom';
            customSboxData = savedCustomSbox.sbox;
        } else if (selectedTextEncryptData) {
            sboxId = selectedTextEncryptData.id;
        } else if (selectedEncryptData) {
            sboxId = selectedEncryptData.id;
        } else {
            sboxId = candidatesData[0].id;
        }
        
        // Show loading
        const encryptBtn = document.getElementById('encryptTextBtn');
        if (encryptBtn) {
            encryptBtn.disabled = true;
            encryptBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Encrypting...';
        }
        
        // Update output label
        if (els.outputLabel) {
            els.outputLabel.textContent = 'Ciphertext (Hex)';
        }
        
        // Show copy and download buttons
        const copyBtn = document.getElementById('copyCipherBtn');
        const downloadBtn = document.getElementById('downloadCipherBtn');
        if (copyBtn) {
            copyBtn.style.display = 'flex';
        }
        if (downloadBtn) {
            downloadBtn.style.display = 'flex';
        }
        
        try {
            const response = await fetch('/encrypt-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    plaintext: txt,
                    sbox_id: sboxId,
                    key: encryptionKey,
                    custom_sbox: customSboxData || null
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Display cipher in hex format with styling
                const cipherHex = data.cipher_hex;
                const hexDisplay = cipherHex.match(/.{2}/g).map(b => 
                    `<span class="inline-block px-1 py-0.5 bg-amber-500/10 text-amber-300 rounded mx-0.5">${b}</span>`
                ).join('');
                
                // Store pure hex and original length for copy/download
                window.lastCipherHex = cipherHex;
                window.lastOriginalLength = data.original_length;
                window.lastDecryptedText = null; // Clear decrypted text since we're showing cipher
                
                els.outCipher.innerHTML = hexDisplay;
                
                // Store cipher data for decryption
                document.getElementById('cipherBytesData').value = JSON.stringify(data.cipher_bytes);
                document.getElementById('originalLengthData').value = data.original_length;
                
                // Show Custom S-Box indicator
                if (useCustomSboxForText && savedCustomSbox) {
                    els.outCipher.innerHTML += `<div class="mt-2 text-xs text-teal-400"><i class="fas fa-magic mr-1"></i>Encrypted with: ${savedCustomSbox.name || 'Custom S-Box'}</div>`;
                }
                
                // Show encryption info
                els.outCipher.innerHTML += `<div class="mt-2 text-xs text-slate-400"><i class="fas fa-info-circle mr-1"></i>Padded: ${data.original_length} → ${data.padded_length} bytes (PKCS7)</div>`;
            } else {
                alert('Encryption failed: ' + data.error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Encryption failed: ' + error.message);
        } finally {
            if (encryptBtn) {
                encryptBtn.disabled = false;
                encryptBtn.innerHTML = '<i class="fas fa-lock"></i><span>Encrypt</span>';
            }
        }
    }
    
    // Enhanced Text Decryption using API
    async function decryptTextEnhanced() {
        // Get input - check if it's hex ciphertext format
        let inputText = els.inputPlain?.value?.trim();
        const cipherBytesStr = document.getElementById('cipherBytesData')?.value;
        let originalLength = parseInt(document.getElementById('originalLengthData')?.value) || null;
        
        if (!inputText) {
            alert('Masukkan ciphertext hex untuk didekripsi!');
            return;
        }
        
        let cipherBytes = null;
        let cipherHex = null;
        let isHexInput = false;
        
        // Check for new format with LENGTH header (from downloaded files)
        // Format: "LENGTH:123\nHEX:A1B2C3..."
        if (inputText.startsWith('LENGTH:')) {
            const lines = inputText.split('\n');
            for (const line of lines) {
                if (line.startsWith('LENGTH:')) {
                    originalLength = parseInt(line.replace('LENGTH:', '').trim());
                } else if (line.startsWith('HEX:')) {
                    inputText = line.replace('HEX:', '').trim();
                }
            }
        }
        
        // Try to parse as hex ciphertext
        const cleanedInput = inputText.replace(/[\s\n\r]/g, '').toUpperCase();
        
        // Check if input looks like hex (only 0-9 and A-F)
        if (/^[0-9A-F]+$/.test(cleanedInput) && cleanedInput.length % 2 === 0 && cleanedInput.length >= 32) {
            // Looks like hex ciphertext
            cipherHex = cleanedInput;
            isHexInput = true;
            
            // Convert hex to bytes
            cipherBytes = [];
            for (let i = 0; i < cipherHex.length; i += 2) {
                cipherBytes.push(parseInt(cipherHex.substring(i, i + 2), 16));
            }
        } else {
            // Input doesn't look like hex - show error
            alert('Input tidak valid sebagai ciphertext!\n\nFormat yang benar: hex string (contoh: A1B2C3D4...)\n\nPastikan input adalah hasil enkripsi sebelumnya.');
            return;
        }
        
        // Get encryption key
        const encryptionKey = document.getElementById('textEncryptionKey')?.value || 'cryptography2024';
        if (!encryptionKey.trim()) {
            alert('Please enter the decryption key!');
            return;
        }
        
        // Get S-Box (must be same as encryption)
        let sboxId, customSboxData;
        if (useCustomSboxForText && savedCustomSbox) {
            sboxId = 'custom';
            customSboxData = savedCustomSbox.sbox;
        } else if (selectedTextEncryptData) {
            sboxId = selectedTextEncryptData.id;
        } else if (selectedEncryptData) {
            sboxId = selectedEncryptData.id;
        } else {
            sboxId = candidatesData[0].id;
        }
        
        // Show loading
        const decryptBtn = document.getElementById('decryptTextBtn');
        if (decryptBtn) {
            decryptBtn.disabled = true;
            decryptBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Decrypting...';
        }
        
        // Update output label
        if (els.outputLabel) {
            els.outputLabel.textContent = 'Decrypted Plaintext';
        }
        
        // Hide download button for decryption result, show copy
        const downloadBtn = document.getElementById('downloadCipherBtn');
        const copyBtn = document.getElementById('copyCipherBtn');
        if (downloadBtn) {
            downloadBtn.style.display = 'none';
        }
        if (copyBtn) {
            copyBtn.style.display = 'flex';
        }
        
        try {
            const requestBody = {
                cipher_bytes: cipherBytes,
                sbox_id: sboxId,
                key: encryptionKey,
                original_length: originalLength,  // Send original length for proper padding removal
                custom_sbox: customSboxData || null
            };
            
            const response = await fetch('/decrypt-text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Store for copy functionality
                window.lastDecryptedText = data.plaintext;
                window.lastCipherHex = null; // Clear cipher hex since we're showing plaintext
                
                // Escape HTML to prevent XSS and display special chars properly
                const escapedPlaintext = escapeHtml(data.plaintext);
                
                els.outDec.innerHTML = `<span class="text-emerald-300 text-base whitespace-pre-wrap">${escapedPlaintext}</span>`;
                els.outDec.innerHTML += `<div class="mt-2 text-xs text-emerald-400"><i class="fas fa-check-circle mr-1"></i>Decryption successful!</div>`;
            } else {
                alert('Decryption failed: ' + data.error);
                els.outDec.innerHTML = `<span class="text-red-400">Decryption failed: ${data.error}</span>`;
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Decryption failed: ' + error.message);
        } finally {
            if (decryptBtn) {
                decryptBtn.disabled = false;
                decryptBtn.innerHTML = '<i class="fas fa-unlock"></i><span>Decrypt</span>';
            }
        }
    }

    function updateUI(idx) {
        currentData = candidatesData[idx];
        inverseSBox = generateInverseSBox(currentData.sbox);
        
        // Update Header with animation
        els.name.style.opacity = '0';
        setTimeout(() => {
            els.name.textContent = currentData.name;
            els.name.style.transition = 'opacity 0.4s ease';
            els.name.style.opacity = '1';
        }, 100);
        
        // Badge Style
        let badgeClass = "badge-generated";
        let badgeIcon = "fa-cube";
        if(currentData.type === 'proposed') {
            badgeClass = "badge-proposed";
            badgeIcon = "fa-star";
        } else if(currentData.type === 'standard') {
            badgeClass = "badge-standard";
            badgeIcon = "fa-certificate";
        }
        
        els.type.className = `inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-full border backdrop-blur-sm ${badgeClass}`;
        els.type.innerHTML = `<i class="fas ${badgeIcon} text-xs"></i> ${currentData.id}`;

        // Render All Components
        renderMetrics(currentData.metrics);
        renderMatrix(currentData.matrix);
        renderSbox(currentData.sbox);
        // Don't auto-run crypto - user needs to click encrypt button
    }

    // 5. Initialization
    // Helper function to populate selectors
    function populateSelector(selectorElement, onChange, includeCustom = false) {
        if (!selectorElement) return;
        
        const groupRef = document.createElement('optgroup'); 
        groupRef.label = "📚 Referensi Utama";
        const groupGen = document.createElement('optgroup'); 
        groupGen.label = "🔬 Hasil Eksplorasi";

        candidatesData.forEach((d, i) => {
            const opt = document.createElement('option');
            opt.value = i; 
            opt.textContent = `${d.id} - ${d.name}`;
            if(d.type === 'standard' || d.type === 'proposed') groupRef.appendChild(opt);
            else groupGen.appendChild(opt);
        });
        
        selectorElement.appendChild(groupRef);
        selectorElement.appendChild(groupGen);
        
        // Add Custom S-Box option if available
        if (includeCustom && savedCustomSbox) {
            addCustomSboxOption(selectorElement);
        }
        
        selectorElement.addEventListener('change', onChange);
    }
    
    // Add Custom S-Box option to a selector
    function addCustomSboxOption(selectorElement) {
        if (!selectorElement) return;
        
        // Remove existing custom optgroup if any
        const existingCustomGroup = selectorElement.querySelector('optgroup[data-custom="true"]');
        if (existingCustomGroup) {
            existingCustomGroup.remove();
        }
        
        if (savedCustomSbox) {
            const groupCustom = document.createElement('optgroup');
            groupCustom.label = "🎨 Custom S-Box";
            groupCustom.setAttribute('data-custom', 'true');
            
            const opt = document.createElement('option');
            opt.value = 'custom';
            opt.textContent = `✨ ${savedCustomSbox.name || 'Custom S-Box'}`;
            opt.className = 'text-teal-400 font-semibold';
            groupCustom.appendChild(opt);
            
            selectorElement.appendChild(groupCustom);
        }
    }
    
    // Update all encryption selectors with Custom S-Box option
    function updateSelectorsWithCustomSbox() {
        addCustomSboxOption(els.textEncryptSelector);
        addCustomSboxOption(els.imageEncryptSelector);
        
        // Show notification
        showCustomSboxNotification();
    }
    
    // Show notification that Custom S-Box is available
    function showCustomSboxNotification() {
        // Create a toast notification
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-4 right-4 bg-gradient-to-r from-teal-600 to-cyan-600 text-white px-6 py-3 rounded-xl shadow-lg z-50 animate-fade-in flex items-center gap-3';
        toast.innerHTML = `
            <i class="fas fa-check-circle text-xl"></i>
            <div>
                <p class="font-semibold">Custom S-Box Ready!</p>
                <p class="text-xs text-teal-100">Tersedia di tab Text & Image Encryption</p>
            </div>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Populate Exploration Matrix Selector
    populateSelector(els.explorationSelector, (e) => {
        const selectedIdx = +e.target.value;
        currentData = candidatesData[selectedIdx];
        
        // Show the content container and update UI
        els.explorationContent.style.display = 'block';
        updateUI(selectedIdx);
    });

    // Populate Comparison Matrix Selectors (Dual)
    populateSelector(els.comparisonSelector1, (e) => {
        const selectedIdx = +e.target.value;
        selectedCompareData1 = candidatesData[selectedIdx];
        
        // Show the content container and render comparison
        els.comparisonContent.style.display = 'block';
        renderMatrixComparison();
    });

    populateSelector(els.comparisonSelector2, (e) => {
        const selectedIdx = +e.target.value;
        selectedCompareData2 = candidatesData[selectedIdx];
        
        // Show the content container and render comparison
        els.comparisonContent.style.display = 'block';
        renderMatrixComparison();
    });

    // Populate Encryption Matrix Selector (legacy - keep for backward compatibility)
    if (els.encryptSelector) {
        populateSelector(els.encryptSelector, (e) => {
            selectedEncryptData = candidatesData[+e.target.value];
            // Re-run crypto with new matrix
            if (els.inputPlain) {
                doCrypto();
            }
        });
    }

    // Track if using custom S-Box
    let useCustomSboxForText = false;
    let useCustomSboxForImage = false;

    // Populate Text Encryption Matrix Selector
    if (els.textEncryptSelector) {
        populateSelector(els.textEncryptSelector, (e) => {
            const value = e.target.value;
            if (value === 'custom') {
                useCustomSboxForText = true;
                selectedTextEncryptData = null;
            } else {
                useCustomSboxForText = false;
                selectedTextEncryptData = candidatesData[+value];
                selectedEncryptData = selectedTextEncryptData; // Sync for crypto function
            }
            // Clear cipher data when S-Box changes
            if (document.getElementById('cipherBytesData')) {
                document.getElementById('cipherBytesData').value = '';
                document.getElementById('originalLengthData').value = '';
            }
            // Update hint text
            if (els.outCipher) {
                els.outCipher.innerHTML = '<span class="text-slate-500 italic">Hasil akan muncul di sini...</span>';
            }
            // Reset output label
            if (els.outputLabel) {
                els.outputLabel.textContent = 'Output';
            }
        }, true);
    }

    // Populate Image Encryption Matrix Selector
    if (els.imageEncryptSelector) {
        populateSelector(els.imageEncryptSelector, (e) => {
            const value = e.target.value;
            if (value === 'custom') {
                useCustomSboxForImage = true;
                selectedImageEncryptData = null;
            } else {
                useCustomSboxForImage = false;
                selectedImageEncryptData = candidatesData[+value];
                selectedEncryptData = selectedImageEncryptData; // Sync for image encryption
            }
        }, true);
    }

    // Event Listeners
    if (els.inputPlain) {
        // Just show hint on input, actual encryption needs button click
        els.inputPlain.addEventListener('input', () => {
            const txt = els.inputPlain.value;
            if (!txt) {
                if (els.outCipher) els.outCipher.innerHTML = '<span class="text-slate-500 italic">Hasil akan muncul di sini...</span>';
                // Reset output label
                if (els.outputLabel) {
                    els.outputLabel.textContent = 'Output';
                }
            }
        });
    }
    
    // Encrypt Text Button
    const encryptTextBtn = document.getElementById('encryptTextBtn');
    if (encryptTextBtn) {
        encryptTextBtn.addEventListener('click', encryptTextEnhanced);
    }
    
    // Decrypt Text Button
    const decryptTextBtn = document.getElementById('decryptTextBtn');
    if (decryptTextBtn) {
        decryptTextBtn.addEventListener('click', decryptTextEnhanced);
    }
    
    // Text Encryption Key Visibility Toggle
    window.toggleTextKeyVisibility = function() {
        const keyInput = document.getElementById('textEncryptionKey');
        const icon = document.getElementById('textKeyVisibilityIcon');
        if (keyInput && icon) {
            if (keyInput.type === 'password') {
                keyInput.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                keyInput.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        }
    };
    
    // Image Encryption Key Visibility Toggle (global function)
    window.toggleKeyVisibility = function() {
        const keyInput = document.getElementById('encryptionKey');
        const icon = document.getElementById('keyVisibilityIcon');
        if (keyInput && icon) {
            if (keyInput.type === 'password') {
                keyInput.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                keyInput.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        }
    };

    // Download Cipher Button
    if (els.downloadCipherBtn) {
        els.downloadCipherBtn.addEventListener('click', () => {
            // Use stored pure hex (without info text)
            const hexToDownload = window.lastCipherHex;
            const originalLength = window.lastOriginalLength;
            if (hexToDownload) {
                // Include original length in file for proper decryption
                // Format: "LENGTH:original_length\nHEX:cipher_hex"
                const fileContent = originalLength 
                    ? `LENGTH:${originalLength}\nHEX:${hexToDownload}`
                    : hexToDownload;
                
                // Create blob and download
                const blob = new Blob([fileContent], { type: 'text/plain' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `cipher_${new Date().getTime()}.txt`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                // Show visual feedback
                els.downloadCipherBtn.innerHTML = '<i class="fas fa-check text-xs"></i> Downloaded';
                els.downloadCipherBtn.classList.add('bg-emerald-500/20', 'border-emerald-500/50');
                setTimeout(() => {
                    els.downloadCipherBtn.innerHTML = '<i class="fas fa-download text-xs"></i> Download';
                    els.downloadCipherBtn.classList.remove('bg-emerald-500/20', 'border-emerald-500/50');
                }, 2000);
            } else {
                alert('Tidak ada ciphertext untuk didownload. Encrypt text terlebih dahulu.');
            }
        });
    }
    
    // Copy Cipher Button
    const copyCipherBtn = document.getElementById('copyCipherBtn');
    if (copyCipherBtn) {
        copyCipherBtn.addEventListener('click', async () => {
            // Check if we have decrypted text or cipher hex to copy
            const textToCopy = window.lastDecryptedText || window.lastCipherHex;
            const isDecrypted = !!window.lastDecryptedText;
            
            if (textToCopy) {
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    
                    // Show visual feedback
                    copyCipherBtn.innerHTML = '<i class="fas fa-check text-xs"></i> Copied!';
                    copyCipherBtn.classList.remove('bg-cyan-600/20', 'border-cyan-500/50', 'text-cyan-300');
                    copyCipherBtn.classList.add('bg-emerald-500/20', 'border-emerald-500/50', 'text-emerald-300');
                    
                    setTimeout(() => {
                        copyCipherBtn.innerHTML = '<i class="fas fa-copy text-xs"></i> Copy';
                        copyCipherBtn.classList.remove('bg-emerald-500/20', 'border-emerald-500/50', 'text-emerald-300');
                        copyCipherBtn.classList.add('bg-cyan-600/20', 'border-cyan-500/50', 'text-cyan-300');
                    }, 2000);
                } catch (err) {
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = textToCopy;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    
                    copyCipherBtn.innerHTML = '<i class="fas fa-check text-xs"></i> Copied!';
                    setTimeout(() => {
                        copyCipherBtn.innerHTML = '<i class="fas fa-copy text-xs"></i> Copy';
                    }, 2000);
                }
            } else {
                alert('Tidak ada text untuk dicopy. Encrypt/Decrypt text terlebih dahulu.');
            }
        });
    }
    
    // Heatmap Toggle
    if (els.toggleHeatmap) {
        els.toggleHeatmap.addEventListener('click', () => {
            heatmapEnabled = !heatmapEnabled;
            els.toggleHeatmap.classList.toggle('bg-amber-500/20', heatmapEnabled);
            els.toggleHeatmap.classList.toggle('border-amber-500/50', heatmapEnabled);
            renderSbox(currentData.sbox);
        });
    }

    // Keyboard shortcut for navigation (works with current tab's selector)
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        
        // Get the active selector based on current tab
        let activeSelector = null;
        const activeTab = document.querySelector('.tab-content.active');
        
        if (activeTab && activeTab.id === 'tab-exploration' && els.explorationSelector) {
            activeSelector = els.explorationSelector;
        } else if (activeTab && activeTab.id === 'tab-comparison' && els.comparisonSelector) {
            activeSelector = els.comparisonSelector;
        } else if (activeTab && activeTab.id === 'tab-encryption' && els.encryptSelector) {
            activeSelector = els.encryptSelector;
        }
        
        if (activeSelector) {
            const currentIdx = parseInt(activeSelector.value);
            if (e.key === 'ArrowLeft' && currentIdx > 0) {
                activeSelector.value = currentIdx - 1;
                activeSelector.dispatchEvent(new Event('change'));
            } else if (e.key === 'ArrowRight' && currentIdx < candidatesData.length - 1) {
                activeSelector.value = currentIdx + 1;
                activeSelector.dispatchEvent(new Event('change'));
            }
        }
    });

    // Setup Metric Card Tooltips
    function setupMetricTooltips() {
        Object.entries(els.metrics).forEach(([key, el]) => {
            if (!el) return;
            const card = el.closest('.group');
            if (!card) return;
            
            const def = metricDefinitions[key];
            if (!def) return;

            card.addEventListener('mouseenter', (e) => {
                if (tooltipTimeout) {
                    clearTimeout(tooltipTimeout);
                    tooltipTimeout = null;
                }

                const currentValue = el.textContent;
                
                els.tooltip.innerHTML = `
                    <div style="width: 280px;">
                        <div class="flex items-center gap-2 mb-2 pb-2 border-b border-slate-600">
                            <i class="fas ${def.icon} text-indigo-400"></i>
                            <span class="font-bold text-white text-sm">${def.name}</span>
                        </div>
                        <p class="text-slate-300 text-[11px] leading-relaxed mb-3" style="white-space: normal;">${def.definition}</p>
                        <div class="flex flex-wrap gap-3 text-[10px]">
                            <div class="bg-slate-800/50 px-2 py-1 rounded">
                                <span class="text-slate-400">Nilai:</span>
                                <span class="text-amber-400 font-bold ml-1">${currentValue}</span>
                            </div>
                            <div class="bg-slate-800/50 px-2 py-1 rounded">
                                <span class="text-slate-400">Target:</span>
                                <span class="text-emerald-400 font-bold ml-1">${def.ideal}</span>
                            </div>
                        </div>
                    </div>
                `;
                
                const rect = card.getBoundingClientRect();
                const tooltipWidth = 300;
                
                // Calculate position - center above card, but keep within viewport
                let left = rect.left + rect.width / 2 - tooltipWidth / 2;
                left = Math.max(10, Math.min(left, window.innerWidth - tooltipWidth - 10));
                
                els.tooltip.style.left = `${left}px`;
                els.tooltip.style.top = `${rect.top - 10}px`;
                els.tooltip.style.transform = 'translateY(-100%)';
                els.tooltip.classList.remove('hidden', 'opacity-0');
            });

            card.addEventListener('mouseleave', () => {
                tooltipTimeout = setTimeout(() => {
                    els.tooltip.classList.add('opacity-0');
                    setTimeout(() => {
                        els.tooltip.classList.add('hidden');
                        els.tooltip.style.transform = '';
                    }, 100);
                }, 100);
            });
        });
    }

    // Initialize metric tooltips
    setupMetricTooltips();

    // ============================================
    // MATRIX COMPARISON FUNCTIONALITY
    // ============================================
    
    // ============================================
    // MATRIX COMPARISON FUNCTIONALITY
    // ============================================
    
    function renderMatrixComparison() {
        // Render first comparison card
        renderComparisonCard(els.comparisonCard1, selectedCompareData1, 'blue');
        // Render second comparison card
        renderComparisonCard(els.comparisonCard2, selectedCompareData2, 'purple');
    }

    function renderComparisonCard(cardContainer, candidate, colorScheme) {
        if (!cardContainer || !candidate) return;
        
        const colorClasses = {
            blue: 'from-blue-500 to-cyan-500',
            purple: 'from-purple-500 to-pink-500'
        };
        
        cardContainer.innerHTML = '';
        
        // Header
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between mb-6 pb-4 border-b border-slate-700';
        header.innerHTML = `
            <div>
                <h4 class="text-2xl font-bold text-white">${candidate.name}</h4>
                <p class="text-sm text-slate-400 mt-1">${candidate.id}</p>
            </div>
            <span class="px-4 py-2 bg-gradient-to-r ${colorClasses[colorScheme]} bg-opacity-20 text-white text-xs font-semibold rounded-full border border-${colorScheme === 'blue' ? 'blue' : 'purple'}-500/30">
                ${candidate.type}
            </span>
        `;
        cardContainer.appendChild(header);
        
        // Matrix Grid (8x8)
        const matrixSection = document.createElement('div');
        matrixSection.className = 'mb-6';
        
        const matrixLabel = document.createElement('p');
        matrixLabel.className = 'text-xs font-bold text-slate-300 mb-3 uppercase tracking-wide';
        matrixLabel.textContent = 'Affine Matrix (8×8)';
        matrixSection.appendChild(matrixLabel);
        
        const matrixGrid = document.createElement('div');
        matrixGrid.className = 'grid grid-cols-8 gap-1.5 p-4 bg-slate-800/30 rounded-lg';
        
        candidate.matrix.forEach((row) => {
            row.forEach((bit) => {
                const cell = document.createElement('div');
                cell.className = `w-8 h-8 flex items-center justify-center text-sm font-mono rounded font-bold transition-all ${
                    bit === 1 
                        ? `bg-gradient-to-br ${colorClasses[colorScheme]} text-white shadow-lg` 
                        : 'bg-slate-900/50 text-slate-500 border border-slate-700'
                }`;
                cell.textContent = bit;
                matrixGrid.appendChild(cell);
            });
        });
        
        matrixSection.appendChild(matrixGrid);
        cardContainer.appendChild(matrixSection);
        
        // All Metrics
        const metricsSection = document.createElement('div');
        metricsSection.className = 'mt-6';
        
        const metricsLabel = document.createElement('p');
        metricsLabel.className = 'text-xs font-bold text-slate-300 mb-4 uppercase tracking-wide';
        metricsLabel.textContent = 'Cryptographic Metrics';
        metricsSection.appendChild(metricsLabel);
        
        const metricsGrid = document.createElement('div');
        metricsGrid.className = 'grid grid-cols-2 gap-3';
        
        const metricsList = [
            { key: 'NL', label: 'Nonlinearity', value: candidate.metrics.NL, ideal: '112' },
            { key: 'SAC', label: 'Strict Avalanche', value: candidate.metrics.SAC.toFixed(4), ideal: '0.5' },
            { key: 'BIC_NL', label: 'BIC-NL', value: candidate.metrics.BIC_NL, ideal: '112' },
            { key: 'BIC_SAC', label: 'BIC-SAC', value: candidate.metrics.BIC_SAC.toFixed(4), ideal: '0.5' },
            { key: 'LAP', label: 'Linear Approx', value: candidate.metrics.LAP.toFixed(4), ideal: '0.0625' },
            { key: 'DAP', label: 'Differential', value: candidate.metrics.DAP.toFixed(4), ideal: '0.0156' },
            { key: 'DU', label: 'Differential Uni', value: candidate.metrics.DU, ideal: '4' },
            { key: 'AD', label: 'Algebraic Deg', value: candidate.metrics.AD, ideal: '7' },
            { key: 'TO', label: 'Tradeoff', value: candidate.metrics.TO, ideal: '0' },
            { key: 'CI', label: 'Correlation Im', value: candidate.metrics.CI, ideal: '0' }
        ];
        
        metricsList.forEach(metric => {
            const metricCard = document.createElement('div');
            metricCard.className = 'p-3 bg-slate-800/50 rounded-lg border border-slate-700/50';
            metricCard.innerHTML = `
                <p class="text-[11px] text-slate-400 mb-2">${metric.label}</p>
                <p class="text-lg font-bold text-white">${metric.value}</p>
                <p class="text-[10px] text-slate-500 mt-1">Ideal: ${metric.ideal}</p>
            `;
            metricsGrid.appendChild(metricCard);
        });
        
        metricsSection.appendChild(metricsGrid);
        cardContainer.appendChild(metricsSection);
    }

    // Auto-select K44 if exists, otherwise first item
    const k44Idx = candidatesData.findIndex(c => c.id === 'K44');
    if(k44Idx !== -1) {
        if (els.selector) els.selector.value = k44Idx;
        if (els.explorationSelector) els.explorationSelector.value = k44Idx;
        if (els.encryptSelector) els.encryptSelector.value = k44Idx;
        if (els.textEncryptSelector) els.textEncryptSelector.value = k44Idx;
        if (els.imageEncryptSelector) els.imageEncryptSelector.value = k44Idx;
        if (els.comparisonSelector1) els.comparisonSelector1.value = k44Idx;
        if (els.comparisonSelector2) els.comparisonSelector2.value = k44Idx > 0 ? k44Idx - 1 : 1;
        currentData = candidatesData[k44Idx];
        // Show exploration content immediately
        if (els.explorationContent) els.explorationContent.style.display = 'block';
        updateUI(k44Idx);
        selectedEncryptData = candidatesData[k44Idx];
        selectedTextEncryptData = candidatesData[k44Idx];
        selectedImageEncryptData = candidatesData[k44Idx];
        selectedCompareData1 = candidatesData[k44Idx];
        selectedCompareData2 = candidatesData[k44Idx > 0 ? k44Idx - 1 : 1];
    } else {
        if (els.explorationSelector) els.explorationSelector.value = 0;
        if (els.textEncryptSelector) els.textEncryptSelector.value = 0;
        if (els.imageEncryptSelector) els.imageEncryptSelector.value = 0;
        currentData = candidatesData[0];
        // Show exploration content immediately
        if (els.explorationContent) els.explorationContent.style.display = 'block';
        updateUI(0);
        selectedEncryptData = candidatesData[0];
        selectedTextEncryptData = candidatesData[0];
        selectedImageEncryptData = candidatesData[0];
        selectedCompareData1 = candidatesData[0];
        selectedCompareData2 = candidatesData[1] || candidatesData[0];
    }

    // Load Custom S-Box from localStorage on page load and update selectors
    if (savedCustomSbox) {
        console.log('Custom S-Box found in localStorage:', savedCustomSbox.name);
        updateSelectorsWithCustomSbox();
        
        // Show a small indicator that Custom S-Box is available
        const indicator = document.createElement('div');
        indicator.className = 'fixed top-4 right-4 bg-gradient-to-r from-teal-600/90 to-cyan-600/90 text-white px-4 py-2 rounded-lg shadow-lg z-40 text-sm flex items-center gap-2';
        indicator.innerHTML = `
            <i class="fas fa-puzzle-piece"></i>
            <span>Custom S-Box: <strong>${savedCustomSbox.name || 'Loaded'}</strong></span>
            <button onclick="this.parentElement.remove()" class="ml-2 hover:text-cyan-200"><i class="fas fa-times"></i></button>
        `;
        document.body.appendChild(indicator);
        
        setTimeout(() => {
            if (indicator.parentElement) {
                indicator.style.opacity = '0';
                indicator.style.transition = 'opacity 0.3s';
                setTimeout(() => indicator.remove(), 300);
            }
        }, 5000);
    }

    // ============================================
    // IMAGE ENCRYPTION FUNCTIONALITY
    // ============================================
    
    let uploadedImageFile = null;
    let lastResultImageDataUrl = null;

    // Image Upload Handler
    const imageUpload = document.getElementById('imageUpload');
    const encryptImageBtn = document.getElementById('encryptImageBtn');
    const decryptImageBtn = document.getElementById('decryptImageBtn');
    const downloadImageBtn = document.getElementById('downloadImageBtn');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const originalImagePreview = document.getElementById('originalImagePreview');
    const resultImagePreview = document.getElementById('resultImagePreview');
    const imageMetrics = document.getElementById('imageMetrics');
    const imageLoadingIndicator = document.getElementById('imageLoadingIndicator');
    const resultLabel = document.getElementById('resultLabel');

    if (imageUpload) {
        imageUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                uploadedImageFile = file;
                
                // Preview original image
                const reader = new FileReader();
                reader.onload = (event) => {
                    originalImagePreview.src = event.target.result;
                    imagePreviewContainer.style.display = 'grid';
                    resultImagePreview.src = '';
                    imageMetrics.style.display = 'none';
                };
                reader.readAsDataURL(file);
                
                // Enable encrypt button
                encryptImageBtn.disabled = false;
                decryptImageBtn.disabled = false;
            }
        });
    }

    // Encrypt Image Handler
    if (encryptImageBtn) {
        encryptImageBtn.addEventListener('click', async () => {
            if (!uploadedImageFile) {
                alert('Please upload an image first!');
                return;
            }

            // Check if using custom S-Box
            let sboxId, customSboxData;
            if (useCustomSboxForImage && savedCustomSbox) {
                sboxId = 'custom';
                customSboxData = savedCustomSbox.sbox;
            } else {
                sboxId = selectedImageEncryptData?.id || selectedEncryptData.id;
            }
            
            // Get encryption key
            const encryptionKey = document.getElementById('encryptionKey')?.value || 'cryptography2024';
            if (!encryptionKey.trim()) {
                alert('Please enter an encryption key!');
                return;
            }
            
            // Show loading
            imageLoadingIndicator.classList.remove('hidden');
            encryptImageBtn.disabled = true;
            decryptImageBtn.disabled = true;

            try {
                const formData = new FormData();
                formData.append('image', uploadedImageFile);
                formData.append('sbox_id', sboxId);
                formData.append('key', encryptionKey);
                
                // If using custom S-Box, send the S-Box data
                if (useCustomSboxForImage && customSboxData) {
                    formData.append('custom_sbox', JSON.stringify(customSboxData));
                }

                const response = await fetch('/encrypt-image', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (data.success) {
                    // Display encrypted image
                    resultImagePreview.src = data.encrypted_image;
                    lastResultImageDataUrl = data.encrypted_image;
                    resultLabel.textContent = 'Encrypted';
                    if (downloadImageBtn) downloadImageBtn.style.display = 'inline-block';
                    
                    // Display metrics
                    displayImageMetrics(data.metrics);
                    imageMetrics.style.display = 'block';
                    
                    // Display histograms
                    const histogramContainer = document.getElementById('histogramContainer');
                    const originalHistogram = document.getElementById('originalHistogram');
                    const encryptedHistogram = document.getElementById('encryptedHistogram');
                    const histogramTitle1 = document.getElementById('histogramTitle1');
                    const histogramTitle2 = document.getElementById('histogramTitle2');
                    const histogramDesc1 = document.getElementById('histogramDesc1');
                    const histogramDesc2 = document.getElementById('histogramDesc2');
                    const histogramArrowText = document.getElementById('histogramArrowText');
                    const histogramExplanationText = document.getElementById('histogramExplanationText');
                    
                    if (histogramContainer && originalHistogram && encryptedHistogram) {
                        originalHistogram.src = data.original_histogram;
                        encryptedHistogram.src = data.encrypted_histogram;
                        
                        // Reset labels for encryption
                        if (histogramTitle1) histogramTitle1.innerHTML = '<span class="w-2 h-2 bg-blue-400 rounded-full"></span> Original Image Histogram';
                        if (histogramTitle2) histogramTitle2.innerHTML = '<span class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span> Encrypted Image Histogram';
                        if (histogramDesc1) histogramDesc1.textContent = 'Shows natural pixel distribution patterns';
                        if (histogramDesc2) histogramDesc2.textContent = 'Should be uniformly flat (random)';
                        if (histogramArrowText) histogramArrowText.textContent = 'After S-Box Encryption';
                        if (histogramExplanationText) histogramExplanationText.innerHTML = '<strong>Good encryption</strong> produces a <strong>flat/uniform histogram</strong> where all pixel values (0-255) appear with equal frequency. This means attackers cannot extract statistical information from the encrypted image.';
                        
                        histogramContainer.style.display = 'block';
                    }
                } else {
                    alert('Encryption failed: ' + data.error);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Encryption failed: ' + error.message);
            } finally {
                imageLoadingIndicator.classList.add('hidden');
                encryptImageBtn.disabled = false;
                decryptImageBtn.disabled = false;
            }
        });
    }

    // Decrypt Image Handler
    if (decryptImageBtn) {
        decryptImageBtn.addEventListener('click', async () => {
            if (!uploadedImageFile) {
                alert('Please upload an image first!');
                return;
            }

            // Check if using custom S-Box
            let sboxId, customSboxData;
            if (useCustomSboxForImage && savedCustomSbox) {
                sboxId = 'custom';
                customSboxData = savedCustomSbox.sbox;
            } else {
                sboxId = selectedImageEncryptData?.id || selectedEncryptData.id;
            }
            
            // Get encryption key
            const encryptionKey = document.getElementById('encryptionKey')?.value || 'cryptography2024';
            if (!encryptionKey.trim()) {
                alert('Please enter an encryption key!');
                return;
            }
            
            // Show loading
            imageLoadingIndicator.classList.remove('hidden');
            encryptImageBtn.disabled = true;
            decryptImageBtn.disabled = true;

            try {
                const formData = new FormData();
                formData.append('image', uploadedImageFile);
                formData.append('sbox_id', sboxId);
                formData.append('key', encryptionKey);
                
                // If using custom S-Box, send the S-Box data
                if (useCustomSboxForImage && customSboxData) {
                    formData.append('custom_sbox', JSON.stringify(customSboxData));
                }

                const response = await fetch('/decrypt-image', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (data.success) {
                    // Display decrypted image
                    resultImagePreview.src = data.decrypted_image;
                    lastResultImageDataUrl = data.decrypted_image;
                    resultLabel.textContent = 'Decrypted';
                    if (downloadImageBtn) downloadImageBtn.style.display = 'inline-block';
                    imageMetrics.style.display = 'none';
                    
                    // Show histogram comparison for decrypt
                    const histogramContainer = document.getElementById('histogramContainer');
                    const originalHistogram = document.getElementById('originalHistogram');
                    const encryptedHistogram = document.getElementById('encryptedHistogram');
                    const histogramTitle1 = document.getElementById('histogramTitle1');
                    const histogramTitle2 = document.getElementById('histogramTitle2');
                    const histogramDesc1 = document.getElementById('histogramDesc1');
                    const histogramDesc2 = document.getElementById('histogramDesc2');
                    const histogramExplanationText = document.getElementById('histogramExplanationText');
                    
                    if (histogramContainer && originalHistogram && encryptedHistogram) {
                        // For decrypt: show encrypted vs decrypted
                        originalHistogram.src = data.encrypted_histogram;
                        encryptedHistogram.src = data.decrypted_histogram;
                        
                        // Update labels
                        if (histogramTitle1) histogramTitle1.innerHTML = '<span class="w-2 h-2 bg-purple-400 rounded-full"></span> Encrypted Image Histogram';
                        if (histogramTitle2) histogramTitle2.innerHTML = '<span class="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span> Decrypted Image Histogram';
                        if (histogramDesc1) histogramDesc1.textContent = 'Uniform distribution (encrypted)';
                        if (histogramDesc2) histogramDesc2.textContent = 'Restored natural patterns';
                        
                        // Update arrow text
                        const arrowText = document.getElementById('histogramArrowText');
                        if (arrowText) arrowText.textContent = 'After S-Box Decryption';
                        
                        // Update explanation for decryption
                        if (histogramExplanationText) histogramExplanationText.innerHTML = '<strong>Successful decryption</strong> restores the <strong>original histogram pattern</strong>. The decrypted histogram should match the original image\'s natural pixel distribution, confirming that the encryption/decryption process is reversible.';
                        
                        histogramContainer.style.display = 'block';
                    }
                } else {
                    alert('Decryption failed: ' + data.error);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Decryption failed: ' + error.message);
            } finally {
                imageLoadingIndicator.classList.add('hidden');
                encryptImageBtn.disabled = false;
                decryptImageBtn.disabled = false;
            }
        });
    }

    // Download Image Handler
    if (downloadImageBtn) {
        downloadImageBtn.addEventListener('click', () => {
            if (!lastResultImageDataUrl) {
                alert('No image to download!');
                return;
            }

            // Create a temporary link and trigger download
            const link = document.createElement('a');
            link.href = lastResultImageDataUrl;
            
            const timestamp = new Date().getTime();
            const resultType = resultLabel.textContent === 'Encrypted' ? 'encrypted' : 'decrypted';
            link.download = `sbox-${resultType}-${timestamp}.png`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Show visual feedback
            downloadImageBtn.innerHTML = '<i class="fas fa-check mr-1"></i>Downloaded';
            downloadImageBtn.classList.add('bg-emerald-500/20', 'border-emerald-500/50');
            setTimeout(() => {
                downloadImageBtn.innerHTML = '<i class="fas fa-download mr-1"></i>Download';
                downloadImageBtn.classList.remove('bg-emerald-500/20', 'border-emerald-500/50');
            }, 2000);
        });
    }

    // Display Image Metrics
    function displayImageMetrics(metrics) {
        document.getElementById('metricOrigEntropy').textContent = metrics.original_entropy.toFixed(6);
        document.getElementById('metricEncEntropy').textContent = metrics.encrypted_entropy.toFixed(6);
        document.getElementById('metricNPCR').textContent = metrics.npcr.toFixed(4) + '%';
        document.getElementById('metricUACI').textContent = metrics.uaci.toFixed(4) + '%';
        document.getElementById('metricMAE').textContent = metrics.mae.toFixed(4);
        
        // Correlation coefficients
        document.getElementById('corrOrigH').textContent = metrics.original_correlation.horizontal.toFixed(6);
        document.getElementById('corrOrigV').textContent = metrics.original_correlation.vertical.toFixed(6);
        document.getElementById('corrOrigD').textContent = metrics.original_correlation.diagonal.toFixed(6);
        
        document.getElementById('corrEncH').textContent = metrics.encrypted_correlation.horizontal.toFixed(6);
        document.getElementById('corrEncV').textContent = metrics.encrypted_correlation.vertical.toFixed(6);
        document.getElementById('corrEncD').textContent = metrics.encrypted_correlation.diagonal.toFixed(6);
    }

    // ============================================
    // CUSTOM S-BOX UPLOAD FUNCTIONALITY
    // ============================================
    
    const customSboxUpload = document.getElementById('customSboxUpload');
    const customSboxDropzone = document.getElementById('customSboxDropzone');
    const customSboxStatus = document.getElementById('customSboxStatus');
    const customSboxResults = document.getElementById('customSboxResults');
    const analyzeCustomSboxBtn = document.getElementById('analyzeCustomSboxBtn');
    
    let uploadedCustomSbox = null;

    if (customSboxUpload) {
        // File upload handler
        customSboxUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await handleCustomSboxUpload(file);
            }
        });

        // Drag and drop
        if (customSboxDropzone) {
            customSboxDropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                customSboxDropzone.classList.add('border-cyan-500', 'bg-cyan-500/10');
            });

            customSboxDropzone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                customSboxDropzone.classList.remove('border-cyan-500', 'bg-cyan-500/10');
            });

            customSboxDropzone.addEventListener('drop', async (e) => {
                e.preventDefault();
                customSboxDropzone.classList.remove('border-cyan-500', 'bg-cyan-500/10');
                
                const file = e.dataTransfer.files[0];
                if (file) {
                    await handleCustomSboxUpload(file);
                }
            });
        }
    }

    async function handleCustomSboxUpload(file) {
        // Show status
        customSboxStatus.classList.remove('hidden');
        const statusIcon = document.getElementById('statusIcon');
        const statusTitle = document.getElementById('statusTitle');
        const statusMessage = document.getElementById('statusMessage');

        statusIcon.innerHTML = '<div class="animate-spin rounded-full h-8 w-8 border-2 border-cyan-400 border-t-transparent"></div>';
        statusIcon.className = 'w-10 h-10 rounded-full flex items-center justify-center';
        statusTitle.textContent = 'Processing...';
        statusTitle.className = 'font-semibold text-white';
        statusMessage.textContent = 'Menganalisis file Excel...';

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/upload-custom-sbox', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                // Success
                statusIcon.innerHTML = '<i class="fas fa-check-circle text-2xl text-emerald-400"></i>';
                statusIcon.className = 'w-10 h-10 rounded-full flex items-center justify-center bg-emerald-500/20';
                statusTitle.textContent = 'S-Box Valid!';
                statusTitle.className = 'font-semibold text-emerald-300';
                statusMessage.textContent = data.message;

                // Store uploaded S-Box
                uploadedCustomSbox = data;
                
                // Save to localStorage for use in encryption
                const customSboxForStorage = {
                    name: document.getElementById('customSboxName')?.value || 'Custom S-Box',
                    sbox: data.sbox,
                    metrics: data.metrics,
                    uploadedAt: new Date().toISOString()
                };
                saveCustomSboxToLocalStorage(customSboxForStorage);
                savedCustomSbox = customSboxForStorage;
                
                // Update selectors to include custom S-Box option
                updateSelectorsWithCustomSbox();

                // Show results section
                customSboxResults.style.display = 'block';
                
                // Update info
                document.getElementById('customSboxInfo').textContent = 
                    `256 nilai unik terdeteksi | Fixed points: ${data.metrics.fixed_points}`;

                // Render S-Box preview table
                renderCustomSboxTable(data.sbox);
            } else {
                // Error
                statusIcon.innerHTML = '<i class="fas fa-times-circle text-2xl text-red-400"></i>';
                statusIcon.className = 'w-10 h-10 rounded-full flex items-center justify-center bg-red-500/20';
                statusTitle.textContent = 'Error!';
                statusTitle.className = 'font-semibold text-red-300';
                statusMessage.textContent = data.error;
                customSboxResults.style.display = 'none';
            }
        } catch (error) {
            console.error('Upload error:', error);
            statusIcon.innerHTML = '<i class="fas fa-times-circle text-2xl text-red-400"></i>';
            statusIcon.className = 'w-10 h-10 rounded-full flex items-center justify-center bg-red-500/20';
            statusTitle.textContent = 'Error!';
            statusTitle.className = 'font-semibold text-red-300';
            statusMessage.textContent = error.message;
            customSboxResults.style.display = 'none';
        }
    }

    function renderCustomSboxTable(sbox) {
        const container = document.getElementById('customSboxTable');
        if (!container) return;

        let html = '<table class="w-full text-xs font-mono">';
        
        // Header row
        html += '<tr><th class="p-1 bg-slate-800 text-slate-400"></th>';
        for (let c = 0; c < 16; c++) {
            html += `<th class="p-1 bg-slate-800 text-cyan-400 text-center">${c.toString(16).toUpperCase()}</th>`;
        }
        html += '</tr>';

        // Data rows
        for (let r = 0; r < 16; r++) {
            html += `<tr><th class="p-1 bg-slate-800 text-cyan-400 text-center">${r.toString(16).toUpperCase()}</th>`;
            for (let c = 0; c < 16; c++) {
                const idx = r * 16 + c;
                const value = sbox[idx];
                const hue = 180 - (value / 255) * 180;
                const bgColor = `hsl(${hue}, 70%, 35%)`;
                html += `<td class="p-1 text-center text-white border border-slate-700" style="background-color: ${bgColor};">${value.toString(16).toUpperCase().padStart(2, '0')}</td>`;
            }
            html += '</tr>';
        }
        
        html += '</table>';
        container.innerHTML = html;
    }

    // Analyze button
    if (analyzeCustomSboxBtn) {
        analyzeCustomSboxBtn.addEventListener('click', () => {
            if (!uploadedCustomSbox) {
                alert('Please upload an S-Box file first!');
                return;
            }

            const metricsContainer = document.getElementById('customSboxMetrics');
            if (!metricsContainer) return;

            const metrics = uploadedCustomSbox.metrics;
            const customName = document.getElementById('customSboxName')?.value || 'Custom S-Box';

            // Render metrics cards
            metricsContainer.innerHTML = `
                <div class="card-glass p-6 rounded-2xl">
                    <h4 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <i class="fas fa-chart-line text-teal-400"></i>
                        Cryptographic Properties: ${customName}
                    </h4>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                            <p class="text-xs text-slate-400 mb-1">Nonlinearity</p>
                            <p class="text-2xl font-bold ${metrics.nonlinearity >= 100 ? 'text-emerald-400' : 'text-yellow-400'}">${metrics.nonlinearity}</p>
                            <p class="text-xs text-slate-500">Target: ≥ 100</p>
                        </div>
                        <div class="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                            <p class="text-xs text-slate-400 mb-1">SAC</p>
                            <p class="text-2xl font-bold ${Math.abs(metrics.sac - 0.5) < 0.05 ? 'text-emerald-400' : 'text-yellow-400'}">${metrics.sac.toFixed(4)}</p>
                            <p class="text-xs text-slate-500">Target: ~0.5</p>
                        </div>
                        <div class="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                            <p class="text-xs text-slate-400 mb-1">BIC</p>
                            <p class="text-2xl font-bold ${metrics.bic > 0.45 ? 'text-emerald-400' : 'text-yellow-400'}">${metrics.bic.toFixed(4)}</p>
                            <p class="text-xs text-slate-500">Target: ~0.5</p>
                        </div>
                        <div class="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                            <p class="text-xs text-slate-400 mb-1">LAP</p>
                            <p class="text-2xl font-bold ${metrics.lap <= 0.0625 ? 'text-emerald-400' : 'text-yellow-400'}">${metrics.lap.toFixed(4)}</p>
                            <p class="text-xs text-slate-500">Target: ≤ 0.0625</p>
                        </div>
                        <div class="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                            <p class="text-xs text-slate-400 mb-1">DAP</p>
                            <p class="text-2xl font-bold ${metrics.dap <= 0.015625 ? 'text-emerald-400' : 'text-yellow-400'}">${metrics.dap.toFixed(4)}</p>
                            <p class="text-xs text-slate-500">Target: ≤ 0.0156</p>
                        </div>
                        <div class="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                            <p class="text-xs text-slate-400 mb-1">Fixed Points</p>
                            <p class="text-2xl font-bold ${metrics.fixed_points <= 2 ? 'text-emerald-400' : 'text-yellow-400'}">${metrics.fixed_points}</p>
                            <p class="text-xs text-slate-500">Target: 0-2</p>
                        </div>
                        <div class="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                            <p class="text-xs text-slate-400 mb-1">Opposite FP</p>
                            <p class="text-2xl font-bold ${metrics.opposite_fixed_points <= 2 ? 'text-emerald-400' : 'text-yellow-400'}">${metrics.opposite_fixed_points}</p>
                            <p class="text-xs text-slate-500">Target: 0-2</p>
                        </div>
                        <div class="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                            <p class="text-xs text-slate-400 mb-1">Bijective</p>
                            <p class="text-2xl font-bold text-emerald-400"><i class="fas fa-check-circle"></i></p>
                            <p class="text-xs text-slate-500">Valid</p>
                        </div>
                    </div>
                </div>
            `;

            // Scroll to metrics
            metricsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    // Save Custom S-Box Button
    const saveCustomSboxBtn = document.getElementById('saveCustomSboxBtn');
    if (saveCustomSboxBtn) {
        saveCustomSboxBtn.addEventListener('click', () => {
            if (!uploadedCustomSbox) {
                alert('Please upload an S-Box file first!');
                return;
            }

            const customName = document.getElementById('customSboxName')?.value || 'Custom S-Box';
            
            const customSboxForStorage = {
                name: customName,
                sbox: uploadedCustomSbox.sbox,
                metrics: uploadedCustomSbox.metrics,
                uploadedAt: new Date().toISOString()
            };
            
            if (saveCustomSboxToLocalStorage(customSboxForStorage)) {
                savedCustomSbox = customSboxForStorage;
                updateSelectorsWithCustomSbox();
                
                // Visual feedback
                saveCustomSboxBtn.innerHTML = '<i class="fas fa-check"></i> Tersimpan!';
                saveCustomSboxBtn.classList.remove('from-blue-600', 'to-indigo-600');
                saveCustomSboxBtn.classList.add('from-emerald-600', 'to-teal-600');
                
                setTimeout(() => {
                    saveCustomSboxBtn.innerHTML = '<i class="fas fa-save"></i> Simpan untuk Enkripsi';
                    saveCustomSboxBtn.classList.remove('from-emerald-600', 'to-teal-600');
                    saveCustomSboxBtn.classList.add('from-blue-600', 'to-indigo-600');
                }, 2000);
            } else {
                alert('Gagal menyimpan Custom S-Box. Coba lagi.');
            }
        });
    }

    // Clear Custom S-Box Button
    const clearCustomSboxBtn = document.getElementById('clearCustomSboxBtn');
    if (clearCustomSboxBtn) {
        clearCustomSboxBtn.addEventListener('click', () => {
            if (confirm('Hapus Custom S-Box dari browser? S-Box tidak akan tersedia untuk enkripsi.')) {
                clearCustomSboxFromLocalStorage();
                savedCustomSbox = null;
                useCustomSboxForText = false;
                useCustomSboxForImage = false;
                
                // Remove custom option from selectors
                document.querySelectorAll('optgroup[data-custom="true"]').forEach(el => el.remove());
                
                // Reset selectors to first option
                if (els.textEncryptSelector) {
                    els.textEncryptSelector.value = '0';
                    selectedTextEncryptData = candidatesData[0];
                }
                if (els.imageEncryptSelector) {
                    els.imageEncryptSelector.value = '0';
                    selectedImageEncryptData = candidatesData[0];
                }
                
                // Visual feedback
                clearCustomSboxBtn.innerHTML = '<i class="fas fa-check"></i> Dihapus!';
                setTimeout(() => {
                    clearCustomSboxBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Hapus Custom S-Box dari Browser';
                }, 2000);
                
                // Show toast
                const toast = document.createElement('div');
                toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded-xl shadow-lg z-50 flex items-center gap-3';
                toast.innerHTML = '<i class="fas fa-trash-alt"></i><span>Custom S-Box dihapus dari browser</span>';
                document.body.appendChild(toast);
                
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity 0.3s';
                    setTimeout(() => toast.remove(), 300);
                }, 2000);
            }
        });
    }

    // --- Custom S-Box Comparison Feature ---
    const compareSboxSelector = document.getElementById('compareSboxSelector');
    const compareSboxBtn = document.getElementById('compareSboxBtn');
    const sboxComparisonResults = document.getElementById('sboxComparisonResults');

    // Populate compare selector with existing S-Boxes
    function populateCompareSboxSelector() {
        if (!compareSboxSelector || !window.sboxDataStore) return;

        compareSboxSelector.innerHTML = '<option value="">-- Pilih S-Box --</option>';
        
        window.sboxDataStore.forEach((sbox, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = sbox.name;
            compareSboxSelector.appendChild(option);
        });
    }

    // Enable/disable compare button based on selection
    if (compareSboxSelector) {
        compareSboxSelector.addEventListener('change', (e) => {
            if (compareSboxBtn) {
                compareSboxBtn.disabled = !e.target.value;
            }
        });
    }

    // Compare S-Boxes
    if (compareSboxBtn) {
        compareSboxBtn.addEventListener('click', () => {
            if (!uploadedCustomSbox || !compareSboxSelector.value) return;

            const selectedIndex = parseInt(compareSboxSelector.value);
            const existingSbox = window.sboxDataStore[selectedIndex];
            
            if (!existingSbox || !sboxComparisonResults) return;

            const customMetrics = uploadedCustomSbox.metrics;
            const existingMetrics = existingSbox.metrics;  // Use .metrics instead of .analysis
            const customName = document.getElementById('customSboxName')?.value || 'Custom S-Box';

            // Create comparison UI
            sboxComparisonResults.innerHTML = `
                <div class="border-t border-slate-700 pt-6">
                    <h4 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <i class="fas fa-chart-bar text-purple-400"></i>
                        Hasil Perbandingan
                    </h4>
                    
                    <!-- Comparison Header -->
                    <div class="grid grid-cols-3 gap-2 mb-4 text-center">
                        <div class="p-3 bg-teal-500/20 rounded-lg border border-teal-500/30">
                            <p class="text-sm font-bold text-teal-300">${customName}</p>
                            <p class="text-xs text-slate-400">Custom Upload</p>
                        </div>
                        <div class="p-3 bg-slate-800/50 rounded-lg border border-slate-600">
                            <p class="text-sm font-bold text-slate-300">VS</p>
                            <p class="text-xs text-slate-500">Properti</p>
                        </div>
                        <div class="p-3 bg-purple-500/20 rounded-lg border border-purple-500/30">
                            <p class="text-sm font-bold text-purple-300">${existingSbox.name}</p>
                            <p class="text-xs text-slate-400">Existing S-Box</p>
                        </div>
                    </div>

                    <!-- Comparison Metrics -->
                    <div class="space-y-3">
                        ${renderComparisonRow('Nonlinearity', customMetrics.nonlinearity, existingMetrics.NL, 'higher', '≥100')}
                        ${renderComparisonRow('SAC', customMetrics.sac.toFixed(4), existingMetrics.SAC.toFixed(4), 'closer_to_0.5', '~0.5')}
                        ${renderComparisonRow('BIC', customMetrics.bic.toFixed(4), existingMetrics.BIC_SAC.toFixed(4), 'closer_to_0.5', '~0.5')}
                        ${renderComparisonRow('LAP', customMetrics.lap.toFixed(4), existingMetrics.LAP.toFixed(4), 'lower', '≤0.0625')}
                        ${renderComparisonRow('DAP', customMetrics.dap.toFixed(4), existingMetrics.DAP.toFixed(4), 'lower', '≤0.0156')}
                        ${renderComparisonRow('Fixed Points', customMetrics.fixed_points, existingMetrics.TO || 0, 'lower', '0-2')}
                    </div>

                    <!-- Summary -->
                    <div class="mt-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                        <h5 class="text-sm font-bold text-white mb-2 flex items-center gap-2">
                            <i class="fas fa-clipboard-check text-cyan-400"></i>
                            Ringkasan Perbandingan
                        </h5>
                        <div id="comparisonSummary" class="text-sm text-slate-300">
                            ${generateComparisonSummary(customName, existingSbox.name, customMetrics, existingMetrics)}
                        </div>
                    </div>

                    <!-- Visual Comparison Chart -->
                    <div class="mt-4">
                        <h5 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
                            <i class="fas fa-chart-area text-cyan-400"></i>
                            Perbandingan Visual (Normalized)
                        </h5>
                        <div class="space-y-2">
                            ${renderComparisonBar('NL', customMetrics.nonlinearity, existingMetrics.NL, 112, customName, existingSbox.name)}
                            ${renderComparisonBar('SAC', customMetrics.sac * 100, existingMetrics.SAC * 100, 50, customName, existingSbox.name)}
                            ${renderComparisonBar('BIC', customMetrics.bic * 100, existingMetrics.BIC_SAC * 100, 50, customName, existingSbox.name)}
                        </div>
                    </div>
                </div>
            `;

            sboxComparisonResults.classList.remove('hidden');
            sboxComparisonResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    function renderComparisonRow(label, customVal, existingVal, compareType, target) {
        let customBetter = false;
        let existingBetter = false;
        
        const customNum = parseFloat(customVal);
        const existingNum = parseFloat(existingVal);

        if (compareType === 'higher') {
            if (customNum > existingNum) customBetter = true;
            else if (existingNum > customNum) existingBetter = true;
        } else if (compareType === 'lower') {
            if (customNum < existingNum) customBetter = true;
            else if (existingNum < customNum) existingBetter = true;
        } else if (compareType === 'closer_to_0.5') {
            const customDiff = Math.abs(customNum - 0.5);
            const existingDiff = Math.abs(existingNum - 0.5);
            if (customDiff < existingDiff) customBetter = true;
            else if (existingDiff < customDiff) existingBetter = true;
        }

        const customClass = customBetter ? 'text-emerald-400 font-bold' : (existingBetter ? 'text-slate-400' : 'text-white');
        const existingClass = existingBetter ? 'text-emerald-400 font-bold' : (customBetter ? 'text-slate-400' : 'text-white');
        const customIcon = customBetter ? '<i class="fas fa-trophy text-yellow-400 ml-1 text-xs"></i>' : '';
        const existingIcon = existingBetter ? '<i class="fas fa-trophy text-yellow-400 ml-1 text-xs"></i>' : '';

        return `
            <div class="grid grid-cols-3 gap-2 text-center items-center p-2 bg-slate-800/30 rounded-lg">
                <div class="text-sm ${customClass}">${customVal}${customIcon}</div>
                <div class="text-xs text-slate-400">${label}<br><span class="text-xs text-slate-600">(${target})</span></div>
                <div class="text-sm ${existingClass}">${existingVal}${existingIcon}</div>
            </div>
        `;
    }

    function renderComparisonBar(label, customVal, existingVal, maxVal, customName, existingName) {
        const customPercent = Math.min((customVal / maxVal) * 100, 100);
        const existingPercent = Math.min((existingVal / maxVal) * 100, 100);

        return `
            <div class="p-3 bg-slate-800/30 rounded-lg">
                <div class="flex justify-between text-xs text-slate-400 mb-1">
                    <span>${label}</span>
                    <span>Max: ${maxVal}</span>
                </div>
                <div class="space-y-1">
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-teal-300 w-16 truncate" title="${customName}">Custom</span>
                        <div class="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                            <div class="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full transition-all duration-500" style="width: ${customPercent}%"></div>
                        </div>
                        <span class="text-xs text-white w-12 text-right">${typeof customVal === 'number' ? customVal.toFixed(1) : customVal}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-purple-300 w-16 truncate" title="${existingName}">Existing</span>
                        <div class="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                            <div class="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500" style="width: ${existingPercent}%"></div>
                        </div>
                        <span class="text-xs text-white w-12 text-right">${typeof existingVal === 'number' ? existingVal.toFixed(1) : existingVal}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function generateComparisonSummary(customName, existingName, customMetrics, existingMetrics) {
        let customWins = 0;
        let existingWins = 0;
        const details = [];

        // Nonlinearity (higher is better) - Use NL for existing
        if (customMetrics.nonlinearity > existingMetrics.NL) {
            customWins++;
            details.push(`<span class="text-teal-300">${customName}</span> memiliki Nonlinearity lebih tinggi (${customMetrics.nonlinearity} vs ${existingMetrics.NL})`);
        } else if (existingMetrics.NL > customMetrics.nonlinearity) {
            existingWins++;
            details.push(`<span class="text-purple-300">${existingName}</span> memiliki Nonlinearity lebih tinggi (${existingMetrics.NL} vs ${customMetrics.nonlinearity})`);
        }

        // SAC (closer to 0.5 is better) - Use SAC for existing
        const customSacDiff = Math.abs(customMetrics.sac - 0.5);
        const existingSacDiff = Math.abs(existingMetrics.SAC - 0.5);
        if (customSacDiff < existingSacDiff) {
            customWins++;
            details.push(`<span class="text-teal-300">${customName}</span> memiliki SAC lebih baik (mendekati 0.5)`);
        } else if (existingSacDiff < customSacDiff) {
            existingWins++;
            details.push(`<span class="text-purple-300">${existingName}</span> memiliki SAC lebih baik (mendekati 0.5)`);
        }

        // LAP (lower is better) - Use LAP for existing
        if (customMetrics.lap < existingMetrics.LAP) {
            customWins++;
            details.push(`<span class="text-teal-300">${customName}</span> memiliki LAP lebih rendah (lebih aman)`);
        } else if (existingMetrics.LAP < customMetrics.lap) {
            existingWins++;
            details.push(`<span class="text-purple-300">${existingName}</span> memiliki LAP lebih rendah (lebih aman)`);
        }

        // DAP (lower is better) - Use DAP for existing
        if (customMetrics.dap < existingMetrics.DAP) {
            customWins++;
            details.push(`<span class="text-teal-300">${customName}</span> memiliki DAP lebih rendah (lebih aman)`);
        } else if (existingMetrics.DAP < customMetrics.dap) {
            existingWins++;
            details.push(`<span class="text-purple-300">${existingName}</span> memiliki DAP lebih rendah (lebih aman)`);
        }

        // Fixed Points (lower is better) - Use TO for existing (Total Outliers)
        const existingFP = existingMetrics.TO || 0;
        if (customMetrics.fixed_points < existingFP) {
            customWins++;
            details.push(`<span class="text-teal-300">${customName}</span> memiliki Fixed Points lebih sedikit`);
        } else if (existingFP < customMetrics.fixed_points) {
            existingWins++;
            details.push(`<span class="text-purple-300">${existingName}</span> memiliki Fixed Points lebih sedikit`);
        }

        let summaryHtml = `<div class="flex items-center gap-4 mb-3">`;
        summaryHtml += `<div class="flex items-center gap-2"><span class="inline-block w-3 h-3 rounded-full bg-teal-400"></span><span class="text-teal-300 font-bold">${customName}: ${customWins}</span></div>`;
        summaryHtml += `<div class="flex items-center gap-2"><span class="inline-block w-3 h-3 rounded-full bg-purple-400"></span><span class="text-purple-300 font-bold">${existingName}: ${existingWins}</span></div>`;
        summaryHtml += `</div>`;

        if (customWins > existingWins) {
            summaryHtml += `<p class="text-emerald-400 font-semibold mb-2"><i class="fas fa-trophy text-yellow-400 mr-2"></i>${customName} lebih unggul secara keseluruhan!</p>`;
        } else if (existingWins > customWins) {
            summaryHtml += `<p class="text-purple-400 font-semibold mb-2"><i class="fas fa-trophy text-yellow-400 mr-2"></i>${existingName} lebih unggul secara keseluruhan!</p>`;
        } else {
            summaryHtml += `<p class="text-cyan-400 font-semibold mb-2"><i class="fas fa-balance-scale mr-2"></i>Kedua S-Box memiliki kualitas yang seimbang!</p>`;
        }

        summaryHtml += `<ul class="text-xs text-slate-400 space-y-1 mt-2">`;
        details.forEach(d => {
            summaryHtml += `<li class="flex items-start gap-2"><i class="fas fa-angle-right text-cyan-400 mt-0.5"></i>${d}</li>`;
        });
        summaryHtml += `</ul>`;

        return summaryHtml;
    }

    // Call this when custom S-Box is uploaded
    populateCompareSboxSelector();

    // ============================================
    // SERVER STATUS MONITORING (On-Demand)
    // ============================================
    
    const serverStatusModal = document.getElementById('serverStatusModal');
    const serverStatusBtn = document.getElementById('serverStatusBtn');
    const serverStatusBackdrop = document.getElementById('serverStatusBackdrop');
    const closeStatusBtn = document.getElementById('closeStatusBtn');
    const refreshStatusBtn = document.getElementById('refreshStatusBtn');
    const statusLoading = document.getElementById('statusLoading');
    const statusContent = document.getElementById('statusContent');
    
    let statusRefreshInterval = null;
    
    // Open modal
    if (serverStatusBtn) {
        serverStatusBtn.addEventListener('click', () => {
            serverStatusModal.classList.remove('hidden');
            fetchServerStatus();
            // Auto-refresh while modal is open (every 3 seconds)
            statusRefreshInterval = setInterval(fetchServerStatus, 3000);
        });
    }
    
    // Close modal
    function closeStatusModal() {
        serverStatusModal.classList.add('hidden');
        // Stop auto-refresh when modal is closed
        if (statusRefreshInterval) {
            clearInterval(statusRefreshInterval);
            statusRefreshInterval = null;
        }
    }
    
    if (closeStatusBtn) {
        closeStatusBtn.addEventListener('click', closeStatusModal);
    }
    
    if (serverStatusBackdrop) {
        serverStatusBackdrop.addEventListener('click', closeStatusModal);
    }
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && serverStatusModal && !serverStatusModal.classList.contains('hidden')) {
            closeStatusModal();
        }
    });
    
    // Manual refresh button
    if (refreshStatusBtn) {
        refreshStatusBtn.addEventListener('click', () => {
            // Spin animation
            refreshStatusBtn.querySelector('i').classList.add('fa-spin');
            fetchServerStatus().then(() => {
                setTimeout(() => {
                    refreshStatusBtn.querySelector('i').classList.remove('fa-spin');
                }, 500);
            });
        });
    }
    
    // Fetch and update server status
    async function fetchServerStatus() {
        try {
            const response = await fetch('/server-status');
            const data = await response.json();
            
            if (data.success) {
                // Hide loading, show content
                if (statusLoading) statusLoading.classList.add('hidden');
                if (statusContent) statusContent.classList.remove('hidden');
                
                updateServerStatusUI(data);
                
                // Update navbar indicator
                const navIndicator = document.getElementById('navStatusIndicator');
                if (navIndicator) {
                    navIndicator.classList.remove('bg-red-400');
                    navIndicator.classList.add('bg-emerald-400');
                }
            }
        } catch (error) {
            console.error('Failed to fetch server status:', error);
            // Show connection error
            const statusIndicator = document.getElementById('statusIndicator');
            const navIndicator = document.getElementById('navStatusIndicator');
            if (statusIndicator) {
                statusIndicator.classList.remove('bg-emerald-400');
                statusIndicator.classList.add('bg-red-400');
            }
            if (navIndicator) {
                navIndicator.classList.remove('bg-emerald-400');
                navIndicator.classList.add('bg-red-400');
            }
        }
    }
    
    function updateServerStatusUI(data) {
        // Status indicator
        const statusIndicator = document.getElementById('statusIndicator');
        if (statusIndicator) {
            statusIndicator.classList.remove('bg-red-400');
            statusIndicator.classList.add('bg-emerald-400');
        }
        
        // Last update time
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            const now = new Date();
            lastUpdate.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        
        // System info
        const hostname = document.getElementById('hostname');
        const platform = document.getElementById('platform');
        const uptime = document.getElementById('uptime');
        if (hostname) hostname.textContent = data.system.hostname;
        if (platform) platform.textContent = `${data.system.platform} • Python ${data.system.python_version}`;
        if (uptime) uptime.textContent = `↑ ${data.system.uptime}`;
        
        // CPU
        const cpuPercent = document.getElementById('cpuPercent');
        const cpuBar = document.getElementById('cpuBar');
        const cpuInfo = document.getElementById('cpuInfo');
        if (cpuPercent) cpuPercent.textContent = `${data.cpu.usage_percent}%`;
        if (cpuBar) cpuBar.style.width = `${data.cpu.usage_percent}%`;
        if (cpuInfo) cpuInfo.textContent = `${data.cpu.cores} cores @ ${data.cpu.frequency_mhz} MHz`;
        
        // RAM
        const ramPercent = document.getElementById('ramPercent');
        const ramBar = document.getElementById('ramBar');
        const ramInfo = document.getElementById('ramInfo');
        if (ramPercent) ramPercent.textContent = `${data.memory.usage_percent}%`;
        if (ramBar) ramBar.style.width = `${data.memory.usage_percent}%`;
        if (ramInfo) ramInfo.textContent = `${data.memory.used_gb} / ${data.memory.total_gb} GB`;
        
        // Disk
        const diskPercent = document.getElementById('diskPercent');
        const diskBar = document.getElementById('diskBar');
        const diskInfo = document.getElementById('diskInfo');
        if (diskPercent) diskPercent.textContent = `${data.disk.usage_percent}%`;
        if (diskBar) diskBar.style.width = `${data.disk.usage_percent}%`;
        if (diskInfo) diskInfo.textContent = `${data.disk.used_gb} / ${data.disk.total_gb} GB`;
        
        // Current operation
        const operationIcon = document.getElementById('operationIcon');
        const currentOperation = document.getElementById('currentOperation');
        if (operationIcon && currentOperation) {
            const op = data.current_operation;
            currentOperation.textContent = op.replace('_', ' ');
            
            if (op === 'idle') {
                operationIcon.className = 'fas fa-check-circle text-emerald-400';
                currentOperation.className = 'text-emerald-400 font-medium capitalize';
            } else if (op.includes('encrypt')) {
                operationIcon.className = 'fas fa-lock text-amber-400 animate-pulse';
                currentOperation.className = 'text-amber-400 font-medium capitalize';
            } else if (op.includes('decrypt')) {
                operationIcon.className = 'fas fa-unlock text-cyan-400 animate-pulse';
                currentOperation.className = 'text-cyan-400 font-medium capitalize';
            }
        }
        
        // Operations counter
        const opEncText = document.getElementById('opEncText');
        const opDecText = document.getElementById('opDecText');
        const opEncImg = document.getElementById('opEncImg');
        const opDecImg = document.getElementById('opDecImg');
        if (opEncText) opEncText.textContent = data.operations.encrypt_text || 0;
        if (opDecText) opDecText.textContent = data.operations.decrypt_text || 0;
        if (opEncImg) opEncImg.textContent = data.operations.encrypt_image || 0;
        if (opDecImg) opDecImg.textContent = data.operations.decrypt_image || 0;
        
        // Flask process
        const flaskMemory = document.getElementById('flaskMemory');
        const flaskCpu = document.getElementById('flaskCpu');
        if (flaskMemory) flaskMemory.textContent = `${data.flask_process.memory_mb} MB`;
        if (flaskCpu) flaskCpu.textContent = `${data.flask_process.cpu_percent}%`;
        
        // Network I/O
        const netSent = document.getElementById('netSent');
        const netRecv = document.getElementById('netRecv');
        if (netSent) netSent.innerHTML = `<i class="fas fa-arrow-up text-[8px] mr-1"></i>${data.network.bytes_sent_mb} MB`;
        if (netRecv) netRecv.innerHTML = `<i class="fas fa-arrow-down text-[8px] mr-1"></i>${data.network.bytes_recv_mb} MB`;
    }
});
