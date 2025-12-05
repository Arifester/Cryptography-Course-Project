document.addEventListener('DOMContentLoaded', () => {
    // 1. Data Loading
    const candidatesData = window.APP_DATA || [];
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

    // 3. Helper Functions
    function generateInverseSBox(sbox) {
        const inv = new Array(256);
        for(let i=0; i<256; i++) inv[sbox[i]] = i;
        return inv;
    }

    // 4. Render Functions
    function renderMetrics(metrics) {
        if(!metrics) return;
        // Helper untuk format angka
        const fmt = (val, fixed=4) => typeof val === 'number' ? val.toFixed(fixed) : val;
        
        els.metrics.NL.textContent = metrics.NL;
        els.metrics.SAC.textContent = fmt(metrics.SAC, 5);
        els.metrics.BIC_NL.textContent = metrics.BIC_NL;
        els.metrics.BIC_SAC.textContent = fmt(metrics.BIC_SAC, 5);
        els.metrics.LAP.textContent = fmt(metrics.LAP);
        els.metrics.DAP.textContent = fmt(metrics.DAP);
        els.metrics.DU.textContent = metrics.DU;
        els.metrics.AD.textContent = metrics.AD;
        els.metrics.TO.textContent = metrics.TO;
        els.metrics.CI.textContent = metrics.CI;
    }

    function renderMatrix(matrix) {
        els.matrixGrid.innerHTML = '';
        matrix.forEach(row => {
            row.forEach(bit => {
                const div = document.createElement('div');
                div.className = `w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center text-xs font-mono rounded transition-all ${bit ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-300'}`;
                div.textContent = bit;
                els.matrixGrid.appendChild(div);
            });
        });
    }

    function renderSbox(sbox) {
        els.sboxGrid.innerHTML = '';
        // Header Pojok
        els.sboxGrid.appendChild(Object.assign(document.createElement('div'), {className: 'bg-slate-200'}));
        
        // Header Kolom (0-F)
        for(let i=0; i<16; i++) {
            const head = document.createElement('div');
            head.className = "bg-slate-200 text-slate-500 font-bold flex items-center justify-center py-1";
            head.textContent = i.toString(16).toUpperCase();
            els.sboxGrid.appendChild(head);
        }

        // Baris Data
        for(let row=0; row<16; row++) {
            // Header Baris
            const rowHead = document.createElement('div');
            rowHead.className = "bg-slate-200 text-slate-500 font-bold flex items-center justify-center";
            rowHead.textContent = row.toString(16).toUpperCase();
            els.sboxGrid.appendChild(rowHead);

            // Data Cells
            for(let col=0; col<16; col++) {
                const idx = (row * 16) + col;
                const val = sbox[idx];
                const hexVal = val.toString(16).toUpperCase().padStart(2, '0');
                
                const div = document.createElement('div');
                div.className = "h-7 sm:h-8 flex items-center justify-center font-mono bg-white text-slate-600 hover:bg-amber-300 hover:text-amber-900 cursor-crosshair transition-colors duration-75";
                div.textContent = hexVal;
                
                // Tooltip Events
                div.addEventListener('mouseenter', () => {
                    els.tooltip.innerHTML = `<span class="text-slate-400">Idx:</span> <span class="text-amber-400 font-bold">0x${idx.toString(16).toUpperCase().padStart(2,'0')}</span> <span class="text-slate-500 mx-1">→</span> <span class="text-slate-400">Val:</span> <span class="text-emerald-400 font-bold">0x${hexVal}</span>`;
                    els.tooltip.classList.remove('hidden');
                    requestAnimationFrame(() => els.tooltip.classList.remove('opacity-0'));
                });
                div.addEventListener('mouseleave', () => {
                    els.tooltip.classList.add('opacity-0');
                    els.tooltip.classList.add('hidden');
                });
                div.addEventListener('mousemove', (e) => {
                    els.tooltip.style.left = `${e.clientX}px`;
                    els.tooltip.style.top = `${e.clientY - 15}px`; 
                });

                els.sboxGrid.appendChild(div);
            }
        }
    }

    function doCrypto() {
        const txt = els.inputPlain.value;
        if(!txt) { 
            els.outCipher.textContent = '...'; 
            els.outDec.textContent = '...'; 
            return; 
        }
        
        // Encrypt
        const ciph = txt.split('').map(c => currentData.sbox[c.charCodeAt(0) % 256]);
        els.outCipher.textContent = ciph.map(b => b.toString(16).toUpperCase().padStart(2,'0')).join(' ');
        
        // Decrypt
        const dec = ciph.map(b => String.fromCharCode(inverseSBox[b])).join('');
        els.outDec.textContent = dec;
    }

    function updateUI(idx) {
        currentData = candidatesData[idx];
        inverseSBox = generateInverseSBox(currentData.sbox);
        
        // Update Header
        els.name.textContent = currentData.name;
        
        // Badge Style
        let badgeClass = "bg-slate-200 text-slate-600";
        if(currentData.type === 'proposed') badgeClass = "bg-emerald-100 text-emerald-700 border border-emerald-200";
        if(currentData.type === 'generated') badgeClass = "bg-blue-50 text-blue-600";
        els.type.className = `px-3 py-1 text-xs font-bold rounded-full border border-transparent ${badgeClass}`;
        els.type.textContent = currentData.id;

        // Render All Components
        renderMetrics(currentData.metrics);
        renderMatrix(currentData.matrix);
        renderSbox(currentData.sbox);
        doCrypto();
    }

    // 5. Initialization
    // Populate Dropdown
    const groupRef = document.createElement('optgroup'); groupRef.label = "Referensi Utama";
    const groupGen = document.createElement('optgroup'); groupGen.label = "Hasil Eksplorasi";

    candidatesData.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = d.name;
        if(d.type === 'standard' || d.type === 'proposed') groupRef.appendChild(opt);
        else groupGen.appendChild(opt);
    });
    els.selector.appendChild(groupRef);
    els.selector.appendChild(groupGen);

    // Event Listeners
    els.selector.addEventListener('change', (e) => updateUI(e.target.value));
    els.inputPlain.addEventListener('input', doCrypto);

    // Auto-select K44 if exists
    const k44Idx = candidatesData.findIndex(c => c.id === 'K44');
    if(k44Idx !== -1) {
        els.selector.value = k44Idx;
        updateUI(k44Idx);
    } else {
        updateUI(0);
    }
});
