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

// --- 100% OFFLINE EDGE COMPUTE ENGINE ---

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
    "kutte ki zat", "कुत्ते की ज़ात", "suar ki zat", "सूअर की ज़ात", "सूअर की औलाद",
    "gadhe ki aulad", "गधे की औलाद", "gadhe ki zat", "गधे की ज़ात", "bandar ki aulad", "बंदर की औलाद", 
    "bandar ki zat", "बंदर की ज़ात", "bhains ki aulad", "भैंस की औलाद", "bhains ki zat", "भैंस की ज़ात", 
    "ullu ki zat", "उल्लू की ज़ात", "lomdi ki aulad", "लोमड़ी की औलाद", 
    "lomdi ki zat", "लोमड़ी की ज़ात", "bhed ki aulad", "भेड़ की औलाद", "bhed ki zat", "भेड़ की ज़ात", 
    "bakri ki aulad", "बकरी की औलाद", "bakri ki zat", "बकरी की ज़ात", "billi ki aulad", "बिल्ली की औलाद", 
    "billi ki zat", "बिल्ली की ज़ात", "mendhak ki aulad", "मेंढक की औलाद", "mendhak ki zat", "मेंढक की ज़ात", 
    "badir", "बदीर", "badirchand", "बदीरचंद", "bakland", "बकलैंड", "बकलंड", "bhandwa", "भंडवा", 
    "भड़वा", "chinaal", "चिनाल", "छनाल", "चूतिया", "चुतिया", "ghasti", "घसटी", "घसति", "ghassad", 
    "घसड़", "घस्सड़", "हरामी", "haram zada", "हरामज़ादा", "हरामजादा", "hijda", "हिजड़ा", "hijra", 
    "tatti", "टट्टी", "चोद", "land", "लंड", "lode", "लोडे", "takke", "टक्के", "chakka", "छक्का", 
    "faggot", "टट्टे", "raand", "रांड", "randhwa", "रंढवा", "jigolo", "जिगोलो", "रंडी", 
    "चूत", "bund", "बंड", "गांडू", "gandi", "गांडी", "bhosdi wala", "भोसड़ी वाला", 
    "bhonsri wala", "भोंसड़ी वाला", "bhosri wala", "भोसरी वाला", "boobley", "बूबले", "chuchi", "चुची", 
    "chuuche", "चूचे", "chuchiyan", "चूचियां", "chut marike", "चूत मार के", "land marike", "लंड मार के", 
    "gand mari ke", "गांड मारी के", "chodu", "चोदू", "lavda", "लौड़ा", "lawda", "लौंडा", "loda", "लोडा", 
    "muth marna", "मुठ मारना", "muthi", "मुठी", "mutthal", "मुठल", "baable", "बाबले", "bur", "बुर", 
    "चोदना", "chudna", "चुदना", "chud", "चुद", "buuble", "भड़वे", "bhadwon", "भड़वों", 
    "bhadwi", "भड़वी", "bhadwapanti", "भड़वापंती", "chodela", "चोदेला", "marana", "मारना", "marani", "मारनी", 
    "marane", "मारने", "gandphatu", "गांडफटू", "gandphati", "गांडफटी", "gandphata", "गांडफटा", "gandphaton", 
    "गांडफटों", "गांडमस्ती", "gand marna", "गांड मारना", "gand maru", "गांड मारू", "gand mari", 
    "गांड मारी", "gand marana", "गांड माराना", "jhaant", "झाँट", "gand phatu", "गांड फटू", "gand phati", "गांड फटी", 
    "gand phata", "गांड फटा", "gand phaton", "गांड फटों", "gaand masti", "गांड मस्ती", "gandmarna", "गांडमरना", 
    "gandmaru", "गांडमरू", "gandmarana", "गांडमराना", "gandmari", "गांडमारी", "randibazar", "रंडीबाज़ार", 
    "chodo", "चोदो", "chodi", "चोदी", "chodne", "चोदने", "chodva", "चोदवा", "chudo", "चुदो", "chudi", "चुदी", 
    "chudne", "चुदने", "chudva", "चुदवा", "chodai", "चोदाई", "chuda", "चुदा", "chudai", "चुदाई", "chudvana", 
    "चुदवाना", "haramia", "हरामिया", "haramzada", "haramzadi", "हरामज़ादी", "haramkhor", "हरामख़ोर", "kamini", 
    "कमीनी", "bhosdi", "भोसड़ी", "bhosdike", "भोसड़ीके", "bhandi", "भंडी", "rand", "randwa", 
    "रांडवा", "randibazaar", "रांडिबाजार", "hijade", "हिजड़े", "gandu", "गंडू", "लवड़ा", "lundwa", "लंडवा", 
    "chutmar", "चूतमार", "chutiyapa", "चूतियापा"
];
const hinglish_swear_words = filler_swear_words.concat(adjective_swear_words);
hinglish_swear_words.sort((a, b) => b.length - a.length);

const englishToxicWords = [
  "ass", "asshole", "ass clown", "asshat", "asswipe", "badass", "bastard", "bitch", "bitches", "bitching", 
  "bitchy", "blowjob", "bollocks", "boner", "bullshit", "clit", "cock", "cocksucker", "crap", "cunt", 
  "cunts", "dick", "dickhead", "dildo", "dipshit", "douche", "douchebag", "dumbass", "fag", "faggot", 
  "fuck", "fucker", "fucking", "fuckup", "fucked", "fucks", "goddamn", "horseshit", "jackass", "jerkoff", 
  "motherfucker", "motherfucking", "nigga", "nigger", "piss", "pissed", "pissing", "prick", "pussy", 
  "pussies", "shit", "shitty", "shithole", "shithead", "slut", "sluts", "slutty", "son of a bitch", 
  "tit", "tits", "twat", "wanker", "whore", "whores", "clown", "creep", "craphead", "cretin", "degenerate", 
  "dirtbag", "dolt", "dope", "drop dead", "dunce", "fatass", "freak", "garbage", "go to hell", "halfwit", 
  "idiot", "idiotic", "ignorant", "imbecile", "incompetent", "kill yourself", "kys", "loser", "lowlife", 
  "lunatic", "moron", "moronic", "muppet", "nerd", "nincompoop", "noob", "nutjob", "parasite", "pathetic", 
  "psycho", "rat", "retard", "retarded", "rubbish", "scumbag", "scum", "shut up", "simp", "skank", 
  "slimeball", "sociopath", "trash", "troll", "ugly", "useless", "vile", "waste of breath", 
  "waste of space", "worthless"
];

const englishReplacementMap = {
  "asshole": "difficult person", "ass": "attitude", "bastard": "troublemaker", "bitch": "complain", 
  "bitches": "critics", "bitching": "grumbling", "bullshit": "nonsense", "crap": "rubbish", 
  "cunt": "unpleasant person", "dickhead": "fool", "dick": "jerk", "dumbass": "unwise person", 
  "fucking": "extremely", "fucked": "compromised", "fuck": "mess up", "goddamn": "frustrating", 
  "horseshit": "inaccuracy", "idiot": "individual", "idiotic": "ill-advised", "jackass": "mischief-maker", 
  "kill yourself": "take a step back", "kys": "cool down", "loser": "underdog", "moron": "layman", 
  "moronic": "misguided", "motherfucker": "adversary", "pathetic": "underwhelming", "pissed": "agitated", 
  "retard": "person with differences", "retarded": "illogical", "scumbag": "unreliable person", 
  "shit": "mess", "shitty": "poor quality", "shut up": "please pause", "slut": "individual", 
  "stfu": "please stop", "trash": "subpar", "useless": "ineffective", "whore": "individual", 
  "worthless": "unproductive"
};

const allEnglishToxics = [...englishToxicWords];
allEnglishToxics.sort((a, b) => b.length - a.length);

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

function makeSafeRegex(word) {
    if (/^[a-zA-Z0-9\s]+$/.test(word)) {
        return new RegExp(`\\b${word}\\b`, 'gi');
    } else {
        return new RegExp(word, 'gi');
    }
}

vibeButton.addEventListener('click', async () => {
    if (!activeInputField) {
        alert("CYHI: Please click inside a text box first so I know what to vibe check!");
        return;
    }
    
    let text = activeInputField.value || activeInputField.innerText;
    if (!text || text.trim().length === 0) return;
    
    let normalized = normalizeLeetspeak(text);
    let isToxic = false;
    let politeVersion = normalized;
    let lowerNorm = normalized.toLowerCase();
    
    // 1. Check English Replacement Map
    for (const [toxic, polite] of Object.entries(englishReplacementMap)) {
        if (lowerNorm.includes(toxic.toLowerCase())) {
            isToxic = true;
            politeVersion = politeVersion.replace(makeSafeRegex(toxic), polite);
        }
    }
    
    // 2. Check remaining English words (censor if no exact replacement exists)
    for (let word of allEnglishToxics) {
        if (!englishReplacementMap[word]) {
            if (lowerNorm.includes(word.toLowerCase())) {
                isToxic = true;
                politeVersion = politeVersion.replace(makeSafeRegex(word), '***');
            }
        }
    }
    
    // 3. Check Hinglish / Hindi
    for (let word of hinglish_swear_words) {
        if (lowerNorm.includes(word.toLowerCase())) {
            isToxic = true;
            if (filler_swear_words.includes(word)) {
                politeVersion = politeVersion.replace(makeSafeRegex(word), '');
            } else {
                politeVersion = politeVersion.replace(makeSafeRegex(word), '***');
            }
        }
    }
    
    // Clean up spaces
    politeVersion = politeVersion.replace(/\s+/g, ' ').trim();
    
    if (isToxic) {
        showPopup(politeVersion, activeInputField);
    } else {
        alert("✅ Passed the Vibe Check! Your text is safe.");
    }
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
