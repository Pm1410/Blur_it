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

// Track the last clicked input field
let activeInputField = null;
document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable) {
        activeInputField = e.target;
    }
});

vibeButton.addEventListener('click', async () => {
    if (!activeInputField) {
        alert("CYHI: Please click inside a text box first so I know what to vibe check!");
        return;
    }
    
    let text = activeInputField.value || activeInputField.innerText;
    if (!text || text.trim().length === 0) {
        alert("CYHI: The text box is empty!");
        return;
    }
    
    vibeButton.innerText = 'Checking...';
    
    try {
        const response = await fetch('http://127.0.0.1:8000/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });
        
        const data = await response.json();
        
        if (data.status === 'toxic') {
            showPopup(data.rephrase_suggestion, activeInputField);
        } else {
            alert("✅ Passed the Vibe Check! Your text is safe.");
        }
    } catch (err) {
        alert("Backend Error! Is your Python server running on port 8000?");
    }
    
    vibeButton.innerText = '✨ Vibe Check';
});

function showPopup(suggestion, targetElement) {
    document.getElementById('cyhi-text').innerText = "Suggestion: " + suggestion;
    
    // We must display the popup first so the browser can calculate its height
    popup.style.display = 'block';
    
    const rect = targetElement.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    
    // Dynamic Positioning: Check if there is enough room BELOW the text box
    if (rect.bottom + popupRect.height + 10 < window.innerHeight) {
        // Spawn below
        popup.style.top = (window.scrollY + rect.bottom + 5) + 'px';
    } else {
        // Spawn ABOVE (Perfect for WhatsApp and chat apps!)
        popup.style.top = (window.scrollY + rect.top - popupRect.height - 5) + 'px';
    }
    
    popup.style.left = (window.scrollX + rect.left) + 'px';
    
    // If they click Replace, swap the text out!
    document.getElementById('cyhi-accept').onclick = () => {
        if (activeInputField.tagName === 'TEXTAREA' || activeInputField.tagName === 'INPUT') {
            activeInputField.value = suggestion;
        } else {
            activeInputField.innerText = suggestion;
        }
        popup.style.display = 'none';
    };
    
    // If they click Ignore, hide the popup
    document.getElementById('cyhi-ignore').onclick = () => {
        popup.style.display = 'none';
    };
}
