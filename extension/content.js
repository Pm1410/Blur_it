// Inject Floating Button
const vibeButton = document.createElement('button');
vibeButton.id = 'cyhi-vibe-button';
vibeButton.innerText = '✨ Vibe Check';
document.body.appendChild(vibeButton);

// Inject Popup UI
const popup = document.createElement('div');
popup.id = 'cyhi-tooltip';
popup.innerHTML = `
  <div class="cyhi-header">⚠️ Toxicity Detected!</div>
  <div class="cyhi-suggestion" id="cyhi-text"></div>
  <button class="cyhi-btn cyhi-accept" id="cyhi-accept">Replace Text</button>
  <button class="cyhi-btn cyhi-ignore" id="cyhi-ignore">Ignore</button>
`;
document.body.appendChild(popup);

let activeInputField = null;
document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable) {
        activeInputField = e.target;
    }
});

// --- SERVERLESS AI ENGINE ---
// Paste your Hugging Face token here inside the quotes!
const HF_TOKEN = "Bearer hf_PUT_YOUR_TOKEN_HERE";

const filler_swear_words = [
    "mc", "bc", "b.c.", "m.c.", "mkc", "bsdk", "bkl", "bck", "madarchod", "behenchod", "bhenchod", 
    "bhosadike", "bhosdike", "bhosdiwale"
];

const adjective_swear_words = [
    "chutiya", "chutiye", "ch**iya", "c-tiya", "bakchodi", "saala", "saale", "kutta", "kutte", 
    "harami", "haraami", "kamina", "kaminey", "kamine", "randi", "bhadwa", "bhadwe", "gandu", "gndu", 
    "lodu", "ldu", "laude", "lnd", "lund", "chut", "gaand", "bhosdi", "tatte", "jhaatu", "chod", 
    "chodo", "chodna", "chudai", "chudwa", "gaandmasti", "dalaal", "suar", "suar ki aulad", 
    "namak haram", "haraamzada", "bewakoof", "gadha", "ullu", "ullu ke patthe", "dimaag kharab", 
    "pagal", "dhed shana", "chaprasi", "andhe", "bakwas", "chup kar", "aukaat", "aukat", "nikal", 
    "chal nikal", "bhad me ja", "mar ja", "jahil", "nirlajj", 
    "fuck", "fucking", "shit", "bitch", "asshole", "ass", "moron", "idiot"
];
const hinglish_swear_words = filler_swear_words.concat(adjective_swear_words);
const euphemistic_threats = ["send you to heaven", "hunt you down", "will end you", "dig a grave", "put you in a body bag"];

function normalizeLeetspeak(text) {
    const map = {'0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '@': 'a', '$': 's'};
    let norm = text.split('').map(c => map[c] || c).join('');
    norm = norm.replace(/f[\*_\-\.]+(u?)c?k/gi, 'fuck');
    norm = norm.replace(/f[\*_\-\.]+(u?)c?king/gi, 'fucking');
    norm = norm.replace(/sh[\*_\-\.]+(i?)t/gi, 'shit');
    norm = norm.replace(/s[\*_\-\.]+(h?)i?t/gi, 'shit');
    norm = norm.replace(/b[\*_\-\.]+(i?)t?ch/gi, 'bitch');
    norm = norm.replace(/a[\*_\-\.]+(s?)hole/gi, 'asshole');
    return norm;
}

vibeButton.addEventListener('click', async () => {
    if (!activeInputField) {
        alert("CYHI: Please click inside a text box first so I know what to vibe check!");
        return;
    }
    
    let text = activeInputField.value || activeInputField.innerText;
    if (!text || text.trim().length === 0) return;
    
    if (HF_TOKEN.includes("PUT_YOUR_TOKEN_HERE")) {
        alert("CYHI: You forgot to paste your Hugging Face token in the content.js file!");
        return;
    }
    
    vibeButton.innerText = 'Checking...';
    
    let normalized = normalizeLeetspeak(text);
    let isHinglishToxic = false;
    let isEnglishToxic = false;
    
    let politeVersion = normalized;
    let cleanText = normalized.toLowerCase().replace(/[^\w\s]/g, '');
    let words = cleanText.split(/\s+/);
    
    for (let word of words) {
        if (hinglish_swear_words.includes(word)) {
            isHinglishToxic = true;
            if (filler_swear_words.includes(word)) {
                let regex = new RegExp(`\\b${word}\\b`, 'gi');
                politeVersion = politeVersion.replace(regex, '');
            } else if (adjective_swear_words.includes(word)) {
                let regex = new RegExp(`\\b${word}\\b`, 'gi');
                politeVersion = politeVersion.replace(regex, '***');
            }
        }
    }
    
    politeVersion = politeVersion.replace(/\s+/g, ' ').trim();
    
    if (!isHinglishToxic) {
        for (let threat of euphemistic_threats) {
            if (normalized.toLowerCase().includes(threat)) {
                isEnglishToxic = true; break;
            }
        }
        
        if (!isEnglishToxic) {
            // Call Hugging Face API directly for BERT
            try {
                let res = await fetch("https://api-inference.huggingface.co/models/martin-ha/toxic-comment-model", {
                    method: "POST", headers: {"Authorization": HF_TOKEN, "Content-Type": "application/json"},
                    body: JSON.stringify({inputs: normalized})
                });
                let data = await res.json();
                if (data && data.length > 0 && data[0].length > 0) {
                    let toxicScore = data[0].find(d => d.label === 'toxic');
                    if (toxicScore && toxicScore.score > 0.5) isEnglishToxic = true;
                }
            } catch(e) {}
        }
    }
    
    if (isHinglishToxic) {
        showPopup(politeVersion, activeInputField);
    } else if (isEnglishToxic) {
        // Call Hugging Face API directly for BART Rephraser
        try {
            let res = await fetch("https://api-inference.huggingface.co/models/s-nlp/bart-base-detox", {
                method: "POST", headers: {"Authorization": HF_TOKEN, "Content-Type": "application/json"},
                body: JSON.stringify({inputs: normalized})
            });
            let data = await res.json();
            if (data && data.length > 0 && data[0].generated_text) {
                let rephrased = data[0].generated_text;
                if (rephrased.toLowerCase() === normalized.toLowerCase()) {
                    showPopup("🤡💩 [CENSORED BY VIBE CHECK] 💩🤡", activeInputField);
                } else {
                    showPopup(rephrased, activeInputField);
                }
            } else {
                showPopup("🤡💩 [CENSORED BY VIBE CHECK] 💩🤡", activeInputField);
            }
        } catch(e) {
            showPopup("🤡💩 [CENSORED BY VIBE CHECK] 💩🤡", activeInputField);
        }
    } else {
        alert("✅ Passed the Vibe Check! Your text is safe.");
    }
    
    vibeButton.innerText = '✨ Vibe Check';
});

function showPopup(suggestion, targetElement) {
    document.getElementById('cyhi-text').innerText = "Suggestion: " + suggestion;
    popup.style.display = 'block';
    const rect = targetElement.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    
    if (rect.bottom + popupRect.height + 10 < window.innerHeight) {
        popup.style.top = (window.scrollY + rect.bottom + 5) + 'px';
    } else {
        popup.style.top = (window.scrollY + rect.top - popupRect.height - 5) + 'px';
    }
    popup.style.left = (window.scrollX + rect.left) + 'px';
    
    document.getElementById('cyhi-accept').onclick = () => {
        if (activeInputField.tagName === 'TEXTAREA' || activeInputField.tagName === 'INPUT') {
            activeInputField.value = suggestion;
        } else {
            activeInputField.innerText = suggestion;
        }
        popup.style.display = 'none';
    };
    document.getElementById('cyhi-ignore').onclick = () => {
        popup.style.display = 'none';
    };
}
