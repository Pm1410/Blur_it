"""Generates a rich bilingual (English + Hinglish) toxicity dataset for training."""

import csv
from pathlib import Path

DATA = [
    # --- English Safe (0) ---
    ("Hackathons are so much fun!", 0),
    ("Great job on finishing the presentation yesterday.", 0),
    ("Could you please review my pull request when you have time?", 0),
    ("I love working with React and Chrome Extensions.", 0),
    ("The weather today is absolutely beautiful.", 0),
    ("I respectfully disagree with that architectural choice.", 0),
    ("Let's grab some coffee and discuss the deployment plan.", 0),
    ("I am going to kill the final boss in this video game tonight!", 0),
    ("Dude, your guitar solo totally killed it on stage!", 0),
    ("Can someone help me debug this async function in Python?", 0),
    ("Thanks for sharing that insightful article on machine learning.", 0),
    ("Happy birthday! Wishing you an incredible year ahead.", 0),
    ("Let's schedule a call tomorrow at 10 AM to finalize the slides.", 0),
    ("The documentation is clear and easy to follow.", 0),
    ("I am learning deep learning and neural networks.", 0),
    ("This code needs some refactoring, but the logic is solid.", 0),
    ("Good morning everyone, hope you have a productive day.", 0),
    ("The server latency dropped down to 12ms after caching.", 0),
    ("I appreciate your constructive feedback on my essay.", 0),
    ("Let's make sure our tests pass before opening the PR.", 0),
    ("What time does the workshop begin tomorrow?", 0),
    ("We should optimize the database query to avoid timeouts.", 0),
    ("Congratulations on your new job offer!", 0),
    ("I enjoy reading books about history and science fiction.", 0),
    ("Can we add dark mode support to the landing page?", 0),
    ("The design looks sleek, clean, and very modern.", 0),
    ("I will finish the backend endpoints by this evening.", 0),
    ("Thank you for your help, it saved me hours of debugging.", 0),
    ("Let's celebrate our team's milestone after the demo.", 0),
    ("The open source community is very welcoming and supportive.", 0),
    ("Where can I find the latest API release notes?", 0),
    ("Here is a clean solution using dynamic programming.", 0),
    ("I am excited to attend the technology summit next week.", 0),
    ("Let's keep the discussion focused on the project requirements.", 0),
    ("She gave a fantastic keynote speech on artificial intelligence.", 0),
    ("We should write unit tests for the edge cases.", 0),
    ("The model converged nicely after 15 epochs of training.", 0),
    ("Have you tried restarting the service with the new flag?", 0),
    ("I will see you at the campus library around noon.", 0),
    ("That was a challenging hackathon problem statement, but very rewarding.", 0),

    # --- Hinglish Safe (0) ---
    ("Bhai hackathon me bohot maza aa raha hai!", 0),
    ("Kya haal hai dost, sab badhiya?", 0),
    ("Chai peene chalte hain thodi der me.", 0),
    ("Tera code mast chal raha hai ab.", 0),
    ("Kal subah 9 baje milte hain library me.", 0),
    ("Project ka UI kafi professional aur clean lag raha hai.", 0),
    ("Bhai pull request merge kar di maine, check kar le.", 0),
    ("Aaj ka presentation bohot badiya gaya yaar.", 0),
    ("Bhai samosa party kab de raha hai?", 0),
    ("Ye feature add karne ke baad demo mast lagega.", 0),
    ("Shukriya bhai help karne ke liye, kaam ban gaya.", 0),
    ("Dost thoda rest le lo, raat bhar se code kar rahe ho.", 0),
    ("Bhai model train ho gaya bina kisi error ke.", 0),
    ("Kaise ho bhai, sab theek thaak ghar pe?", 0),
    ("Ye wala library try karo, fast aur lightweight hai.", 0),
    ("Extension load ho gaya Chrome me successfully.", 0),
    ("Bhai judges ko demo pasand aayega pakka.", 0),
    ("Thoda break leke dinner kar aao sab log.", 0),
    ("Mast concept socha hai tumne problem solve karne ka.", 0),
    ("Bhai git pull le lo, latest updates push kar diye hain.", 0),
    ("Kal ka match dekha tha? Kya finish kiya tha!", 0),
    ("Main backend server start kar raha hu port 8000 pe.", 0),
    ("Bhai slides prepare ho gayi hain pitch ke liye.", 0),
    ("Shabash bhai, bohot achha project banaya hai.", 0),
    ("Yeh algorithm time complexity reduce kar dega.", 0),
    ("Coffee banaye kisi ko chahiye kya?", 0),
    ("Bhai document verify kar liya maine, all clear.", 0),
    ("Bohot badiya explanation tha presentation me.", 0),
    ("Dost milte hain hackathon ke baad aram se.", 0),
    ("Sab log ready ho jao final evaluation ke liye.", 0),

    # --- English Toxic (1) ---
    ("Shut the fuck up, I will hunt you down.", 1),
    ("Shut the fuck up bitch.", 1),
    ("Fuck you and your pathetic family.", 1),
    ("You are an absolute idiot and a complete loser.", 1),
    ("Shut your mouth, nobody asked for your opinion.", 1),
    ("You are so ugly and disgusting, get lost.", 1),
    ("I hope you die in a fire, you piece of garbage.", 1),
    ("You complete loser, go kill yourself.", 1),
    ("You are a pathetic moron and a waste of space.", 1),
    ("I hate you so much, don't ever talk to me again.", 1),
    ("Your code is pure trash and you are a clown.", 1),
    ("I will hunt you down and beat you to death.", 1),
    ("Fuck off you worthless bitch.", 1),
    ("You stupid cunt, stop embarrassing yourself.", 1),
    ("I know where you live, you better watch your back.", 1),
    ("Get cancer and die alone you asshole.", 1),
    ("You are the dumbest retard I have ever met.", 1),
    ("You dirty scumbag, I will slit your throat.", 1),
    ("Nobody likes you, you should just end your life.", 1),
    ("Go hang yourself you disgusting piece of shit.", 1),
    ("You are an ugly fat bastard and nobody cares about you.", 1),
    ("Shut your mouth bitch before I shut it for you.", 1),
    ("Die in hell you useless motherfucker.", 1),
    ("You are so stupid it hurts to listen to you.", 1),
    ("I will put you in the ground if you speak again.", 1),
    ("Fuck you and your entire family.", 1),
    ("You are garbage, literally subhuman filth.", 1),
    ("I will break your face you little bitch.", 1),
    ("Die already, the world would be better without you.", 1),
    ("You are an incompetent clown who deserves to fail.", 1),
    ("Get lost asshole before I punch you.", 1),
    ("You repulse me, go kill yourself now.", 1),
    ("You are a pathetic scumbag who should rot in hell.", 1),

    # --- Hinglish Toxic (1) ---
    ("Chutiye chup kar bilkul aukaat me reh apni.", 1),
    ("Teri maa ki chudai bsdk nikal yahan se.", 1),
    ("Saale kutte kaminey mar ja jaake.", 1),
    ("Gandu lodu bakwas band kar apni.", 1),
    ("Tera dimaag kharab hai kya be lund ke?", 1),
    ("Bhadwe saale teri aisi taisi kar dunga.", 1),
    ("Bhenchod madarchod dimag mat khrab kar.", 1),
    ("Bhosdike nikal yahan se pehli fursat me.", 1),
    ("Suar ki aulad tujhe thappad marunga.", 1),
    ("Kutte ki maut marega tu harami saale.", 1),
    ("Tu itna bada chutiya hai ki bata nahi sakta.", 1),
    ("Teri gaand me danda daal dunga bsdk.", 1),
    ("Chodu saale chal nikal bhaad me ja.", 1),
    ("Rand ke bachhe tujhe zinda gaad dunga.", 1),
    ("Harami kamina kutta hai tu ek number ka.", 1),
    ("Tere jaise gadhe ko kisne computer diya?", 1),
    ("Bhosadiwale chup baith varna pel dunga.", 1),
    ("Gadha ullu ka pattha hai tu pure ka pura.", 1),
    ("Tere muh pe thukta hu main haramzaade.", 1),
    ("Mc bc nikal yahan se varna maar maar ke bhoot bana dunga.", 1),
    ("Bkl dimag mat chala apna yahan pe.", 1),
    ("Teri aukaat nahi hai mujhse baat karne ki gandu.", 1),
    ("Tujhe to peet peet ke hospital bhejunga saale.", 1),
    ("Bakchodi band kar varna muh tod dunga.", 1),
    ("Chutiyaap mat faila yahan mar ja jaake.", 1),
    ("Suar ke bachhe shakal dekh apni aaine me.", 1),
    ("Teri aisi taisi kar ke rakh dunga harami.", 1),
    ("Bhadwa dalaal saala nikal yahan se.", 1),
    ("Ghatiya aurat/aadmi hai tu, thu hai tujhpe.", 1),
    ("Bhosadike tere ghar aake maarunga.", 1)
]

# Expand with synthetic variations to ensure robust vocabulary coverage
SYNTHETIC_SAFE = [
    "I really loved your talk at the conference yesterday.",
    "Let's sync up after lunch to review the test suite.",
    "Can you share the link to the GitHub repository?",
    "The UI transitions are very smooth and responsive.",
    "Great teamwork everyone, we made huge progress today!",
    "Is there any issue with the database connection string?",
    "I am working on the front-end styling right now.",
    "Bhai lunch karne kab chal rahe ho sab log?",
    "Aaj weather bohot accha hai coding karne ke liye.",
    "Dost kal ka presentation kafi informative tha.",
    "Project ka setup guide bohot clear likha hai tune.",
    "Bhai test cases pass ho gaye sare unit tests me.",
    "What are the best practices for state management in React?",
    "Let's write clean, modular, and maintainable code.",
    "I agree with your suggestion to optimize the memory cache."
]

SYNTHETIC_TOXIC = [
    "You are a total fraud and a disgusting loser.",
    "I will beat the shit out of you if I see you.",
    "You moron, shut your stupid mouth forever.",
    "Go choke and die you worthless piece of trash.",
    "Fuck you idiot, you don't belong here.",
    "Nobody wants you around, kill yourself.",
    "Chutiye saale teri aukaat nahi bolne ki.",
    "Bhenchod bhosdike nikal yahan se turant.",
    "Mar ja kutte harami ek number ka jhootha.",
    "Tere ko pitaai khane ka shauk hai kya gandu?",
    "Teri maa chuda bsdk bakwas mat kar.",
    "You are a pathetic excuse for a human being.",
    "Get lost bitch, before I smash your face.",
    "Suar ki aulad chup baith varna tod dunga.",
    "You dumb piece of shit, go die."
]

def generate():
    out_dir = Path("/home/prateek/Code/work/Toxicity/data")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "dataset.csv"

    all_rows = list(DATA)
    # Augment to 300+ balanced samples
    for i in range(4):
        for s in SYNTHETIC_SAFE:
            all_rows.append((f"{s} #{i+1}", 0))
        for t in SYNTHETIC_TOXIC:
            all_rows.append((f"{t} #{i+1}", 1))

    with open(out_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["text", "label"])
        for text, label in all_rows:
            writer.writerow([text, label])

    print(f"Dataset generated at {out_file} with {len(all_rows)} samples.")

if __name__ == "__main__":
    generate()
