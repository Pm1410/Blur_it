// scanner.js
// 100% Offline API-less Toxicity Scanner (Objective 1)

// Dictionaries
const hindiSevere = [
    "mc", "bc", "bsdk", "bkl", "madarchod", "behenchod", "bhosadike", "chutiya", "bakchodi", "saala", "kutta", 
    "harami", "kamina", "randi", "bhadwa", "gandu", "lodu", "laude", "lund", "chut", "gaand", "bhosdi", "tatte", 
    "suar", "bewakoof", "gadha", "ullu", "chaprasi", "kutte ki zat", "कुत्ते की ज़ात", "सूअर की ज़ात", "सूअर की औलाद",
    "गधे की औलाद", "गधे की ज़ात", "बंदर की औलाद", "बंदर की ज़ात", "भैंस की औलाद", "भैंस की ज़ात", 
    "उल्लू की ज़ात", "लोमड़ी की औलाद", "लोमड़ी की ज़ात", "भेड़ की औलाद", "भेड़ की ज़ात", 
    "बकरी की औलाद", "बकरी की ज़ात", "बिल्ली की औलाद", "बिल्ली की ज़ात", "मेंढक की औलाद", "मेंढक की ज़ात", 
    "बदीर", "बकलैंड", "भंडवा", "भड़वा", "चिनाल", "छनाल", "चूतिया", "चुतिया", "घसटी", 
    "घसड़", "हरामी", "हरामज़ादा", "हिजड़ा", "tatti", "टट्टी", "चोद", "लंड", "लोडे", "छक्का", 
    "टट्टे", "रांड", "रंढवा", "जिगोलो", "रंडी", "चूत", "बंड", "गांडू", "गांडी", "भोसड़ी वाला", 
    "भोंसड़ी वाला", "चुची", "चूचे", "चूत मार के", "लंड मार के", "गांड मारी के", "चोदू", "लौड़ा", "लोडा", 
    "मुठ मारना", "मुठी", "मुठल", "बाबले", "बुर", "चोदना", "चुदना", "चुद", "भड़वे", "भड़वों", 
    "भड़वी", "भड़वापंती", "चोदेला", "गांडफटू", "गांडफटी", "गांडफटा", "गांडमस्ती", "गांड मारना", 
    "गांड मारू", "गांड मारी", "झाँट", "गांड फटू", "रंडीबाज़ार", "चोदो", "चोदी", "चोदने", "चुदो", 
    "चुदी", "चुदने", "चोदाई", "चुदा", "चुदाई", "हरामिया", "हरामज़ादी", "हरामख़ोर", "कमीनी", 
    "भोसड़ी", "भोसड़ीके", "भंडी", "रांडवा", "रांडिबाजार", "हिजड़े", "गंडू", "लवड़ा", "लंडवा", "चूतमार", "चूतियापा"
];

const englishSevere = [
    "asshole", "bastard", "bitch", "cunt", "dick", "fag", "faggot", "fuck", "fucker", "fucking", 
    "motherfucker", "nigga", "nigger", "pussy", "slut", "whore", "kill yourself", "kys"
];

const englishMild = [
    "ass", "bullshit", "crap", "craphead", "creep", "dolt", "dunce", "fatass", "freak", "garbage", 
    "idiot", "idiotic", "ignorant", "loser", "lunatic", "moron", "moronic", "nerd", "pathetic", 
    "rubbish", "scumbag", "shit", "shitty", "shut up", "simp", "trash", "troll", "ugly", "useless"
];

let globalMaxToxicity = 0;
let isPaused = false;
let currentMode = 'default'; // 'default', 'hoverer', 'unblur'

// --- BUILD THE SIDEBAR UI ---
const sidebar = document.createElement('div');
sidebar.id = 'cyhi-sidebar';
sidebar.innerHTML = `
  <div class="cyhi-tool" id="btn-pause" title="Play/Pause Scanner">⏸</div>
  <div class="cyhi-tool" id="btn-hoverer" title="Hover Scanner Tool">🔍</div>
  <div class="cyhi-tool" id="btn-unblur" title="Unblur Tool">👁</div>
  <div class="cyhi-tool" id="cyhi-rating-box" title="Global Toxicity Level">00</div>
`;
document.body.appendChild(sidebar);

const ratingBox = document.getElementById('cyhi-rating-box');
const btnPause = document.getElementById('btn-pause');
const btnHoverer = document.getElementById('btn-hoverer');
const btnUnblur = document.getElementById('btn-unblur');

// --- SIDEBAR LOGIC ---
let isExpanded = false;

ratingBox.addEventListener('click', () => {
    isExpanded = !isExpanded;
    if (isExpanded) {
        sidebar.classList.add('expanded');
    } else {
        sidebar.classList.remove('expanded');
    }
});

function updateRatingUI(score) {
    // Format to 2 digits for aesthetic (e.g. 05, 90)
    let formattedScore = score.toString().padStart(2, '0');
    ratingBox.innerText = formattedScore;
    ratingBox.style.color = "#ffffff";
}

btnPause.addEventListener('click', () => {
    isPaused = !isPaused;
    if (isPaused) {
        btnPause.innerText = '▶';
        document.body.classList.add('cyhi-paused');
        ratingBox.innerText = '--';
        ratingBox.style.color = 'rgba(255,255,255,0.3)';
    } else {
        btnPause.innerText = '⏸';
        document.body.classList.remove('cyhi-paused');
        updateRatingUI(globalMaxToxicity);
    }
});

btnHoverer.addEventListener('click', () => {
    if (currentMode === 'hoverer') {
        currentMode = 'default';
        btnHoverer.classList.remove('active');
        document.body.classList.remove('cyhi-mode-hoverer');
        updateRatingUI(globalMaxToxicity);
    } else {
        currentMode = 'hoverer';
        btnHoverer.classList.add('active');
        btnUnblur.classList.remove('active');
        document.body.classList.add('cyhi-mode-hoverer');
        document.body.classList.remove('cyhi-mode-unblur');
        ratingBox.innerText = '0';
        ratingBox.style.color = 'white';
    }
});

btnUnblur.addEventListener('click', () => {
    if (currentMode === 'unblur') {
        currentMode = 'default';
        btnUnblur.classList.remove('active');
        document.body.classList.remove('cyhi-mode-unblur');
        
        // Re-blur everything that was peeked at
        document.querySelectorAll('.cyhi-unblurred-override').forEach(el => {
            el.classList.remove('cyhi-unblurred-override');
        });
    } else {
        currentMode = 'unblur';
        btnUnblur.classList.add('active');
        btnHoverer.classList.remove('active');
        document.body.classList.add('cyhi-mode-unblur');
        document.body.classList.remove('cyhi-mode-hoverer');
        updateRatingUI(globalMaxToxicity);
    }
});

// --- HOVER & CLICK LOGIC ON THE PAGE ---
document.addEventListener('mouseover', (e) => {
    if (currentMode === 'hoverer' && !isPaused) {
        if (e.target.hasAttribute('data-toxic-score')) {
            updateRatingUI(e.target.getAttribute('data-toxic-score'));
        } else {
            // Calculate score of hovered element on the fly
            let text = e.target.innerText || e.target.textContent || "";
            if (text.length > 2) {
                let s = calculateScore(text);
                updateRatingUI(s);
            } else {
                updateRatingUI(0);
            }
        }
    }
});

document.addEventListener('click', (e) => {
    if (currentMode === 'unblur' && !isPaused) {
        if (e.target.classList.contains('cyhi-blurred') || e.target.closest('.cyhi-blurred')) {
            e.preventDefault();
            e.stopPropagation();
            let el = e.target.classList.contains('cyhi-blurred') ? e.target : e.target.closest('.cyhi-blurred');
            el.classList.add('cyhi-unblurred-override');
        }
    }
}, true); // Capture phase to intercept clicks on blurred items


// --- SCORING & SCANNING LOGIC ---
function makeSafeRegex(word) {
    if (/^[a-zA-Z0-9\s]+$/.test(word)) {
        return new RegExp(`\\b${word}\\b`, 'gi');
    } else {
        return new RegExp(word, 'gi');
    }
}

function calculateScore(text) {
    let score = 0;
    
    hindiSevere.forEach(word => { 
        if (makeSafeRegex(word).test(text)) score += 90; 
    });
    englishSevere.forEach(word => { 
        if (makeSafeRegex(word).test(text)) score += 90; 
    });
    englishMild.forEach(word => { 
        if (makeSafeRegex(word).test(text)) score += 40; 
    });
    
    return Math.min(score, 100);
}

function scanNode(node) {
    if (isPaused) return;
    if (node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE' || node.nodeName === 'NOSCRIPT') return;
    
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text.length < 3) return;
        
        let score = calculateScore(text);
        if (score > 0) {
            let parent = node.parentElement;
            if (parent && !parent.hasAttribute('data-toxic-score') && parent.id !== 'cyhi-sidebar') {
                parent.setAttribute('data-toxic-score', score);
                
                if (score > globalMaxToxicity) {
                    globalMaxToxicity = score;
                    if (currentMode !== 'hoverer') updateRatingUI(globalMaxToxicity);
                }
                
                if (score >= 80) {
                    parent.classList.add('cyhi-blurred');
                }
            }
        }
    } else {
        node.childNodes.forEach(scanNode);
    }
}

// Initial full page scan
setTimeout(() => { scanNode(document.body); }, 1000);

// Watch for new content (like scrolling down)
const observer = new MutationObserver((mutations) => {
    if (isPaused) return;
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE && node.id !== 'cyhi-sidebar') {
                scanNode(node);
            }
        });
    });
});

observer.observe(document.body, { childList: true, subtree: true });
