from transformers import pipeline
import time

print("Initializing the Hybrid Toxic Vibe Detector (Hinglish + English)...")

# Layer 1: Hinglish Keyword Dictionary (Add more as needed!)
hinglish_swear_words = ["mc", "bc", "mkc", "bsdk", "chutiya", "saala", "kutta"]

# Layer 2: Load the BERT model for English semantics
print("Loading BERT model...")
classifier = pipeline("text-classification", model="martin-ha/toxic-comment-model")

def check_vibe(draft_text):
    print(f"Analyzing draft: '{draft_text}'")
    start_time = time.time()
    
    # 1. First Check: Hinglish Keywords
    words = draft_text.lower().split()
    for word in words:
        if word in hinglish_swear_words:
            print(f"⚠️  TOXIC VIBE DETECTED! (Reason: Hinglish profanity '{word}')")
            print(f"(Analysis took {time.time() - start_time:.4f} seconds)\n")
            return "toxic", word
            
    # 2. Second Check: Deep English Semantics (BERT)
    result = classifier(draft_text)
    label = result[0]['label']
    score = result[0]['score']
    
    if label == "toxic":
        print(f"⚠️  TOXIC VIBE DETECTED! (Reason: English Semantics, Confidence: {score:.2%})")
        print(f"(Analysis took {time.time() - start_time:.4f} seconds)\n")
        return "toxic", "semantic"
        
    print(f"✅ Vibe check passed. Safe to post! (Confidence: {score:.2%})")
    print(f"(Analysis took {time.time() - start_time:.4f} seconds)\n")
    return "safe", "none"

if __name__ == "__main__":
    print("--- Testing the Hybrid Vibe Detector ---")
    
    # Test case 1: English Safe
    check_vibe("Hackathons are so much fun!")
    
    # Test case 2: Sneaky Hinglish
    check_vibe("what are you doing bc ?")
    
    # Test case 3: English Profanity
    check_vibe("I saw his ass.")
    
    # Test case 4: English Threat
    check_vibe("I will kill you.")
    
    # Test case 5: English Context (Using a "violent" word in a safe context)
    check_vibe("I am going to kill the final boss in this video game!")
