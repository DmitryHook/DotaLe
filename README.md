[🇷🇺 Читать на русском](README.RU.md)

<p>
  <img src="static/app-demo.gif" alt="DotaLe Demo" width="600">
</p>

# DotaLe — Hero Guesser

> **Guess the Dota 2 hero** by its characteristics: gender, species, role, attribute, attack type, complexity and release year.

---

## How to Play

1. Start typing a hero's name in the search field and select them from the list.
2. After each attempt, the tiles will change color to show how close your guess was:
   - 🟢 **Green** — Correct match
   - 🟡 **Yellow** — Partial match
   - 🔴 **Red** — Incorrect
3. If you get stuck, hints unlock automatically after several attempts:
   - 💬 **Voice line** — after 4 attempts
   - ⚡ **Ability** — after 8 attempts
   - 🖼 **Loading screen** — after 12 attempts
4. Try to guess the hero in as few attempts as possible!

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/DmitryHook/DotaLe
cd dotale
```

### 2. Create a virtual environment

```bash
python -m venv .venv
```

**cmd:**
```cmd
.venv\Scripts\activate.bat
```

**PowerShell:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.venv\Scripts\Activate.ps1
```

**Mac/Linux:**
```bash
source .venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Apply migrations

```bash
python manage.py migrate
```

### 5. Load data into the database

```bash
python manage.py fill_db
```

### 6. Run the server

```bash
python manage.py runserver
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser.

---

## Roadmap

- [x] Introduce harder hints: hidden voice line text, grayscale image filters, and cropped/shuffled image puzzles.
- [x] Track detailed statistics, including wins and attempts per game.
- [x] "Share Result" functionality featuring an emoji grid (Wordle-style).
- [x] A comprehensive encyclopedia of all heroes with advanced filtering by characteristics.
- [ ] Implement a points-based scoring system and a definitive "Game Over" state.
- [ ] Full multi-language support for English and Russian audiences.
- [ ] Addition of a Light Theme for improved accessibility and preference.
