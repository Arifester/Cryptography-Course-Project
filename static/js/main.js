document.addEventListener('DOMContentLoaded', () => {
    // 1. Data Loading
    const candidatesData = window.APP_DATA || [];
    
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

    // 2. DOM Elements
    const els = {
        selector: document.getElementById('matrixSelector'),
        name: document.getElementById('matrixName'),
        type: document.getElementById('matrixType'),
        matrixGrid: document.getElementById('matrixGrid'),
        sboxGrid: document.getElementById('sboxGrid'),
        tooltip: document.getElementById('floatingTooltip'),
        inputPlain: document.getElementById('inputPlain'),
        outCipher: document.getElementById('outputCipher'),
        outDec: document.getElementById('outputDecrypted'),
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

    function doCrypto() {
        const txt = els.inputPlain.value;
        if(!txt) { 
            els.outCipher.innerHTML = '<span class="text-slate-500 italic">Hasil enkripsi akan muncul di sini...</span>'; 
            els.outDec.innerHTML = '<span class="text-slate-500 italic">Hasil dekripsi akan muncul di sini...</span>'; 
            return; 
        }
        
        // Encrypt
        const ciph = txt.split('').map(c => currentData.sbox[c.charCodeAt(0) % 256]);
        const cipherHex = ciph.map(b => `<span class="inline-block px-1 py-0.5 bg-amber-500/10 rounded mx-0.5">${b.toString(16).toUpperCase().padStart(2,'0')}</span>`).join('');
        els.outCipher.innerHTML = cipherHex;
        
        // Decrypt
        const dec = ciph.map(b => String.fromCharCode(inverseSBox[b])).join('');
        els.outDec.innerHTML = `<span class="text-emerald-300">${dec}</span>`;
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
        doCrypto();
    }

    // 5. Initialization
    // Populate Dropdown with styled options
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
    els.selector.appendChild(groupRef);
    els.selector.appendChild(groupGen);

    // Event Listeners
    els.selector.addEventListener('change', (e) => {
        updateUI(e.target.value);
    });
    
    els.inputPlain.addEventListener('input', doCrypto);
    
    // Heatmap Toggle
    if (els.toggleHeatmap) {
        els.toggleHeatmap.addEventListener('click', () => {
            heatmapEnabled = !heatmapEnabled;
            els.toggleHeatmap.classList.toggle('bg-amber-500/20', heatmapEnabled);
            els.toggleHeatmap.classList.toggle('border-amber-500/50', heatmapEnabled);
            renderSbox(currentData.sbox);
        });
    }

    // Keyboard shortcut for navigation
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        
        const currentIdx = parseInt(els.selector.value);
        if (e.key === 'ArrowLeft' && currentIdx > 0) {
            els.selector.value = currentIdx - 1;
            updateUI(currentIdx - 1);
        } else if (e.key === 'ArrowRight' && currentIdx < candidatesData.length - 1) {
            els.selector.value = currentIdx + 1;
            updateUI(currentIdx + 1);
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
                    <div class="max-w-xs">
                        <div class="flex items-center gap-2 mb-2 pb-2 border-b border-slate-600">
                            <i class="fas ${def.icon} text-indigo-400"></i>
                            <span class="font-bold text-white">${def.name}</span>
                        </div>
                        <p class="text-slate-300 text-[11px] leading-relaxed mb-3">${def.definition}</p>
                        <div class="flex gap-4 text-[10px]">
                            <div>
                                <span class="text-slate-400">Nilai Saat Ini:</span>
                                <span class="text-amber-400 font-bold ml-1">${currentValue}</span>
                            </div>
                            <div>
                                <span class="text-slate-400">Target:</span>
                                <span class="text-emerald-400 font-bold ml-1">${def.ideal}</span>
                            </div>
                        </div>
                    </div>
                `;
                
                const rect = card.getBoundingClientRect();
                els.tooltip.style.left = `${rect.left + rect.width / 2}px`;
                els.tooltip.style.top = `${rect.top - 10}px`;
                els.tooltip.classList.remove('hidden', 'opacity-0');
            });

            card.addEventListener('mouseleave', () => {
                tooltipTimeout = setTimeout(() => {
                    els.tooltip.classList.add('opacity-0');
                    setTimeout(() => els.tooltip.classList.add('hidden'), 100);
                }, 100);
            });
        });
    }

    // Initialize metric tooltips
    setupMetricTooltips();

    // Auto-select K44 if exists, otherwise first item
    const k44Idx = candidatesData.findIndex(c => c.id === 'K44');
    if(k44Idx !== -1) {
        els.selector.value = k44Idx;
        updateUI(k44Idx);
    } else {
        updateUI(0);
    }
});
