# Conversion Intelligence

A decision-support system for analyzing ad conversion data through qualitative interpretation.

## Running the App on Your Mac

### First Time Setup (One Time Only)

1. **Open Terminal** on your Mac:
   - Press `Command (⌘) + Space`
   - Type "Terminal"
   - Press Enter

2. **Install Node.js** (if you haven't already):
   ```bash
   brew install node
   ```

   If you don't have Homebrew, first install it:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

3. **Clone the project** (if you haven't already):
   ```bash
   git clone https://github.com/toddhamam/Ad-Conversion-Analysis-Interpretation.git
   cd Ad-Conversion-Analysis-Interpretation
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

### Every Time You Want to Run the App

1. **Open Terminal**

2. **Navigate to the project**:
   ```bash
   cd ~/Ad-Conversion-Analysis-Interpretation
   ```

3. **Start the server**:
   ```bash
   npm run dev
   ```

4. **Open your browser** and go to:
   ```
   http://localhost:5175
   ```

5. **To stop the server**: Press `Ctrl + C` in the Terminal

## Troubleshooting

### Blank Page?
- Check the Terminal for any error messages
- Make sure the server is running (you should see "Local: http://localhost:5175/")
- Try refreshing the browser
- Clear browser cache and refresh

### Can't Find Terminal?
- **Mac**: Press `Command + Space`, type "Terminal", press Enter
- You can have multiple Terminal windows open

### Lost Your Terminal Window?
- Press `Command + Tab` to switch between applications
- Or just open a new Terminal window and run the commands again

## What You'll See

The app includes:
- **Channels** - View conversions by acquisition channel
- **Meta Ads** - Traffic filters and creative performance
- **Concepts** - Psychological frameworks and belief frames
- **Products** - Product performance with revenue
- **Insights** - Qualitative analysis and learnings
