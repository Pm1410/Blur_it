from fastapi import FastAPI
from pydantic import BaseModel
from transformers import pipeline, AutoTokenizer, AutoModelForSeq2SeqLM
import time
import re
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Local Toxicity API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

filler_swear_words = ["mc", "bc", "mkc", "bsdk", "bhosdike", "madarchod", "behenchod", "bhenchod"]
adjective_swear_words = [
    "chutiya", "saala", "kutta", "harami", "kamina", "randi", "bhadwa", "gandu", 
    "lodu", "lnd", "lund", "chut", "gaand", "bhosdi", "tatte", "bhosadike",
    "fuck", "fucking", "shit", "bitch", "asshole", "ass", "moron", "idiot"
]
hinglish_swear_words = filler_swear_words + adjective_swear_words

# 3. Euphemistic threats (Sarcastic or metaphorical threats that AI models miss)
euphemistic_threats = [
    "send you to heaven",
    "sleep with the fishes",
    "put you in the ground",
    "send you to god",
    "meet your maker",
    "hunt you down",
    "know where you live"
]

print("1/2: Loading BERT Toxicity Detector...")
classifier = pipeline("text-classification", model="martin-ha/toxic-comment-model")

print("2/2: Loading AI Rephraser...")
rephrase_tokenizer = AutoTokenizer.from_pretrained("s-nlp/bart-base-detox")
rephrase_model = AutoModelForSeq2SeqLM.from_pretrained("s-nlp/bart-base-detox")

print("Models loaded! Server is ready.")

class TextRequest(BaseModel):
    text: str

def normalize_leetspeak(text):
    # A dictionary to translate common leetspeak numbers back to letters
    leetspeak_map = {
        '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '@': 'a', '$': 's'
    }
    normalized = ""
    for char in text:
        normalized += leetspeak_map.get(char, char)
        
    # Catch partial punctuation masks (e.g., f***ing, sh*t, b*tch, f*ck)
    # We add optional letters like (c?) and (t?) because sometimes people type f*ck and sometimes f**k!
    normalized = re.sub(r'(?i)f[\*_\-\.]+(u?)c?k', 'fuck', normalized)
    normalized = re.sub(r'(?i)f[\*_\-\.]+(u?)c?king', 'fucking', normalized)
    normalized = re.sub(r'(?i)sh[\*_\-\.]+(i?)t', 'shit', normalized)
    normalized = re.sub(r'(?i)s[\*_\-\.]+(h?)i?t', 'shit', normalized)
    normalized = re.sub(r'(?i)b[\*_\-\.]+(i?)t?ch', 'bitch', normalized)
    normalized = re.sub(r'(?i)a[\*_\-\.]+(s?)hole', 'asshole', normalized)
    
    return normalized

@app.post("/analyze")
def analyze_text(request: TextRequest):
    draft_text = request.text
    
    # Run the text through our de-obfuscator first!
    normalized_text = normalize_leetspeak(draft_text)
    
    is_hinglish_toxic = False
    is_english_toxic = False
    bad_words_found = []
    
    # 1. ALWAYS run Dictionary Check on the NORMALIZED text
    polite_version = normalized_text
    clean_text = re.sub(r'[^\w\s]', '', normalized_text.lower())
    words = clean_text.split()
    
    for word in words:
        if word in hinglish_swear_words:
            is_hinglish_toxic = True
            bad_words_found.append(word)
            if word in filler_swear_words:
                polite_version = re.sub(r'(?i)\b' + re.escape(word) + r'\b', '', polite_version)
            else:
                polite_version = re.sub(r'(?i)\b' + re.escape(word) + r'\b', '***', polite_version)
            
    polite_version = polite_version.replace(" ,", ",").replace(", ,", ",")
    polite_version = polite_version.strip(" ,") 
    polite_version = " ".join(polite_version.split())
            
    # 2. Run English BERT Check
    result = classifier(normalized_text)
    if result[0]['label'] == "toxic":
        is_english_toxic = True
        
    # 2.5 Run Euphemistic Threat Check (Manual Override)
    for threat in euphemistic_threats:
        if threat in normalized_text.lower():
            is_english_toxic = True
            break
            
    # 3. Final Output Generation
    if is_hinglish_toxic:
        # If it has Hinglish, we CANNOT use the AI Rephraser because it will delete the Hindi words!
        # We rely strictly on our dictionary which perfectly blurred everything.
        return {
            "status": "toxic", 
            "reason": "Hinglish/Mixed profanity", 
            "rephrase_suggestion": polite_version
        }
        
    elif is_english_toxic:
        # It is a PURE English toxic sentence! Safe to use the AI Rephraser.
        inputs = rephrase_tokenizer(normalized_text, return_tensors="pt")
        outputs = rephrase_model.generate(**inputs, max_length=50)
        final_polite_version = rephrase_tokenizer.decode(outputs[0], skip_special_tokens=True)
        
        # Fallback check for extreme English threats
        clean_polite = " ".join(re.sub(r'[^\w\s]', '', final_polite_version).lower().split())
        clean_draft = " ".join(re.sub(r'[^\w\s]', '', draft_text).lower().split())
        
        if clean_polite == clean_draft:
            final_polite_version = "🤡💩 [CENSORED BY VIBE CHECK] 💩🤡"
            
        return {
            "status": "toxic", 
            "reason": "English semantics", 
            "rephrase_suggestion": final_polite_version
        }
        
    return {"status": "safe", "reason": "none", "rephrase_suggestion": draft_text}

if __name__ == "__main__":
    import uvicorn
    print("Starting local AI server on port 8000...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
