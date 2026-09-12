// scanner.js
// 100% Offline API-less Toxicity Scanner

// All Hindi/Hinglish words are highly toxic (Score: 90)
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

// Extreme English Slurs (Score: 90)
const englishSevere = [
    "asshole", "bastard", "bitch", "cunt", "dick", "fag", "faggot", "fuck", "fucker", "fucking", 
    "motherfucker", "nigga", "nigger", "pussy", "slut", "whore", "kill yourself", "kys"
];

// Mild English words (Score: 40) - Requires two to hit 80 threshold
const englishMild = [
    "ass", "bullshit", "crap", "craphead", "creep", "dolt", "dunce", "fatass", "freak", "garbage", 
    "idiot", "idiotic", "ignorant", "loser", "lunatic", "moron", "moronic", "nerd", "pathetic", 
    "rubbish", "scumbag", "shit", "shitty", "shut up", "simp", "trash", "troll", "ugly", "useless"
];

let globalMaxToxicity = 0;

// Initialize the Valorant-style HUD
const hud = document.createElement('div');
hud.id = 'cyhi-hud';
hud.innerHTML = `
  <div class="hud-title">CYHI_SCANNER.EXE</div>
  <div class="hud-score">THREAT LEVEL: <span id="hud-val">0</span>/100</div>
`;
document.body.appendChild(hud);

// Custom Cursor for Hovering
const cursorTooltip = document.createElement('div');
cursorTooltip.id = 'cyhi-cursor-tooltip';
document.body.appendChild(cursorTooltip);

document.addEventListener('mousemove', (e) => {
    cursorTooltip.style.left = (e.pageX + 15) + 'px';
    cursorTooltip.style.top = (e.pageY + 15) + 'px';
});

function calculateScore(text) {
    let score = 0;
    let lower = text.toLowerCase();
    
    hindiSevere.forEach(word => { if (lower.includes(word)) score += 90; });
    englishSevere.forEach(word => { if (lower.includes(word)) score += 90; });
    englishMild.forEach(word => { if (lower.includes(word)) score += 40; });
    
    return Math.min(score, 100);
}

function updateHUD(score) {
    if (score > globalMaxToxicity) {
        globalMaxToxicity = score;
        document.getElementById('hud-val').innerText = globalMaxToxicity;
        if (globalMaxToxicity >= 80) {
            hud.style.borderColor = "#ff003c"; // Valorant Red
            hud.style.color = "#ff003c";
        } else if (globalMaxToxicity >= 40) {
            hud.style.borderColor = "#ffeb3b"; // Yellow
            hud.style.color = "#ffeb3b";
        }
    }
}

function scanNode(node) {
    // Skip script/style tags and already scanned elements
    if (node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE' || node.nodeName === 'NOSCRIPT') return;
    
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text.length < 3) return;
        
        let score = calculateScore(text);
        if (score > 0) {
            let parent = node.parentElement;
            if (parent && !parent.hasAttribute('data-toxic-score')) {
                parent.setAttribute('data-toxic-score', score);
                updateHUD(score);
                
                if (score >= 80) {
                    parent.classList.add('cyhi-blurred');
                    
                    // Add mouse events for the cursor scanner
                    parent.addEventListener('mouseenter', () => {
                        cursorTooltip.style.display = 'block';
                        cursorTooltip.innerText = `Toxicity: ${score}/100`;
                    });
                    parent.addEventListener('mouseleave', () => {
                        cursorTooltip.style.display = 'none';
                    });
                    
                    // Click to unblur
                    parent.addEventListener('click', (e) => {
                        e.stopPropagation();
                        parent.classList.remove('cyhi-blurred');
                        parent.style.border = "1px dashed #ff003c";
                        cursorTooltip.style.display = 'none';
                    }, { once: true });
                }
            }
        }
    } else {
        node.childNodes.forEach(scanNode);
    }
}

// Initial full page scan
setTimeout(() => {
    scanNode(document.body);
}, 1000);

// Watch for new content (like scrolling down on Twitter/YouTube)
const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                scanNode(node);
            }
        });
    });
});

observer.observe(document.body, { childList: true, subtree: true });
